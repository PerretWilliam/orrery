import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { account, instanceAdmins, instanceSettings, session, user } from "@/lib/db/schema";
import type { AuthStore } from "./store";

/** Drizzle implementation of `AuthStore`. Excluded from unit coverage; tests/integration/auth-store.test.ts runs it on Postgres. */
export function createAuthStore(db: Db): AuthStore {
  return {
    async isAdmin(login) {
      const [row] = await db.select({ login: instanceAdmins.login }).from(instanceAdmins).where(eq(instanceAdmins.login, login));
      return Boolean(row);
    },

    async userState(userId) {
      const [row] = await db.select({ login: user.login, suspendedAt: user.authSuspendedAt, image: user.image }).from(user).where(eq(user.id, userId));
      return row ?? null;
    },

    async suspend(userId, at) {
      // Keeps the first suspension date when several refreshes fail in a row.
      await db.update(user).set({ authSuspendedAt: at }).where(and(eq(user.id, userId), isNull(user.authSuspendedAt)));
    },

    async resume(userId) {
      await db.update(user).set({ authSuspendedAt: null }).where(and(eq(user.id, userId), isNotNull(user.authSuspendedAt)));
    },

    async deleteSession(sessionId) {
      await db.delete(session).where(eq(session.id, sessionId));
    },

    async githubAccountId(userId) {
      const [row] = await db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, "github")));
      return row?.id ?? null;
    },

    async githubApp() {
      const [row] = await db
        .select({ clientId: instanceSettings.githubClientId, clientSecretCiphertext: instanceSettings.clientSecretCiphertext })
        .from(instanceSettings)
        .where(and(eq(instanceSettings.id, 1), isNotNull(instanceSettings.setupCompletedAt)));
      return row?.clientId && row.clientSecretCiphertext ? { clientId: row.clientId, clientSecretCiphertext: row.clientSecretCiphertext } : null;
    },

    async authSecret() {
      const [row] = await db.select({ value: instanceSettings.authSecretCiphertext }).from(instanceSettings).where(eq(instanceSettings.id, 1));
      return row?.value ?? null;
    },

    async setAuthSecretIfAbsent(ciphertext) {
      const rows = await db
        .update(instanceSettings)
        .set({ authSecretCiphertext: ciphertext })
        .where(and(eq(instanceSettings.id, 1), isNotNull(instanceSettings.setupCompletedAt), isNull(instanceSettings.authSecretCiphertext)))
        .returning({ id: instanceSettings.id });
      return rows.length === 1;
    },
  };
}
