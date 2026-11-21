import { randomBytes } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashClaim, newAdminClaim } from "@/features/setup/domain/admin-claim";
import { manifestState, signSession } from "@/features/setup/domain/token";
import { createSetupStore } from "@/features/setup/server/drizzle-store";
import { createSetupService, SESSION_TTL_MS } from "@/features/setup/server/service";
import type { CompletedSetup } from "@/features/setup/server/store";
import { decrypt, parseKeyring } from "@/lib/crypto";
import { createDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import * as s from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let ctx: ReturnType<typeof createDb>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ctx = createDb(container.getConnectionUri());
  await runMigrations(ctx.db);
});
afterAll(async () => {
  await ctx?.pool.end();
  await container?.stop();
});
beforeEach(async () => {
  await ctx.db.execute(sql`truncate instance_settings, instance_admins cascade`);
});

const NOW = new Date("2026-03-01T10:00:00Z");
const claim = newAdminClaim(NOW, "claim-secret");
const data = (overrides: Partial<CompletedSetup> = {}): CompletedSetup => ({
  githubAppId: "42",
  githubAppSlug: "orrery-abc",
  githubClientId: "Iv1.abc",
  clientSecretCiphertext: "v1.k1.a.b",
  privateKeyCiphertext: "v1.k1.c.d",
  webhookSecretCiphertext: "v1.k1.e.f",
  encryptionKeyId: "k1",
  adminClaimHash: claim.hash,
  adminClaimExpiresAt: claim.expiresAt,
  completedAt: NOW,
  ...overrides,
});

describe("setup store on Postgres", () => {
  it("is not completed on an empty database, and completed after complete()", async () => {
    const store = createSetupStore(ctx.db);
    expect(await store.isCompleted()).toBe(false);
    expect(await store.complete(data())).toBe(true);
    expect(await store.isCompleted()).toBe(true);
    const [row] = await ctx.db.select().from(s.instanceSettings);
    expect(row).toMatchObject({ id: 1, githubAppSlug: "orrery-abc", encryptionKeyId: "k1", adminClaimHash: claim.hash });
  });

  it("completes only once: the second attempt changes nothing", async () => {
    const store = createSetupStore(ctx.db);
    expect(await store.complete(data())).toBe(true);
    expect(await store.complete(data({ githubAppSlug: "second-app", adminClaimHash: "other" }))).toBe(false);
    const [row] = await ctx.db.select().from(s.instanceSettings);
    expect(row.githubAppSlug).toBe("orrery-abc");
    expect(row.adminClaimHash).toBe(claim.hash);
  });

  it("lets exactly one of several concurrent completions win", async () => {
    const store = createSetupStore(ctx.db);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => store.complete(data({ githubAppSlug: `app-${i}` }))));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("completes an unfinished settings row instead of failing on it", async () => {
    await ctx.db.insert(s.instanceSettings).values({});
    const store = createSetupStore(ctx.db);
    expect(await store.isCompleted()).toBe(false);
    expect(await store.complete(data())).toBe(true);
    expect(await store.isCompleted()).toBe(true);
  });

  describe("admin claim", () => {
    it("makes one sign-in an admin, lowercased, and then the claim is gone", async () => {
      const store = createSetupStore(ctx.db);
      await store.complete(data());
      expect(await store.consumeAdminClaim(hashClaim("claim-secret"), NOW, "octo-cat")).toBe(true);
      expect(await store.consumeAdminClaim(hashClaim("claim-secret"), NOW, "second")).toBe(false);
      expect((await ctx.db.select().from(s.instanceAdmins)).map((r) => r.login)).toEqual(["octo-cat"]);
      const [row] = await ctx.db.select().from(s.instanceSettings);
      expect(row.adminClaimHash).toBeNull();
      expect(row.adminClaimExpiresAt).toBeNull();
    });
    it("lets only one of several concurrent sign-ins win", async () => {
      const store = createSetupStore(ctx.db);
      await store.complete(data());
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => store.consumeAdminClaim(hashClaim("claim-secret"), NOW, `user-${i}`)));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await ctx.db.select().from(s.instanceAdmins)).toHaveLength(1);
    });
    it("refuses a wrong secret, an expired claim, and an instance with no claim", async () => {
      const store = createSetupStore(ctx.db);
      expect(await store.consumeAdminClaim(hashClaim("claim-secret"), NOW, "nobody")).toBe(false);
      await store.complete(data());
      expect(await store.consumeAdminClaim(hashClaim("wrong"), NOW, "intruder")).toBe(false);
      expect(await store.consumeAdminClaim(hashClaim("claim-secret"), claim.expiresAt, "late")).toBe(false);
      expect(await ctx.db.select().from(s.instanceAdmins)).toEqual([]);
      expect(await store.consumeAdminClaim(hashClaim("claim-secret"), NOW, "right-one")).toBe(true);
    });
    it("does not fail when the login is already an admin, and still consumes the claim", async () => {
      await ctx.db.insert(s.instanceAdmins).values({ login: "octo-cat" });
      const store = createSetupStore(ctx.db);
      await store.complete(data());
      expect(await store.consumeAdminClaim(hashClaim("claim-secret"), NOW, "octo-cat")).toBe(true);
      expect(await ctx.db.select().from(s.instanceAdmins)).toHaveLength(1);
    });
  });

  it("runs the whole wizard against the real database: credentials stored encrypted, token dead afterwards", async () => {
    const token = "integration-token-".padEnd(43, "x");
    const keys = parseKeyring(`k1:${randomBytes(32).toString("base64")}`);
    const github = async () =>
      ({ status: 201, json: async () => ({ id: 7, slug: "orrery-int", client_id: "Iv1.int", client_secret: "CLIENT-SECRET", webhook_secret: "HOOK-SECRET", pem: "PEM-KEY" }) }) as Response;
    const service = createSetupService({ store: createSetupStore(ctx.db), token, keyring: () => keys, fetch: github as unknown as typeof fetch, now: () => NOW });
    const session = signSession(token, NOW, SESSION_TTL_MS);

    const done = await service.complete(session, manifestState(token, session), "abcdef1234567890");
    expect(done).toMatchObject({ ok: true, slug: "orrery-int" });

    const [row] = await ctx.db.select().from(s.instanceSettings).where(eq(s.instanceSettings.id, 1));
    const stored = JSON.stringify(row);
    for (const secret of ["CLIENT-SECRET", "HOOK-SECRET", "PEM-KEY"]) expect(stored).not.toContain(secret);
    expect(decrypt(row.clientSecretCiphertext as string, keys, "instance_settings.client_secret")).toBe("CLIENT-SECRET");

    expect(await service.login(token)).toMatchObject({ ok: false, issue: { code: "setup_already_completed" } });
    expect(done.ok && (await service.claimAdmin(done.claimSecret, "Octo-Cat"))).toBe(true);
    expect((await ctx.db.select().from(s.instanceAdmins)).map((r) => r.login)).toEqual(["octo-cat"]);
  });
});
