import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminStore } from "@/features/admin-settings/server/drizzle-store";
import { createAccessStore } from "@/features/access/server/drizzle-store";
import { createDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import * as s from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let ctx: ReturnType<typeof createDb>;
let store: ReturnType<typeof createAdminStore>;
let repoId: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ctx = createDb(container.getConnectionUri());
  await runMigrations(ctx.db);
  store = createAdminStore(ctx.db);
});
afterAll(async () => {
  await ctx?.pool.end();
  await container?.stop();
});
beforeEach(async () => {
  await ctx.db.execute(sql`truncate github_installations, "user", instance_settings, instance_admins, sign_in_allowlist, instance_allowed_hosts cascade`);
  await ctx.db.insert(s.user).values({ id: "u1", name: "Octo", email: "o@x.test", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  await ctx.db.insert(s.githubInstallations).values({ id: 1, accountLogin: "acme", accountType: "Organization" });
  [{ id: repoId }] = await ctx.db
    .insert(s.repositories)
    .values({ githubId: 1, installationId: 1, owner: "Acme", name: "Web", defaultBranch: "main", isPrivate: false })
    .returning({ id: s.repositories.id });
});

describe("admin settings store", () => {
  it("knows its admins, adds each once and removes them", async () => {
    expect(await store.isAdmin("octo")).toBe(false);
    expect(await store.addAdmin("octo", "u1")).toBe(true);
    expect(await store.addAdmin("octo", "u1")).toBe(false);
    expect(await store.addAdmin("alice", "u1")).toBe(true);
    expect(await store.isAdmin("octo")).toBe(true);
    expect(await store.admins()).toEqual(["alice", "octo"]);
    expect(await store.removeAdmin("alice")).toBe(true);
    expect(await store.removeAdmin("alice")).toBe(false);
  });
  it("edits the sign-in allowlist the access policy reads", async () => {
    expect(await store.addAllow({ kind: "org", value: "acme" }, "u1")).toBe(true);
    expect(await store.addAllow({ kind: "org", value: "acme" }, "u1")).toBe(false);
    await store.addAllow({ kind: "team", value: "acme/devs" }, "u1");
    expect(await store.allowlist()).toEqual([{ kind: "org", value: "acme" }, { kind: "team", value: "acme/devs" }]);
    expect(await createAccessStore(ctx.db).allowlist()).toHaveLength(2);
    expect(await store.removeAllow({ kind: "org", value: "acme" })).toBe(true);
    expect(await store.removeAllow({ kind: "org", value: "acme" })).toBe(false);
  });
  it("edits the instance's private hosts", async () => {
    expect(await store.addHost("10.0.0.0/8", "u1")).toBe(true);
    expect(await store.addHost("10.0.0.0/8", "u1")).toBe(false);
    await store.addHost("*.corp", "u1");
    expect(await store.hosts()).toEqual(["*.corp", "10.0.0.0/8"]);
    expect(await store.removeHost("*.corp")).toBe(true);
    expect(await store.removeHost("*.corp")).toBe(false);
  });
  it("adds and removes project rules, finding the project without regard to case, and refuses an unknown project", async () => {
    const team = { effect: "restrict_to", subject: { kind: "team", value: "acme/devs" } } as const;
    expect(await store.addRule({ owner: "acme", name: "web" }, { effect: "hide" }, "u1")).toBe(true);
    expect(await store.addRule({ owner: "acme", name: "web" }, { effect: "hide" }, "u1")).toBe(false);
    expect(await store.addRule({ owner: "ACME", name: "WEB" }, team, "u1")).toBe(true);
    expect(await store.addRule({ owner: "acme", name: "nope" }, team, "u1")).toBeNull();
    expect(await store.rules()).toEqual([{ project: "Acme/Web", rule: { effect: "hide" } }, { project: "Acme/Web", rule: team }]);
    expect(await createAccessStore(ctx.db).rulesFor({ owner: "acme", name: "web" })).toHaveLength(2);
    expect(await store.removeRule({ owner: "acme", name: "web" }, team)).toBe(true);
    expect(await store.removeRule({ owner: "acme", name: "web" }, team)).toBe(false);
    expect(await store.removeRule({ owner: "acme", name: "web" }, { effect: "hide" })).toBe(true);
    expect(await store.removeRule({ owner: "acme", name: "nope" }, { effect: "hide" })).toBe(false);
  });
  it("finds the secrets sealed with another key and replaces them", async () => {
    const values = { repositoryId: repoId, name: "A", boundHosts: ["a.com"] };
    await ctx.db.insert(s.secrets).values([
      { ...values, ciphertext: "old", keyId: "k1" },
      { ...values, name: "B", ciphertext: "new", keyId: "k2" },
    ]);
    const stale = await store.staleSecrets("k2");
    expect(stale).toEqual([{ id: expect.any(String), repositoryId: repoId, name: "A", ciphertext: "old" }]);
    await store.saveSecret(stale[0]!.id, "sealed", "k2");
    expect(await store.staleSecrets("k2")).toEqual([]);
    expect((await ctx.db.select().from(s.secrets).where(eq(s.secrets.id, stale[0]!.id)))[0]).toMatchObject({ ciphertext: "sealed", keyId: "k2" });
  });
  it("reads and replaces the App credentials, leaving what is not given alone", async () => {
    expect(await store.appCiphertexts()).toEqual({});
    await ctx.db.insert(s.instanceSettings).values({ clientSecretCiphertext: "c1", privateKeyCiphertext: "p1", webhookSecretCiphertext: null, authSecretCiphertext: "a1", encryptionKeyId: "k1" });
    expect(await store.appCiphertexts()).toEqual({ clientSecret: "c1", privateKey: "p1", authSecret: "a1" });
    await store.saveAppCiphertexts({ clientSecret: "c2", privateKey: "p2", webhookSecret: "w2", authSecret: "a2" }, "k2");
    expect(await store.appCiphertexts()).toEqual({ clientSecret: "c2", privateKey: "p2", webhookSecret: "w2", authSecret: "a2" });
    await store.saveAppCiphertexts({}, "k3");
    const [row] = await ctx.db.select().from(s.instanceSettings);
    expect(row).toMatchObject({ encryptionKeyId: "k3", clientSecretCiphertext: "c2" });
  });
});
