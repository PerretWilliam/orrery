import { and, eq, isNotNull, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { instanceSettings, webhookDeliveries } from "@/lib/db/schema";
import type { WebhookStore } from "./store";

export const DELIVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Drizzle implementation of `WebhookStore`. Excluded from unit coverage; tests/integration/webhook-store.test.ts runs it on Postgres. */
export function createWebhookStore(db: Db): WebhookStore {
  return {
    async secretCiphertext() {
      const [row] = await db
        .select({ value: instanceSettings.webhookSecretCiphertext })
        .from(instanceSettings)
        .where(and(eq(instanceSettings.id, 1), isNotNull(instanceSettings.setupCompletedAt)));
      return row?.value ?? null;
    },

    async claimDelivery(deliveryId, event, now) {
      await db.delete(webhookDeliveries).where(lt(webhookDeliveries.receivedAt, new Date(now.getTime() - DELIVERY_RETENTION_MS)));
      const rows = await db
        .insert(webhookDeliveries)
        .values({ deliveryId, event, receivedAt: now })
        .onConflictDoNothing()
        .returning({ id: webhookDeliveries.deliveryId });
      return rows.length === 1;
    },
  };
}
