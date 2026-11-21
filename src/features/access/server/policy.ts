import type { GitProviderInterface, RepoRef } from "@/features/repos/domain/git-provider";
import { userKey, type Capability, type PermissionScope } from "../domain/capabilities";
import { projectVisible, signInAllowed, splitTeam, type AllowEntry, type Subject } from "../domain/policy";
import { createGuardedCache, type GuardedCacheOptions } from "./guarded-cache";
import type { PermissionService } from "./permissions";
import type { AccessStore } from "./store";

export type AccessPolicyDeps = {
  store: AccessStore;
  git: Pick<GitProviderInterface, "isInstallationMember" | "isOrgMember" | "isTeamMember">;
  permissions: PermissionService;
  cache?: Pick<GuardedCacheOptions<boolean>, "now" | "ttlMs" | "timeoutMs">;
};

/**
 * The admin's policy applied on top of GitHub's permissions. Effective access is the intersection of the two: a project
 * the policy hides has no capability at all, whatever GitHub says. Membership answers are cached for 5 minutes and
 * fail closed, like permissions; a failed check is "not a member".
 */
export function createAccessPolicy({ store, git, permissions, cache: cacheOptions }: AccessPolicyDeps) {
  const memberships = createGuardedCache<boolean>({ deny: false, what: "membership check", ...cacheOptions });
  const member = (kind: string, subject: string, login: string, ask: () => Promise<boolean>) =>
    memberships.get(`${kind}|${subject}|${userKey(login)}`, async () => (await ask()) === true, { kind, subject, username: userKey(login) });

  const inTeam = (value: string, login: string) => {
    const team = splitTeam(value);
    return team ? member("team", value, login, () => git.isTeamMember(team.org, team.slug, login)) : Promise.resolve(false);
  };

  const matchesEntry = (entry: AllowEntry, login: string) => {
    if (entry.kind === "user") return Promise.resolve(entry.value === userKey(login));
    if (entry.kind === "org") return member("org", entry.value, login, () => git.isOrgMember(entry.value, login));
    return inTeam(entry.value, login);
  };

  const matchesSubject = (subject: Subject, login: string) =>
    subject.kind === "user" ? Promise.resolve(subject.value === userKey(login)) : inTeam(subject.value, login);

  /** Level 1. Instance admins never go through here: they can always sign in. */
  async function canSignIn(login: string): Promise<boolean> {
    return signInAllowed(
      await store.allowlist(),
      (entry) => matchesEntry(entry, login),
      () => member("installation", "*", login, () => git.isInstallationMember(login)),
    );
  }

  /** Level 2 for one project, without GitHub's side. */
  async function projectVisibleTo(repo: RepoRef, login: string): Promise<boolean> {
    return projectVisible(await store.rulesFor(repo), (subject) => matchesSubject(subject, login));
  }

  /** What the user can do on the project: GitHub's capabilities, or none when the policy hides it from them. */
  async function capabilities(repo: RepoRef, login: string): Promise<ReadonlySet<Capability>> {
    // A user GitHub gives nothing needs no policy lookup.
    const granted = await permissions.capabilities(repo, login);
    if (granted.size === 0) return granted;
    return (await projectVisibleTo(repo, login)) ? granted : new Set();
  }

  return {
    canSignIn,
    projectVisibleTo,
    capabilities,
    async can(repo: RepoRef, login: string, capability: Capability): Promise<boolean> {
      return (await capabilities(repo, login)).has(capability);
    },

    /** Called by the webhook handler. Team and organization changes make every cached membership suspect. */
    invalidate(scope: PermissionScope = {}) {
      permissions.invalidate(scope);
      const login = scope.username === undefined ? undefined : userKey(scope.username);
      memberships.invalidate((key) => scope.repo !== undefined || login === undefined || key.endsWith(`|${login}`));
    },
  };
}

export type AccessPolicy = ReturnType<typeof createAccessPolicy>;
