import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { agentTokens, user } from "@/lib/db/schema";
import type { TokensStore } from "./store";

const summary = { id: agentTokens.id, name: agentTokens.name, createdAt: agentTokens.createdAt, expiresAt: agentTokens.expiresAt, lastUsedAt: agentTokens.lastUsedAt, revokedAt: agentTokens.revokedAt };

/** Drizzle implementation of `TokensStore`. Excluded from unit coverage; tests/integration/tokens-store.test.ts runs it on Postgres. */
export function createTokensStore(db: Db): TokensStore {
  return {
    async create(entry, now, expiresAt) {
      await db.insert(agentTokens).values({ ...entry, createdAt: now, expiresAt });
    },
    list: (userId) => db.select(summary).from(agentTokens).where(eq(agentTokens.userId, userId)).orderBy(desc(agentTokens.createdAt)),
    async revoke(userId, id, now) {
      const [row] = await db
        .update(agentTokens)
        .set({ revokedAt: now })
        .where(and(eq(agentTokens.id, id), eq(agentTokens.userId, userId), isNull(agentTokens.revokedAt)))
        .returning({ name: agentTokens.name });
      return row?.name ?? null;
    },
    async find(tokenHash) {
      const [row] = await db
        .select({ ...summary, userId: agentTokens.userId, login: user.login, suspendedAt: user.authSuspendedAt })
        .from(agentTokens)
        .innerJoin(user, eq(user.id, agentTokens.userId))
        .where(eq(agentTokens.tokenHash, tokenHash));
      return row ?? null;
    },
    async touch(id, now) {
      await db.update(agentTokens).set({ lastUsedAt: now }).where(eq(agentTokens.id, id));
    },
  };
}
