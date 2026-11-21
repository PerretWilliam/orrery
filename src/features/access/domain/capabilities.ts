import type { RepoPermission, RepoRef } from "@/features/repos/domain/git-provider";

/** What a user can do in the hub on one project. Derived only from their explicit GitHub permission on the repository. */
export type Capability = "view" | "manage_secrets" | "manage_hosts" | "reindex";

const VIEW: readonly Capability[] = ["view"];
const MANAGE: readonly Capability[] = ["view", "manage_secrets", "manage_hosts", "reindex"];

// write only differs from read in V2 (Kanban edits, issue creation); V1 is read-only.
const BY_PERMISSION = new Map<RepoPermission, readonly Capability[]>([
  ["none", []],
  ["read", VIEW],
  ["triage", VIEW],
  ["write", VIEW],
  ["maintain", MANAGE],
  ["admin", MANAGE],
]);

export function isRepoPermission(value: unknown): value is RepoPermission {
  return BY_PERMISSION.has(value as RepoPermission);
}

/** Fails closed: anything that is not a known permission grants nothing. */
export function capabilitiesOf(permission: unknown): ReadonlySet<Capability> {
  return new Set(BY_PERMISSION.get(permission as RepoPermission));
}

export function can(permission: unknown, capability: Capability): boolean {
  return capabilitiesOf(permission).has(capability);
}

/** GitHub names are case-insensitive, so the cache and the policy must not tell `Acme/Web` and `acme/web` apart. */
export const repoKey = (repo: RepoRef) => `${repo.owner}/${repo.name}`.toLowerCase();
export const userKey = (username: string) => username.toLowerCase();

/** What to forget in the permission cache: a repository, a user, both, or (empty) everything. */
export type PermissionScope = { repo?: RepoRef; username?: string };
