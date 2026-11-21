import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { instanceAdmins, instanceSettings } from "@/lib/db/schema";
import type { SetupStore } from "./store";

/** Drizzle implementation of `SetupStore`. Excluded from unit coverage; tests/integration/setup-store.test.ts runs it on Postgres. */
export function createSetupStore(db: Db): SetupStore {
  return {
    async isCompleted() {
      const [row] = await db.select({ at: instanceSettings.setupCompletedAt }).from(instanceSettings).where(eq(instanceSettings.id, 1));
      return Boolean(row?.at);
    },

    async complete(data) {
      const values = {
        setupCompletedAt: data.completedAt,
        githubAppId: data.githubAppId,
        githubAppSlug: data.githubAppSlug,
        githubClientId: data.githubClientId,
        clientSecretCiphertext: data.clientSecretCiphertext,
        privateKeyCiphertext: data.privateKeyCiphertext,
        webhookSecretCiphertext: data.webhookSecretCiphertext,
        encryptionKeyId: data.encryptionKeyId,
        adminClaimHash: data.adminClaimHash,
        adminClaimExpiresAt: data.adminClaimExpiresAt,
      };
      // Atomic: the singleton row is inserted once, or an unfinished row is completed once. A finished one is left alone.
      const rows = await db
        .insert(instanceSettings)
        .values({ id: 1, ...values })
        .onConflictDoUpdate({ target: instanceSettings.id, set: { ...values, updatedAt: data.completedAt }, setWhere: isNull(instanceSettings.setupCompletedAt) })
        .returning({ id: instanceSettings.id });
      return rows.length === 1;
    },

    consumeAdminClaim(hash, now, login) {
      return db.transaction(async (tx) => {
        const claimed = await tx
          .update(instanceSettings)
          .set({ adminClaimHash: null, adminClaimExpiresAt: null, updatedAt: now })
          .where(and(eq(instanceSettings.id, 1), eq(instanceSettings.adminClaimHash, hash), gt(instanceSettings.adminClaimExpiresAt, now)))
          .returning({ id: instanceSettings.id });
        if (claimed.length === 0) return false;
        await tx.insert(instanceAdmins).values({ login }).onConflictDoNothing();
        return true;
      });
    },
  };
}
