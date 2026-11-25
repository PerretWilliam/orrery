import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createProjectSettingsStore } from "@/features/project-settings/server/drizzle-store";
import { createSsrfPolicyLoader } from "@/features/data-proxy/server/drizzle-store";
import { createDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import * as s from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let ctx: ReturnType<typeof createDb>;
let store: ReturnType<typeof createProjectSettingsStore>;
let repoId: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ctx = createDb(container.getConnectionUri());
  await runMigrations(ctx.db);
  store = createProjectSettingsStore(ctx.db);
});
afterAll(async () => {
  await ctx?.pool.end();
  await container?.stop();
});
beforeEach(async () => {
  await ctx.db.execute(sql`truncate github_installations, "user" cascade`);
  await ctx.db.insert(s.user).values({ id: "u1", name: "Octo", email: "o@x.test", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  await ctx.db.insert(s.githubInstallations).values({ id: 1, accountLogin: "acme", accountType: "Organization" });
  [{ id: repoId }] = await ctx.db
    .insert(s.repositories)
    .values({ githubId: 1, installationId: 1, owner: "Acme", name: "Web", defaultBranch: "main", isPrivate: false })
    .returning({ id: s.repositories.id });
});

describe("project settings store", () => {
  it("finds a repository without regard to case, and knows an unknown one", async () => {
    expect(await store.repositoryId({ owner: "acme", name: "web" })).toBe(repoId);
    expect(await store.repositoryId({ owner: "acme", name: "other" })).toBeNull();
  });
  it("adds each host once, lists them sorted, and removes them", async () => {
    expect(await store.addHost(repoId, "b.com", "u1")).toBe(true);
    expect(await store.addHost(repoId, "a.com", "u1")).toBe(true);
    expect(await store.addHost(repoId, "a.com", "u1")).toBe(false);
    expect(await store.hosts(repoId)).toEqual(["a.com", "b.com"]);
    expect(await store.removeHost(repoId, "a.com")).toBe(true);
    expect(await store.removeHost(repoId, "a.com")).toBe(false);
    expect(await store.hosts(repoId)).toEqual(["b.com"]);
  });
  it("is what the SSRF policy reads for the project, at once", async () => {
    await store.addHost(repoId, "api.example.com", "u1");
    expect((await createSsrfPolicyLoader(ctx.db)(repoId)).projectAllow).toEqual(["api.example.com"]);
  });
});
