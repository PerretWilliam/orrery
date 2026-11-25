import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createHttpCacheStore,
  createSsrfPolicyLoader,
} from "@/features/data-proxy/server/drizzle-store";
import { createDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import * as s from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let ctx: ReturnType<typeof createDb>;
let store: ReturnType<typeof createHttpCacheStore>;
let repoA: string;
let repoB: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ctx = createDb(container.getConnectionUri());
  await runMigrations(ctx.db);
  store = createHttpCacheStore(ctx.db);
});
afterAll(async () => {
  await ctx?.pool.end();
  await container?.stop();
});
beforeEach(async () => {
  await ctx.db.execute(
    sql`truncate github_installations, instance_allowed_hosts cascade`,
  );
  await ctx.db
    .insert(s.githubInstallations)
    .values({ id: 1, accountLogin: "acme", accountType: "Organization" });
  const repo = (githubId: number) => ({
    githubId,
    installationId: 1,
    owner: "acme",
    name: `r${githubId}`,
    defaultBranch: "main",
    isPrivate: false,
  });
  const rows = await ctx.db
    .insert(s.repositories)
    .values([repo(1), repo(2)])
    .returning({ id: s.repositories.id });
  [repoA, repoB] = rows.map((r) => r.id);
});

const T0 = new Date("2026-03-01T10:00:00Z");
const entry = (body: unknown, at = T0, ttlMs = 60_000) => ({
  body,
  fetchedAt: at,
  expiresAt: new Date(at.getTime() + ttlMs),
});

describe("http cache store", () => {
  it("has nothing for an unknown key", async () => {
    expect(await store.get("nope")).toBeNull();
  });
  it("stores and returns an entry, JSON body included", async () => {
    const body = { a: [1, 2, { b: null }], c: "x" };
    await store.put("k1", repoA, entry(body));
    expect(await store.get("k1")).toEqual({
      ...entry(body),
      lastAccessedAt: T0,
    });
  });
  it("stores any JSON value, null and false included", async () => {
    await store.put("n", repoA, entry(null));
    await store.put("f", repoA, entry(false));
    expect((await store.get("n"))?.body).toBeNull();
    expect((await store.get("f"))?.body).toBe(false);
  });
  it("replaces an entry with the same key", async () => {
    await store.put("k1", repoA, entry("old"));
    await store.put("k1", repoA, entry("new", new Date(T0.getTime() + 1000)));
    expect(await store.get("k1")).toMatchObject({
      body: "new",
      fetchedAt: new Date(T0.getTime() + 1000),
    });
    expect(await ctx.db.select().from(s.httpCache)).toHaveLength(1);
  });
  it("only touches the last access", async () => {
    await store.put("k1", repoA, entry("v"));
    const later = new Date(T0.getTime() + 3600_000);
    await store.touch("k1", later);
    expect(await store.get("k1")).toEqual({
      ...entry("v"),
      lastAccessedAt: later,
    });
  });
  it("forgets only what was not read since the cutoff, and counts it", async () => {
    await store.put("old", repoA, entry("o"));
    await store.put("recent", repoA, entry("r"));
    await store.put("touched", repoB, entry("t"));
    await store.touch("recent", new Date(T0.getTime() + 8 * 24 * 3600_000));
    await store.touch("touched", new Date(T0.getTime() + 7 * 24 * 3600_000));
    const cutoff = new Date(T0.getTime() + 7 * 24 * 3600_000);
    expect(await store.purgeUnusedSince(cutoff)).toBe(1);
    expect(await store.get("old")).toBeNull();
    expect(await store.get("recent")).not.toBeNull();
    expect(await store.get("touched")).not.toBeNull();
    expect(await store.purgeUnusedSince(cutoff)).toBe(0);
  });
  it("disappears with its repository", async () => {
    await store.put("k1", repoA, entry("v"));
    await ctx.db.delete(s.repositories);
    expect(await store.get("k1")).toBeNull();
  });
});

describe("ssrf policy loader", () => {
  it("returns the instance's list and the project's own, never another project's", async () => {
    const load = createSsrfPolicyLoader(ctx.db);
    expect(await load(repoA)).toEqual({ adminAllow: [], projectAllow: [] });
    await ctx.db
      .insert(s.instanceAllowedHosts)
      .values([{ host: "nas.lan" }, { host: "*.corp.example" }]);
    await ctx.db.insert(s.projectAllowedHosts).values([
      { repositoryId: repoA, host: "api.example.com" },
      { repositoryId: repoB, host: "other.example.com" },
    ]);
    const policy = await load(repoA);
    expect([...(policy.adminAllow ?? [])].sort()).toEqual([
      "*.corp.example",
      "nas.lan",
    ]);
    expect(policy.projectAllow).toEqual(["api.example.com"]);
  });
});
