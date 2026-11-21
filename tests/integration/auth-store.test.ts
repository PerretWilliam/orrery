import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthSecret } from "@/features/auth/server/auth-secret";
import { createAuthStore } from "@/features/auth/server/drizzle-store";
import { parseKeyring } from "@/lib/crypto";
import { createDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import * as s from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let ctx: ReturnType<typeof createDb>;
let store: ReturnType<typeof createAuthStore>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ctx = createDb(container.getConnectionUri());
  await runMigrations(ctx.db);
  store = createAuthStore(ctx.db);
});
afterAll(async () => {
  await ctx?.pool.end();
  await container?.stop();
});
beforeEach(async () => {
  await ctx.db.execute(sql`truncate "user", instance_settings, instance_admins cascade`);
});

const T0 = new Date("2026-03-01T10:00:00Z");
const keyring = parseKeyring(`k1:${Buffer.alloc(32, 7).toString("base64")}`);

async function addUser(id = "u1", login: string | null = "octo") {
  await ctx.db.insert(s.user).values({ id, name: "Octo", email: `${id}@x.test`, login, githubId: id === "u1" ? 1 : 2 });
}
async function finishSetup() {
  await ctx.db.insert(s.instanceSettings).values({ id: 1, setupCompletedAt: T0, githubClientId: "Iv1.abc", clientSecretCiphertext: "v1.k1.a.b" });
}

describe("admins and users", () => {
  it("knows admins by lowercase login", async () => {
    await ctx.db.insert(s.instanceAdmins).values({ login: "octo" });
    expect(await store.isAdmin("octo")).toBe(true);
    expect(await store.isAdmin("other")).toBe(false);
  });

  it("reads a user's login and suspension, and nothing for an unknown id", async () => {
    await addUser();
    expect(await store.userState("u1")).toEqual({ login: "octo", suspendedAt: null });
    expect(await store.userState("missing")).toBeNull();
  });

  it("suspends once (the first date is kept) and resumes", async () => {
    await addUser();
    await store.suspend("u1", T0);
    await store.suspend("u1", new Date(T0.getTime() + 1000));
    expect((await store.userState("u1"))?.suspendedAt).toEqual(T0);
    await store.resume("u1");
    expect((await store.userState("u1"))?.suspendedAt).toBeNull();
  });
});

describe("sessions and accounts", () => {
  it("deletes one session only", async () => {
    await addUser();
    const base = { userId: "u1", expiresAt: T0 };
    await ctx.db.insert(s.session).values([
      { id: "s1", token: "t1", ...base },
      { id: "s2", token: "t2", ...base },
    ]);
    await store.deleteSession("s1");
    expect((await ctx.db.select({ id: s.session.id }).from(s.session)).map((r) => r.id)).toEqual(["s2"]);
  });

  it("finds the GitHub account of a user, and no other provider's", async () => {
    await addUser();
    await ctx.db.insert(s.account).values([
      { id: "a-other", accountId: "1", providerId: "google", userId: "u1" },
      { id: "a-gh", accountId: "1", providerId: "github", userId: "u1" },
    ]);
    expect(await store.githubAccountId("u1")).toBe("a-gh");
    await addUser("u2", "other");
    expect(await store.githubAccountId("u2")).toBeNull();
  });
});

describe("instance settings", () => {
  it("has no GitHub App until setup is completed", async () => {
    expect(await store.githubApp()).toBeNull();
    await ctx.db.insert(s.instanceSettings).values({ id: 1, githubClientId: "Iv1.abc", clientSecretCiphertext: "v1.k1.a.b" });
    expect(await store.githubApp()).toBeNull();
    await ctx.db.update(s.instanceSettings).set({ setupCompletedAt: T0 });
    expect(await store.githubApp()).toEqual({ clientId: "Iv1.abc", clientSecretCiphertext: "v1.k1.a.b" });
  });

  it("stores the authentication secret once, whoever asks first, and not before setup", async () => {
    expect(await store.setAuthSecretIfAbsent("v1.k1.x.y")).toBe(false);
    await finishSetup();
    expect(await store.authSecret()).toBeNull();
    expect(await store.setAuthSecretIfAbsent("v1.k1.first.one")).toBe(true);
    expect(await store.setAuthSecretIfAbsent("v1.k1.second.one")).toBe(false);
    expect(await store.authSecret()).toBe("v1.k1.first.one");
  });

  it("gives every process the same secret even when they start together", async () => {
    await finishSetup();
    const secrets = await Promise.all(Array.from({ length: 5 }, () => loadAuthSecret(store, keyring)));
    expect(new Set(secrets).size).toBe(1);
    const [row] = await ctx.db.select({ c: s.instanceSettings.authSecretCiphertext }).from(s.instanceSettings).where(eq(s.instanceSettings.id, 1));
    expect(row.c).not.toContain(secrets[0]);
  });
});
