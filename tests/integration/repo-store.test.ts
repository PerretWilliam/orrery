import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createProjectStore, createRepoStore } from "@/features/repos/server/drizzle-store";
import type { ConfigState } from "@/features/repos/server/store";
import type { RepoSummary } from "@/features/repos/domain/git-provider";
import { createDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import * as s from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let ctx: ReturnType<typeof createDb>;
let store: ReturnType<typeof createRepoStore>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ctx = createDb(container.getConnectionUri());
  await runMigrations(ctx.db);
  store = createRepoStore(ctx.db);
});
afterAll(async () => {
  await ctx?.pool.end();
  await container?.stop();
});
beforeEach(async () => {
  await ctx.db.execute(sql`truncate github_installations, instance_settings cascade`);
});

const T0 = new Date("2026-03-01T10:00:00Z");
const T1 = new Date("2026-03-01T10:05:00Z");
const installation = { id: 1, accountLogin: "acme", accountType: "Organization", suspended: false };
const repo = (id: number, over: Partial<RepoSummary> = {}): RepoSummary => ({ githubId: id, installationId: 1, owner: "acme", name: `r${id}`, defaultBranch: "main", isPrivate: true, archived: false, ...over });
const state = (over: Partial<ConfigState> = {}): ConfigState => ({ configFile: ".hub.yml", configEtag: "e1", configSha: "s1", configIssues: null, lastValidConfig: undefined, ...over });
const config = { version: 1 } as unknown as ConfigState["lastValidConfig"];

describe("installations", () => {
  it("are inserted, updated, and keep the time they were first seen suspended", async () => {
    await store.saveInstallations([], T0);
    await store.saveInstallations([installation, { ...installation, id: 2, suspended: true }], T0);
    await store.saveInstallations([{ ...installation, accountLogin: "acme-renamed" }, { ...installation, id: 2, suspended: true }], T1);
    const rows = await ctx.db.select().from(s.githubInstallations).orderBy(s.githubInstallations.id);
    expect(rows.map((r) => [r.id, r.accountLogin, r.suspendedAt])).toEqual([
      [1, "acme-renamed", null],
      [2, "acme", T0],
    ]);
    await store.saveInstallations([{ ...installation, id: 2 }], T1);
    expect((await ctx.db.select().from(s.githubInstallations).where(eq(s.githubInstallations.id, 2)))[0].suspendedAt).toBeNull();
  });
});

describe("save, stored and find", () => {
  beforeEach(() => store.saveInstallations([installation], T0));

  it("inserts a repository with its config, then updates it in place, keeping the last valid config when none is given", async () => {
    await store.save(repo(10), state({ lastValidConfig: config }), T0);
    await store.save(repo(10, { name: "renamed", archived: true }), state({ configEtag: "e2", configIssues: [{ code: "config_required", path: "x", message: "m", fix: "f" }] }), T1);
    const [row] = await ctx.db.select().from(s.repositories);
    expect(row).toMatchObject({ githubId: 10, name: "renamed", archived: true, configEtag: "e2", lastValidConfig: { version: 1 }, configCheckedAt: T1 });
    expect(row.configError).toEqual([{ code: "config_required", path: "x", message: "m", fix: "f" }]);
    expect(await store.stored()).toEqual(new Map([[10, { configFile: ".hub.yml", configEtag: "e2", configSha: "s1", configIssues: row.configError }]]));
  });
  it("forgets the last valid config when told so", async () => {
    await store.save(repo(10), state({ lastValidConfig: config }), T0);
    await store.save(repo(10), state({ configFile: null, configEtag: null, configSha: null, lastValidConfig: null }), T1);
    const [row] = await ctx.db.select().from(s.repositories);
    expect(row).toMatchObject({ configFile: null, lastValidConfig: null, configError: null });
  });
  it("finds a repository whatever the case of its name, and not another one", async () => {
    await store.save(repo(10), state(), T0);
    expect(await store.find({ owner: "ACME", name: "R10" })).toEqual({
      summary: repo(10),
      stored: { configFile: ".hub.yml", configEtag: "e1", configSha: "s1", configIssues: null },
    });
    expect(await store.find({ owner: "acme", name: "nope" })).toBeNull();
  });
});

