import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSecretsStore } from "@/features/secrets/server/drizzle-store";
import { createDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import * as s from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let ctx: ReturnType<typeof createDb>;
let store: ReturnType<typeof createSecretsStore>;
let repoId: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ctx = createDb(container.getConnectionUri());
  await runMigrations(ctx.db);
  store = createSecretsStore(ctx.db);
});
afterAll(async () => {
  await ctx?.pool.end();
  await container?.stop();
});
beforeEach(async () => {
  await ctx.db.execute(sql`truncate github_installations, "user" cascade`);
  await ctx.db.insert(s.githubInstallations).values({ id: 1, accountLogin: "acme", accountType: "Organization" });
  [{ id: repoId }] = await ctx.db
    .insert(s.repositories)
    .values({ githubId: 1, installationId: 1, owner: "Acme", name: "Web", defaultBranch: "main", isPrivate: false })
    .returning({ id: s.repositories.id });
});

const entry = (over = {}) => ({ repositoryId: repoId, name: "A_KEY", ciphertext: "v1.k.iv.data", keyId: "k", boundHosts: ["a.com"], userId: "nobody", ...over });

describe("secrets store", () => {
  it("finds a repository without regard to case, and knows an unknown one", async () => {
    expect(await store.repositoryId({ owner: "acme", name: "web" })).toBe(repoId);
    expect(await store.repositoryId({ owner: "acme", name: "other" })).toBeNull();
  });
  it("creates a secret, replaces its value and hosts, and lists names and hosts only", async () => {
    await ctx.db.insert(s.user).values({ id: "u1", name: "Octo", email: "o@x.test", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
    await store.save(entry({ userId: "u1" }), new Date(1000));
    await store.save(entry({ ciphertext: "v1.k.iv.new", boundHosts: ["b.com", "c.com"] }), new Date(2000));
    await store.save(entry({ name: "B_KEY" }), new Date(3000));
    const listed = await store.list(repoId);
    expect(listed.map((x) => x.name)).toEqual(["A_KEY", "B_KEY"]);
    expect(listed[0]).toEqual({ name: "A_KEY", boundHosts: ["b.com", "c.com"], updatedAt: new Date(2000) });
    expect(Object.keys(listed[0])).not.toContain("ciphertext");
    const [row] = await ctx.db.select().from(s.secrets).where(sql`name = 'A_KEY'`);
    expect(row).toMatchObject({ ciphertext: "v1.k.iv.new", createdBy: "u1", createdAt: new Date(1000) });
  });
  it("deletes one secret, and says whether there was one", async () => {
    await store.save(entry(), new Date());
    expect(await store.remove(repoId, "A_KEY")).toBe(true);
    expect(await store.remove(repoId, "A_KEY")).toBe(false);
    expect(await store.list(repoId)).toEqual([]);
  });
});
