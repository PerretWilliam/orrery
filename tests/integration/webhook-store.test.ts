import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createWebhookStore, DELIVERY_RETENTION_MS } from "@/features/webhooks/server/drizzle-store";
import { createDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import * as s from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let ctx: ReturnType<typeof createDb>;
let store: ReturnType<typeof createWebhookStore>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ctx = createDb(container.getConnectionUri());
  await runMigrations(ctx.db);
  store = createWebhookStore(ctx.db);
});
afterAll(async () => {
  await ctx?.pool.end();
  await container?.stop();
});
beforeEach(async () => {
  await ctx.db.execute(sql`truncate webhook_deliveries, instance_settings cascade`);
});

const T0 = new Date("2026-03-01T10:00:00Z");

describe("secretCiphertext", () => {
  it("is null before the setup is finished, even if a value is already there", async () => {
    expect(await store.secretCiphertext()).toBeNull();
    await ctx.db.insert(s.instanceSettings).values({ id: 1, webhookSecretCiphertext: "v1.k1.a.b" });
    expect(await store.secretCiphertext()).toBeNull();
  });
  it("returns the ciphertext once the setup is finished", async () => {
    await ctx.db.insert(s.instanceSettings).values({ id: 1, setupCompletedAt: T0, webhookSecretCiphertext: "v1.k1.a.b" });
    expect(await store.secretCiphertext()).toBe("v1.k1.a.b");
  });
});

describe("claimDelivery", () => {
  it("accepts a delivery id once and refuses it afterwards", async () => {
    expect(await store.claimDelivery("d-1", "member", T0)).toBe(true);
    expect(await store.claimDelivery("d-1", "member", T0)).toBe(false);
    expect(await store.claimDelivery("d-2", "team", T0)).toBe(true);
  });
  it("lets two concurrent deliveries with the same id through only once", async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => store.claimDelivery("d-race", "member", T0)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("forgets ids older than the retention period", async () => {
    await store.claimDelivery("old", "member", T0);
    await store.claimDelivery("recent", "member", new Date(T0.getTime() + DELIVERY_RETENTION_MS - 1));
    expect(await store.claimDelivery("recent", "member", new Date(T0.getTime() + DELIVERY_RETENTION_MS + 1))).toBe(false);
    const rows = await ctx.db.select({ id: s.webhookDeliveries.deliveryId }).from(s.webhookDeliveries);
    expect(rows.map((r) => r.id)).toEqual(["recent"]);
  });
});
