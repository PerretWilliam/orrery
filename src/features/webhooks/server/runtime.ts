import { invalidatePermissions } from "@/features/access/server/registry";
import { SETTINGS_CONTEXT } from "@/features/setup/server/service";
import { decrypt, keyringFromEnv } from "@/lib/crypto";
import { getDb } from "@/lib/db/instance";
import { createWebhookHandler } from "./handler";
import { createWebhookStore } from "./drizzle-store";

/** The endpoint with its real dependencies: database, encryption keys, the live permission cache. */
export function getWebhookHandler() {
  const store = createWebhookStore(getDb());
  return createWebhookHandler({
    secret: async () => {
      const ciphertext = await store.secretCiphertext();
      return ciphertext === null ? null : decrypt(ciphertext, keyringFromEnv(), SETTINGS_CONTEXT.webhookSecret);
    },
    claim: (deliveryId, event, now) => store.claimDelivery(deliveryId, event, now),
    invalidate: invalidatePermissions,
    now: () => new Date(),
  });
}
