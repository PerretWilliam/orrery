import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuditStore } from "@/features/audit/server/drizzle-store";
import { createDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";

let container: StartedPostgreSqlContainer;
let ctx: ReturnType<typeof createDb>;
let store: ReturnType<typeof createAuditStore>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ctx = createDb(container.getConnectionUri());
  await runMigrations(ctx.db);
  store = createAuditStore(ctx.db);
});
afterAll(async () => {
  await ctx?.pool.end();
  await container?.stop();
});
beforeEach(async () => {
  // Truncate is not a row delete: the trigger does not stand in the way of a test reset.
  await ctx.db.execute(sql`truncate audit_log`);
});

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

describe("audit store", () => {
  it("appends and lists newest first, with the repository and the detail", async () => {
    await store.append({ event: "sign_in", actor: "ada", repository: null, detail: {} }, daysAgo(2));
    await store.append({ event: "secret_created", actor: "ada", repository: "acme/web", detail: { name: "API_KEY" } }, daysAgo(1));
    const rows = await store.list({ limit: 10 });
    expect(rows.map((r) => r.event)).toEqual(["secret_created", "sign_in"]);
    expect(rows[0]).toMatchObject({ actor: "ada", repository: "acme/web", detail: { name: "API_KEY" } });
    expect(rows[1]).toMatchObject({ repository: null, detail: {} });
  });
  it("filters by event, pages with `before`, and caps with `limit`", async () => {
    for (let i = 1; i <= 5; i++) await store.append({ event: i % 2 ? "sign_in" : "sign_out", actor: "ada", repository: null, detail: {} }, daysAgo(i));
    expect((await store.list({ limit: 10, event: "sign_out" })).map((r) => r.event)).toEqual(["sign_out", "sign_out"]);
    expect(await store.list({ limit: 2 })).toHaveLength(2);
    const older = await store.list({ limit: 10, before: daysAgo(3.5) });
    expect(older).toHaveLength(2);
  });
  it("refuses any update of an entry", async () => {
    await store.append({ event: "sign_in", actor: "ada", repository: null, detail: {} }, new Date());
    await expect(ctx.db.execute(sql`update audit_log set action = 'sign_out'`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append-only/) } });
  });
  it("refuses to delete an entry younger than a year, and lets the purge remove older ones", async () => {
    await store.append({ event: "sign_in", actor: "ada", repository: null, detail: {} }, daysAgo(10));
    await store.append({ event: "sign_in", actor: "old", repository: null, detail: {} }, daysAgo(400));
    await expect(ctx.db.execute(sql`delete from audit_log where actor_login = 'ada'`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/kept for a year/) } });
    expect(await store.purge(daysAgo(365))).toBe(1);
    expect((await store.list({ limit: 10 })).map((r) => r.actor)).toEqual(["ada"]);
  });
});
