import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTokensStore } from "@/features/agents/server/drizzle-store";
import { createDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import * as s from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let ctx: ReturnType<typeof createDb>;
let store: ReturnType<typeof createTokensStore>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ctx = createDb(container.getConnectionUri());
  await runMigrations(ctx.db);
  store = createTokensStore(ctx.db);
});
afterAll(async () => {
  await ctx?.pool.end();
  await container?.stop();
});
beforeEach(async () => {
  await ctx.db.execute(sql`truncate "user" cascade`);
  const base = { emailVerified: true, createdAt: new Date(), updatedAt: new Date() };
  await ctx.db.insert(s.user).values([
    { id: "u1", name: "Octo", email: "o@x.test", login: "octo", ...base },
    { id: "u2", name: "Other", email: "p@x.test", login: "other", ...base },
  ]);
});

const day = 86_400_000;
const make = (userId: string, name: string, hash: string, at: number) => store.create({ userId, name, tokenHash: hash }, new Date(at), new Date(at + 90 * day));

describe("tokens store", () => {
  it("lists a user's tokens newest first, revoked included, and never anyone else's or the hash", async () => {
    await make("u1", "old", "h1", 1000);
    await make("u1", "new", "h2", 2000);
    await make("u2", "theirs", "h3", 3000);
    const listed = await store.list("u1");
    expect(listed.map((t) => t.name)).toEqual(["new", "old"]);
    expect(Object.keys(listed[0])).not.toContain("tokenHash");
    expect(listed[0]).toMatchObject({ createdAt: new Date(2000), expiresAt: new Date(2000 + 90 * day), lastUsedAt: null, revokedAt: null });
  });
  it("revokes only the owner's live token, and returns its label", async () => {
    await make("u1", "mine", "h1", 1000);
    const [{ id }] = await store.list("u1");
    expect(await store.revoke("u2", id, new Date(5000))).toBeNull();
    expect(await store.revoke("u1", id, new Date(5000))).toBe("mine");
    expect(await store.revoke("u1", id, new Date(6000))).toBeNull();
    expect((await store.list("u1"))[0].revokedAt).toEqual(new Date(5000));
  });
  it("finds a token by hash with the state of its owner, and touches its last use", async () => {
    await make("u1", "mine", "h1", 1000);
    expect(await store.find("nope")).toBeNull();
    const found = await store.find("h1");
    expect(found).toMatchObject({ name: "mine", userId: "u1", login: "octo", suspendedAt: null, lastUsedAt: null });
    await store.touch(found!.id, new Date(7000));
    expect((await store.find("h1"))?.lastUsedAt).toEqual(new Date(7000));
    await ctx.db.update(s.user).set({ authSuspendedAt: new Date(8000) }).where(sql`id = 'u1'`);
    expect((await store.find("h1"))?.suspendedAt).toEqual(new Date(8000));
  });
  it("is removed with its owner", async () => {
    await make("u1", "mine", "h1", 1000);
    await ctx.db.execute(sql`delete from "user" where id = 'u1'`);
    expect(await store.find("h1")).toBeNull();
  });
});
