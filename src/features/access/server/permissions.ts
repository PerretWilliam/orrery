import type { GitProviderInterface, RepoPermission, RepoRef } from "@/features/repos/domain/git-provider";
import { can, capabilitiesOf, isRepoPermission, repoKey, userKey, type Capability, type PermissionScope } from "../domain/capabilities";
import { CACHE_TIMEOUT_MS, CACHE_TTL_MS, createGuardedCache } from "./guarded-cache";

export const PERMISSION_TTL_MS = CACHE_TTL_MS;
export const PERMISSION_TIMEOUT_MS = CACHE_TIMEOUT_MS;

export type PermissionServiceOptions = {
  provider: Pick<GitProviderInterface, "getUserPermission">;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
};

/** Explicit GitHub permission of a user on a repository. Every failure, and any answer that is not a known permission, means "none". */
export function createPermissionService({ provider, now, ttlMs, timeoutMs }: PermissionServiceOptions) {
  const cache = createGuardedCache<RepoPermission>({ deny: "none", what: "permission check", now, ttlMs, timeoutMs });

  async function permissionOf(repo: RepoRef, username: string): Promise<RepoPermission> {
    const key = `${repoKey(repo)}|${userKey(username)}`;
    const load = async () => {
      const answer = await provider.getUserPermission(repo, username);
      if (!isRepoPermission(answer)) throw new Error("the Git host returned an unknown permission");
      return answer;
    };
    return cache.get(key, load, { repo: repoKey(repo), username: userKey(username) });
  }

  return {
    permissionOf,
    capabilities: async (repo: RepoRef, username: string) => capabilitiesOf(await permissionOf(repo, username)),
    can: async (repo: RepoRef, username: string, capability: Capability) => can(await permissionOf(repo, username), capability),
    /** Forget what we know about a repository, a user, both, or (no argument) everyone. Called by the webhook handlers. */
    invalidate(scope: PermissionScope = {}) {
      const repo = scope.repo === undefined ? undefined : repoKey(scope.repo);
      const user = scope.username === undefined ? undefined : userKey(scope.username);
      cache.invalidate((key) => {
        const [cachedRepo, cachedUser] = key.split("|");
        return (repo === undefined || repo === cachedRepo) && (user === undefined || user === cachedUser);
      });
    },
  };
}

export type PermissionService = ReturnType<typeof createPermissionService>;
