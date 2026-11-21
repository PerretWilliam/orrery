import type { GitProviderInterface, RepoPermission, RepoRef } from "@/features/repos/domain/git-provider";
import { log } from "@/lib/logger";
import { can, capabilitiesOf, isRepoPermission, repoKey, userKey, type Capability } from "../domain/capabilities";

export const PERMISSION_TTL_MS = 5 * 60_000;
export const PERMISSION_TIMEOUT_MS = 5_000;

type Entry = { permission: RepoPermission; expiresAt: number };

export type PermissionServiceOptions = {
  provider: Pick<GitProviderInterface, "getUserPermission">;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
};

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer from the Git host within ${ms} ms`)), ms);
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

/**
 * Explicit GitHub permission of a user on a repository, cached for 5 minutes. Every failure (error, timeout, an answer
 * that is not a known permission) means "none", and a failure is never cached so the next request asks GitHub again.
 * In memory on purpose: V1 runs one replica. The cache only grows with users x repositories, which stays small.
 */
export function createPermissionService({ provider, now = Date.now, ttlMs = PERMISSION_TTL_MS, timeoutMs = PERMISSION_TIMEOUT_MS }: PermissionServiceOptions) {
  const cache = new Map<string, Entry>();
  const running = new Map<string, Promise<RepoPermission>>();
  // Bumped by every invalidation: an answer that was already in flight may predate the change and must not be stored.
  let generation = 0;

  /** null means the check failed; that is logged and denied by the caller, never cached. */
  async function ask(repo: RepoRef, username: string): Promise<RepoPermission | null> {
    try {
      const answer = await withTimeout((async () => provider.getUserPermission(repo, username))(), timeoutMs);
      if (!isRepoPermission(answer)) throw new Error("the Git host returned an unknown permission");
      return answer;
    } catch (error) {
      log("warn", "permission check failed, access denied", {
        repo: repoKey(repo),
        username: userKey(username),
        error: error instanceof Error ? error.message : "unknown error",
      });
      return null;
    }
  }

  async function permissionOf(repo: RepoRef, username: string): Promise<RepoPermission> {
    const key = `${repoKey(repo)}|${userKey(username)}`;
    const hit = cache.get(key);
    if (hit && now() < hit.expiresAt) return hit.permission;
    const joined = running.get(key);
    if (joined) return joined;
    const startedIn = generation;
    const flight = ask(repo, username)
      .then((answer) => {
        if (answer === null) return "none" as const;
        if (startedIn === generation) cache.set(key, { permission: answer, expiresAt: now() + ttlMs });
        return answer;
      })
      .finally(() => {
        if (running.get(key) === flight) running.delete(key);
      });
    running.set(key, flight);
    return flight;
  }

  return {
    permissionOf,
    capabilities: async (repo: RepoRef, username: string) => capabilitiesOf(await permissionOf(repo, username)),
    can: async (repo: RepoRef, username: string, capability: Capability) => can(await permissionOf(repo, username), capability),
    /** Forget what we know about a repository, a user, both, or (no argument) everyone. Called by the webhook handlers. */
    invalidate(scope: { repo?: RepoRef; username?: string } = {}) {
      generation += 1;
      running.clear();
      const repo = scope.repo === undefined ? undefined : repoKey(scope.repo);
      const user = scope.username === undefined ? undefined : userKey(scope.username);
      for (const key of [...cache.keys()]) {
        const [cachedRepo, cachedUser] = key.split("|");
        if ((repo === undefined || repo === cachedRepo) && (user === undefined || user === cachedUser)) cache.delete(key);
      }
    },
  };
}

export type PermissionService = ReturnType<typeof createPermissionService>;
