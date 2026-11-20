import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkReadiness } from "@/features/ops/server/check-readiness";
import { createDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";

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

describe("readiness against a real database", () => {
  it("is not ready before migrations, ready after, not ready on a newer schema", async () => {
    expect(await checkReadiness(() => ctx.db)).toEqual({ ready: false, reason: "migrations_pending" });
    await runMigrations(ctx.db);
    expect(await checkReadiness(() => ctx.db)).toEqual({ ready: true });
    await ctx.db.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('future', 99999999999999)`);
    expect(await checkReadiness(() => ctx.db)).toEqual({ ready: false, reason: "schema_too_new" });
  });

  it("is not ready when the database is unreachable", async () => {
    const dead = createDb("postgres://u:p@127.0.0.1:1/none");
    expect(await checkReadiness(() => dead.db)).toEqual({ ready: false, reason: "database_unreachable" });
    await dead.pool.end();
  });
});