describe("clearUnseen", () => {
  beforeEach(async () => {
    await store.saveInstallations([installation], T0);
    for (const id of [10, 11, 12]) await store.save(repo(id), state({ lastValidConfig: config }), T0);
  });

  it("forgets the config of the repositories that are not in the list, and keeps their rows", async () => {
    await store.clearUnseen([10], T1);
    const rows = await ctx.db.select().from(s.repositories).orderBy(s.repositories.githubId);
    expect(rows.map((r) => [r.githubId, r.configFile, r.lastValidConfig])).toEqual([
      [10, ".hub.yml", { version: 1 }],
      [11, null, null],
      [12, null, null],
    ]);
  });
  it("forgets everything when no repository is left", async () => {
    await store.clearUnseen([], T1);
    expect((await ctx.db.select().from(s.repositories)).every((r) => r.configFile === null)).toBe(true);
  });
});

describe("credentials and settings", () => {
  it("have nothing before the wizard has finished", async () => {
    expect(await store.credentials()).toBeNull();
    expect(await store.settings()).toEqual({ setup: false, pollIntervalSeconds: 300 });
    await ctx.db.insert(s.instanceSettings).values({ id: 1, githubAppId: "1", privateKeyCiphertext: "v1.k1.a.b" });
    expect(await store.credentials()).toBeNull();
    expect((await store.settings()).setup).toBe(false);
  });
  it("give the App id, the key's ciphertext and the polling period once it has", async () => {
    await ctx.db.insert(s.instanceSettings).values({ id: 1, setupCompletedAt: T0, githubAppId: "123", privateKeyCiphertext: "v1.k1.a.b", pollIntervalSeconds: 120 });
    expect(await store.credentials()).toEqual({ appId: "123", privateKeyCiphertext: "v1.k1.a.b" });
    expect(await store.settings()).toEqual({ setup: true, pollIntervalSeconds: 120 });
  });
  it("need a key to give credentials", async () => {
    await ctx.db.insert(s.instanceSettings).values({ id: 1, setupCompletedAt: T0, githubAppId: "123" });
    expect(await store.credentials()).toBeNull();
  });
});

describe("the project store", () => {
  beforeEach(() => store.saveInstallations([installation], T0));
  const projects = () => createProjectStore(ctx.db);

  it("lists the repositories that have a config file, with the last valid config and the issues", async () => {
    const issues = [{ code: "config_required" as const, path: "x", message: "m", fix: "f" }];
    await store.save(repo(1), state({ lastValidConfig: config }), T0);
    await store.save(repo(2), state({ configFile: null, configEtag: null, configSha: null }), T0);
    await store.save(repo(3, { isPrivate: false, archived: true }), state({ configIssues: issues }), T0);
    const rows = await projects().listConfigured();
    expect(rows.map((r) => [r.name, r.isPrivate, r.archived, r.config, r.issues])).toEqual(
      expect.arrayContaining([
        ["r1", true, false, { version: 1 }, null],
        ["r3", false, true, null, issues],
      ]),
    );
    expect(rows).toHaveLength(2);
  });
  it("views one by owner and name without case, and not one without a config file", async () => {
    await store.save(repo(1, { owner: "Acme", name: "Web" }), state({ lastValidConfig: config }), T0);
    await store.save(repo(2), state({ configFile: null, configEtag: null, configSha: null }), T0);
    expect(await projects().view({ owner: "acme", name: "web" })).toMatchObject({ owner: "Acme", name: "Web", config: { version: 1 } });
    expect(await projects().view({ owner: "acme", name: "r2" })).toBeNull();
    expect(await projects().view({ owner: "acme", name: "nope" })).toBeNull();
  });
});
