import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { projectAllowedHosts, repositories } from "@/lib/db/schema";
import type { ProjectSettingsStore } from "./store";

/** Drizzle implementation of `ProjectSettingsStore`. Excluded from unit coverage; tests/integration/project-settings-store.test.ts runs it on Postgres. */
export function createProjectSettingsStore(db: Db): ProjectSettingsStore {
  return {
    async repositoryId(repo) {
      const [row] = await db
        .select({ id: repositories.id })
        .from(repositories)
        .where(sql`lower(${repositories.owner}) = lower(${repo.owner}) and lower(${repositories.name}) = lower(${repo.name})`);
      return row?.id ?? null;
    },
    async hosts(repositoryId) {
      const rows = await db.select({ host: projectAllowedHosts.host }).from(projectAllowedHosts).where(eq(projectAllowedHosts.repositoryId, repositoryId)).orderBy(projectAllowedHosts.host);
      return rows.map((row) => row.host);
    },
    async addHost(repositoryId, host, userId) {
      const added = await db.insert(projectAllowedHosts).values({ repositoryId, host, createdBy: userId }).onConflictDoNothing().returning({ id: projectAllowedHosts.id });
      return added.length > 0;
    },
    async removeHost(repositoryId, host) {
      const gone = await db.delete(projectAllowedHosts).where(and(eq(projectAllowedHosts.repositoryId, repositoryId), eq(projectAllowedHosts.host, host))).returning({ id: projectAllowedHosts.id });
      return gone.length > 0;
    },
  };
}
