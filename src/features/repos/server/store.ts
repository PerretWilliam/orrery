import type { ConfigIssue } from "@/features/config/domain/errors";
import type { ConfigV1 } from "@/features/config/domain/schema-v1";
import type { ConfigFile } from "../domain/discovery";
import type { InstallationSummary, RepoRef, RepoSummary } from "../domain/git-provider";

/** What the last look at a repository left in the database. */
export type StoredRepo = { configFile: ConfigFile | null; configEtag: string | null; configSha: string | null; configIssues: ConfigIssue[] | null };

/** What one look found. `lastValidConfig`: `undefined` keeps the previous valid config, `null` forgets it. */
export type ConfigState = StoredRepo & { lastValidConfig: ConfigV1 | null | undefined };

/** What discovery needs from the database. The Drizzle implementation is tested against Postgres. */
export type RepoStore = {
  saveInstallations(installations: readonly InstallationSummary[], now: Date): Promise<void>;
  /** Every known repository, by GitHub id. */
  stored(): Promise<Map<number, StoredRepo>>;
  find(repo: RepoRef): Promise<{ summary: RepoSummary; stored: StoredRepo } | null>;
  /** The App's id and the ciphertext of its private key; `null` until the first-run wizard has finished. */
  credentials(): Promise<{ appId: string; privateKeyCiphertext: string } | null>;
  /** `setup`: the wizard has finished. `pollIntervalSeconds` is as stored; the poller applies the one-minute floor. */
  settings(): Promise<{ setup: boolean; pollIntervalSeconds: number }>;
  save(repo: RepoSummary, state: ConfigState, now: Date): Promise<void>;
  /** Forgets the config of every repository whose id is not in `seen` (removed from the App, or the App uninstalled). The rows stay: the admin's rules hang off them. */
  clearUnseen(seen: readonly number[], now: Date): Promise<void>;
};
