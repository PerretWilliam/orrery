import { parseConfig } from "@/features/config/domain/parse-config";
import { log } from "@/lib/logger";
import { chooseConfig, CONFIG_FILES, withWarning, type Candidates } from "../domain/discovery";
import type { GitProviderInterface, RepoRef, RepoSummary } from "../domain/git-provider";
import type { ConfigState, RepoStore, StoredRepo } from "./store";

export const CONCURRENCY = 5;
export type SyncReport = { checked: number; failed: number };

const NOTHING: StoredRepo = { configFile: null, configEtag: null, configSha: null, configIssues: null };

type Git = Pick<GitProviderInterface, "listInstallations" | "listRepositories" | "getFile">;
type Store = Pick<RepoStore, "saveInstallations" | "stored" | "find" | "save" | "clearUnseen">;

/**
 * Finds the repositories that have a `.hub.yml` (or `.repo-hub.yml`) at the root of their default branch and keeps what
 * the hub knows about them up to date. One conditional request per file, so a file that did not change costs nothing.
 * Runs are serialized, and a run asked for while another is queued joins it.
 */
export function createDiscovery({ git, store, now }: { git: Git; store: Store; now: () => Date }) {
  async function check(repo: RepoSummary, previous: StoredRepo | undefined): Promise<void> {
    const before = previous ?? NOTHING;
    const ask = (file: (typeof CONFIG_FILES)[number]) => git.getFile(repo, file, before.configFile === file ? (before.configEtag ?? undefined) : undefined);
    const [hub, legacy] = await Promise.all(CONFIG_FILES.map(ask));
    const { choice, both } = chooseConfig({ ".hub.yml": hub, ".repo-hub.yml": legacy } satisfies Candidates);
    let state: ConfigState;
    if (choice === null) {
      state = { ...NOTHING, lastValidConfig: null };
    } else if (choice.result.kind === "unchanged") {
      // Same bytes as last time: the parse result is what we stored, only the warning about the second file can differ.
      state = { ...before, configIssues: withWarning(before.configIssues, both), lastValidConfig: undefined };
    } else {
      const parsed = parseConfig(choice.result.content);
      state = {
        configFile: choice.file,
        configEtag: choice.result.etag,
        configSha: choice.result.sha,
        configIssues: withWarning(parsed.ok ? null : parsed.issues, both),
        lastValidConfig: parsed.ok ? parsed.config : undefined,
      };
    }
    await store.save(repo, state, now());
  }

  async function run(): Promise<SyncReport> {
    const installations = await git.listInstallations();
    const repos = await git.listRepositories();
    const known = await store.stored();
    await store.saveInstallations(installations, now());
    let failed = 0;
    for (let start = 0; start < repos.length; start += CONCURRENCY) {
      await Promise.all(
        repos.slice(start, start + CONCURRENCY).map(async (repo) => {
          try {
            await check(repo, known.get(repo.githubId));
          } catch (error) {
            failed++;
            log("warn", "repository discovery failed", { repo: `${repo.owner}/${repo.name}`, error: error instanceof Error ? error.message : "unknown error" });
          }
        }),
      );
    }
    // Only reached when the listing succeeded: a failing GitHub never makes projects disappear.
    await store.clearUnseen(
      repos.map((repo) => repo.githubId),
      now(),
    );
    return { checked: repos.length - failed, failed };
  }

  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };

  let queued: Promise<SyncReport> | undefined;

  return {
    /** Every repository of the App. Calls made while a run is waiting for its turn share that run. */
    syncAll(): Promise<SyncReport> {
      queued ??= serial(() => {
        queued = undefined;
        return run();
      });
      return queued;
    },

    /** One repository, after a push. A repository the hub has never seen means the App's repositories changed: everything is looked at. */
    refresh(repo: RepoRef): Promise<SyncReport> {
      return serial(async () => {
        const row = await store.find(repo);
        if (!row) return run();
        await check(row.summary, row.stored);
        return { checked: 1, failed: 0 };
      });
    },
  };
}

export type Discovery = ReturnType<typeof createDiscovery>;
