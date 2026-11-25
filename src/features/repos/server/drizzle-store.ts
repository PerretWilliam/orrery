import { and, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import type { ConfigIssue } from "@/features/config/domain/errors";
import type { Db } from "@/lib/db/client";
import { githubInstallations, instanceSettings, repositories } from "@/lib/db/schema";
import { DEFAULT_POLL_SECONDS, type ConfigFile } from "../domain/discovery";
import type { ProjectRow, ProjectStore } from "./projects";
import type { RepoStore, StoredRepo } from "./store";

type Row = typeof repositories.$inferSelect;

const stored = (row: Row): StoredRepo => ({
  configFile: row.configFile as ConfigFile | null, // the table's check constraint allows nothing else
  configEtag: row.configEtag,
  configSha: row.configSha,
  configIssues: row.configError as ConfigIssue[] | null, // only ever written by `save`
});

/** Drizzle implementation of `RepoStore`. Excluded from unit coverage; tests/integration/repo-store.test.ts runs it on Postgres. */
export function createRepoStore(db: Db): RepoStore {
  return {
    async saveInstallations(installations, now) {
      if (installations.length === 0) return;
      await db
        .insert(githubInstallations)
        .values(installations.map((i) => ({ id: i.id, accountLogin: i.accountLogin, accountType: i.accountType, suspendedAt: i.suspended ? now : null })))
        .onConflictDoUpdate({
          target: githubInstallations.id,
          set: {
            accountLogin: sql`excluded.account_login`,
            accountType: sql`excluded.account_type`,
            // The moment it was first seen suspended, not the last poll.
            suspendedAt: sql`case when excluded.suspended_at is null then null else coalesce(${githubInstallations.suspendedAt}, excluded.suspended_at) end`,
            updatedAt: now,
          },
        });
    },

    async stored() {
      const rows = await db.select().from(repositories);
      return new Map(rows.map((row) => [row.githubId, stored(row)]));
    },

    async find(repo) {
      const [row] = await db
        .select()
        .from(repositories)
        .where(sql`lower(${repositories.owner}) = lower(${repo.owner}) and lower(${repositories.name}) = lower(${repo.name})`);
      if (!row) return null;
      return {
        summary: { githubId: row.githubId, installationId: row.installationId, owner: row.owner, name: row.name, defaultBranch: row.defaultBranch, isPrivate: row.isPrivate, archived: row.archived },
        stored: stored(row),
      };
    },

    async credentials() {
      const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, 1));
      return row?.setupCompletedAt && row.githubAppId && row.privateKeyCiphertext ? { appId: row.githubAppId, privateKeyCiphertext: row.privateKeyCiphertext } : null;
    },

    async settings() {
      const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, 1));
      return { setup: Boolean(row?.setupCompletedAt), pollIntervalSeconds: row?.pollIntervalSeconds ?? DEFAULT_POLL_SECONDS };
    },

    async save(repo, state, now) {
      const values = {
        installationId: repo.installationId,
        owner: repo.owner,
        name: repo.name,
        defaultBranch: repo.defaultBranch,
        isPrivate: repo.isPrivate,
        archived: repo.archived,
        configFile: state.configFile,
        configSha: state.configSha,
        configEtag: state.configEtag,
        configError: state.configIssues,
        // undefined: the column is left as it is.
        lastValidConfig: state.lastValidConfig,
        configCheckedAt: now,
      };
      await db
        .insert(repositories)
        .values({ githubId: repo.githubId, ...values })
        .onConflictDoUpdate({ target: repositories.githubId, set: { ...values, updatedAt: now } });
    },

    async clearUnseen(seen, now) {
      await db
        .update(repositories)
        .set({ configFile: null, configSha: null, configEtag: null, configError: null, lastValidConfig: null, configCheckedAt: now, updatedAt: now })
        .where(and(isNotNull(repositories.configFile), seen.length === 0 ? undefined : notInArray(repositories.githubId, [...seen])));
    },
  };
}

const project = (row: Row): ProjectRow => ({
  id: row.id,
  owner: row.owner,
  name: row.name,
  isPrivate: row.isPrivate,
  archived: row.archived,
  config: row.lastValidConfig,
  issues: row.configError as ConfigIssue[] | null,
});

/** Drizzle implementation of `ProjectStore`; excluded from unit coverage like `createRepoStore`. */
export function createProjectStore(db: Db): ProjectStore {
  return {
    async listConfigured() {
      return (await db.select().from(repositories).where(isNotNull(repositories.configFile))).map(project);
    },
    async view(repo) {
      const [row] = await db
        .select()
        .from(repositories)
        .where(and(isNotNull(repositories.configFile), sql`lower(${repositories.owner}) = lower(${repo.owner}) and lower(${repositories.name}) = lower(${repo.name})`));
      return row ? project(row) : null;
    },
  };
}
