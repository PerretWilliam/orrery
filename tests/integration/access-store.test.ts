import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAccessStore } from "@/features/access/server/drizzle-store";
import { createDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import * as s from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let ctx: ReturnType<typeof createDb>;
let store: ReturnType<typeof createAccessStore>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ctx = createDb(container.getConnectionUri());
  await runMigrations(ctx.db);
  store = createAccessStore(ctx.db);
});
afterAll(async () => {
  await ctx?.pool.end();
  await container?.stop();
});
beforeEach(async () => {
  await ctx.db.execute(sql`truncate sign_in_allowlist, instance_admins, github_installations cascade`);
});

describe("allowlist", () => {
  it("is empty on a new instance", async () => {
    expect(await store.allowlist()).toEqual([]);
  });
  it("seeds only while empty, and never overwrites the admin's own entries", async () => {
    expect(await store.seedAllowlist([])).toBe(0);
    expect(await store.seedAllowlist([{ kind: "org", value: "acme" }, { kind: "org", value: "acme" }, { kind: "user", value: "alice" }])).toBe(2);
    expect(await store.seedAllowlist([{ kind: "user", value: "mallory" }])).toBe(0);
    expect((await store.allowlist()).map((e) => `${e.kind}:${e.value}`).sort()).toEqual(["org:acme", "user:alice"]);
  });
  it("lets two instances start at once without duplicating or failing", async () => {
    const results = await Promise.all([1, 2, 3].map(() => store.seedAllowlist([{ kind: "team", value: "acme/core" }])));
    expect(results.filter((n) => n === 1)).toHaveLength(1);
    expect(await store.allowlist()).toEqual([{ kind: "team", value: "acme/core" }]);
  });
});

describe("admins", () => {
  it("grants admin rights once and leaves existing admins alone", async () => {
    await store.grantAdmins([]);
    await store.grantAdmins(["octocat", "hubot"]);
    await store.grantAdmins(["octocat"]);
    const rows = await ctx.db.select({ login: s.instanceAdmins.login }).from(s.instanceAdmins);
    expect(rows.map((r) => r.login).sort()).toEqual(["hubot", "octocat"]);
  });
});

describe("rulesFor", () => {
  async function addRepo(owner: string, name: string, githubId: number) {
    await ctx.db.insert(s.githubInstallations).values({ id: 1, accountLogin: owner, accountType: "Organization" }).onConflictDoNothing();
    const [row] = await ctx.db.insert(s.repositories).values({ githubId, installationId: 1, owner, name, defaultBranch: "main", isPrivate: true }).returning({ id: s.repositories.id });
    return row.id;
  }
  it("has no rule for an unknown repository or one without rules", async () => {
    await addRepo("Acme", "Web", 10);
    expect(await store.rulesFor({ owner: "acme", name: "web" })).toEqual([]);
    expect(await store.rulesFor({ owner: "acme", name: "nope" })).toEqual([]);
  });
  it("returns the rules of one project, found without regard to case", async () => {
    const web = await addRepo("Acme", "Web", 10);
    const api = await addRepo("Acme", "Api", 11);
    await ctx.db.insert(s.projectRules).values([
      { repositoryId: web, effect: "restrict_to", subjectKind: "user", subjectValue: "Alice" },
      { repositoryId: web, effect: "restrict_to", subjectKind: "team", subjectValue: "acme/core" },
      { repositoryId: api, effect: "hide" },
    ]);
    expect(await store.rulesFor({ owner: "ACME", name: "web" })).toEqual(
      expect.arrayContaining([
        { effect: "restrict_to", subject: { kind: "user", value: "alice" } },
        { effect: "restrict_to", subject: { kind: "team", value: "acme/core" } },
      ]),
    );
    expect(await store.rulesFor({ owner: "acme", name: "api" })).toEqual([{ effect: "hide" }]);
  });
});
