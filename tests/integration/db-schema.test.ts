import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/client";
import { runMigrations, SchemaTooNewError } from "@/lib/db/migrate";
import * as s from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let ctx: ReturnType<typeof createDb>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ctx = createDb(container.getConnectionUri());
});
afterAll(async () => {
  await ctx?.pool.end();
  await container?.stop();
});

const rows = async (query: ReturnType<typeof sql>) => (await ctx.db.execute(query)).rows;

describe("migrations", () => {
  it("apply on an empty database and are idempotent", async () => {
    await runMigrations(ctx.db);
    await runMigrations(ctx.db);
    const tables = await rows(sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
    expect(tables.map((r) => r.table_name)).toEqual(
      expect.arrayContaining(["user", "session", "repositories", "secrets", "http_cache", "audit_log", "agent_tokens"]),
    );
  });

  it("creates every index declared in the schema", async () => {
    const present = (await rows(sql`select indexname from pg_indexes where schemaname = 'public'`)).map((r) => r.indexname);
    for (const name of ["session_token_uq", "repositories_with_config_idx", "secrets_key_id_idx", "http_cache_last_accessed_idx", "audit_log_action_at_idx"]) {
      expect(present).toContain(name);
    }
  });

  it("refuses to start on a schema newer than the app", async () => {
    await ctx.db.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('future', 99999999999999)`);
    await expect(runMigrations(ctx.db)).rejects.toBeInstanceOf(SchemaTooNewError);
    await ctx.db.execute(sql`delete from drizzle.__drizzle_migrations where hash = 'future'`);
  });
});

describe("constraints", () => {
  const seed = async () => {
    await ctx.db.insert(s.user).values({ id: "u1", name: "Octo", email: "octo@example.com", login: "Octo" });
    await ctx.db.insert(s.githubInstallations).values({ id: 1, accountLogin: "octo", accountType: "User" });
    const [repo] = await ctx.db
      .insert(s.repositories)
      .values({ githubId: 10, installationId: 1, owner: "Octo", name: "Hello", defaultBranch: "main", isPrivate: true })
      .returning();
    return repo.id;
  };
  let repoId: string;
  beforeAll(async () => {
    repoId = await seed();
  });

  it("matches usernames and repository names case-insensitively", async () => {
    await expect(ctx.db.insert(s.user).values({ id: "u2", name: "x", email: "x@example.com", login: "OCTO" })).rejects.toThrow();
    await expect(
      ctx.db.insert(s.repositories).values({ githubId: 11, installationId: 1, owner: "octo", name: "hello", defaultBranch: "main", isPrivate: true }),
    ).rejects.toThrow();
  });

  it("rejects a secret bound to no host and a duplicate name", async () => {
    const base = { repositoryId: repoId, name: "API", ciphertext: "c", keyId: "k1" };
    await expect(ctx.db.insert(s.secrets).values({ ...base, boundHosts: [] })).rejects.toThrow();
    await ctx.db.insert(s.secrets).values({ ...base, boundHosts: ["api.example.com"] });
    await expect(ctx.db.insert(s.secrets).values({ ...base, boundHosts: ["api.example.com"] })).rejects.toThrow();
  });

  it("allows a single instance_settings row and a poll interval of at least 60 s", async () => {
    await expect(ctx.db.insert(s.instanceSettings).values({ id: 2 })).rejects.toThrow();
    await expect(ctx.db.insert(s.instanceSettings).values({ pollIntervalSeconds: 30 })).rejects.toThrow();
    await ctx.db.insert(s.instanceSettings).values({});
    await expect(ctx.db.insert(s.instanceSettings).values({})).rejects.toThrow();
  });

  it("keeps project rules well formed and unique", async () => {
    await expect(ctx.db.insert(s.projectRules).values({ repositoryId: repoId, effect: "hide", subjectKind: "user", subjectValue: "a" })).rejects.toThrow();
    await expect(ctx.db.insert(s.projectRules).values({ repositoryId: repoId, effect: "restrict_to" })).rejects.toThrow();
    await ctx.db.insert(s.projectRules).values({ repositoryId: repoId, effect: "hide" });
    await expect(ctx.db.insert(s.projectRules).values({ repositoryId: repoId, effect: "hide" })).rejects.toThrow();
  });

  it("caps agent token lifetime at one year and stores unique hashes", async () => {
    const now = new Date();
    const day = 86_400_000;
    const token = { userId: "u1", name: "ci", tokenHash: "h1", createdAt: now };
    await expect(ctx.db.insert(s.agentTokens).values({ ...token, expiresAt: new Date(+now + 400 * day) })).rejects.toThrow();
    await ctx.db.insert(s.agentTokens).values({ ...token, expiresAt: new Date(+now + 90 * day) });
    await expect(ctx.db.insert(s.agentTokens).values({ ...token, expiresAt: new Date(+now + 90 * day) })).rejects.toThrow();
  });

  it("cascades repository deletion and keeps the audit log when a user is deleted", async () => {
    await ctx.db.insert(s.auditLog).values({ actorUserId: "u1", actorLogin: "octo", action: "sign_in" });
    await ctx.db.delete(s.repositories);
    expect(await rows(sql`select 1 from secrets`)).toHaveLength(0);
    await ctx.db.delete(s.user);
    const [entry] = await rows(sql`select actor_user_id, actor_login from audit_log`);
    expect(entry).toEqual({ actor_user_id: null, actor_login: "octo" });
  });
});
