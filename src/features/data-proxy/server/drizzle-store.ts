import { eq, lt } from "drizzle-orm";
import type { SsrfPolicy } from "@/lib/ssrf-guard";
import type { Db } from "@/lib/db/client";
import {
  httpCache,
  instanceAllowedHosts,
  projectAllowedHosts,
} from "@/lib/db/schema";
import type { CacheStore } from "../domain/source-proxy";

/** Drizzle implementation of `CacheStore`. Excluded from unit coverage; tests/integration/http-cache-store.test.ts runs it on Postgres. */
export function createHttpCacheStore(db: Db): CacheStore {
  return {
    async get(key) {
      const [row] = await db
        .select()
        .from(httpCache)
        .where(eq(httpCache.key, key))
        .limit(1);
      return row
        ? {
            body: row.body,
            fetchedAt: row.fetchedAt,
            expiresAt: row.expiresAt,
            lastAccessedAt: row.lastAccessedAt,
          }
        : null;
    },
    async put(key, repositoryId, { body, fetchedAt, expiresAt }) {
      const values = {
        body,
        status: 200,
        fetchedAt,
        expiresAt,
        lastAccessedAt: fetchedAt,
      };
      await db
        .insert(httpCache)
        .values({ key, repositoryId, ...values })
        .onConflictDoUpdate({ target: httpCache.key, set: values });
    },
    async touch(key, at) {
      await db
        .update(httpCache)
        .set({ lastAccessedAt: at })
        .where(eq(httpCache.key, key));
    },
    async purgeUnusedSince(cutoff) {
      const removed = await db
        .delete(httpCache)
        .where(lt(httpCache.lastAccessedAt, cutoff))
        .returning({ key: httpCache.key });
      return removed.length;
    },
  };
}

/**
 * The hosts the SSRF guard is told about: the instance admin's list (the only one that can open private hosts) and the
 * project's list (which can only narrow). Read for every request, so a change applies at once.
 */
export const createSsrfPolicyLoader =
  (db: Db) =>
  async (repositoryId: string): Promise<SsrfPolicy> => {
    const [admin, project] = await Promise.all([
      db.select({ host: instanceAllowedHosts.host }).from(instanceAllowedHosts),
      db
        .select({ host: projectAllowedHosts.host })
        .from(projectAllowedHosts)
        .where(eq(projectAllowedHosts.repositoryId, repositoryId)),
    ]);
    return {
      adminAllow: admin.map((row) => row.host),
      projectAllow: project.map((row) => row.host),
    };
  };
