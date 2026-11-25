import type { ActivityRequest, ActivityResult } from "./activity";

/**
 * Provider-agnostic access to a Git host. GitHub is the only implementation in V1
 * (Octokit adapter lives in features/repos/server); GitLab arrives in V3.
 * Read-only on purpose: write operations are a V2 concern.
 */
export type RepoRef = { owner: string; name: string };

export type RepoPermission = "none" | "read" | "triage" | "write" | "maintain" | "admin";

export type RepoSummary = RepoRef & {
  githubId: number;
  installationId: number;
  defaultBranch: string;
  isPrivate: boolean;
  archived: boolean;
};

/** An account (organization or user) where the GitHub App is installed. */
export type InstallationSummary = { id: number; accountLogin: string; accountType: string; suspended: boolean };

/** `unchanged`: the ETag the caller sent still matches. `absent`: there is no such file on the default branch. */
export type FileResult = { kind: "found"; content: string; etag: string; sha: string } | { kind: "unchanged" } | { kind: "absent" };

export interface GitProviderInterface {
  /** Installations of the App, suspended ones included (flagged). */
  listInstallations(): Promise<InstallationSummary[]>;
  /** Repositories of every active installation. Throws if any installation cannot be listed: a partial list is never returned. */
  listRepositories(): Promise<RepoSummary[]>;
  /** Explicit permission of a user on a repository (public-repo implicit read is NOT counted). */
  getUserPermission(repo: RepoRef, username: string): Promise<RepoPermission>;
  /** Is `login` a member of an account (organization or user) where the GitHub App is installed? The default sign-in rule. */
  isInstallationMember(login: string): Promise<boolean>;
  /** Is `login` a member of the organization? */
  isOrgMember(org: string, login: string): Promise<boolean>;
  /** Is `login` a member of the team `org/teamSlug`? */
  isTeamMember(org: string, teamSlug: string, login: string): Promise<boolean>;
  /** File at the root of the default branch. With `etag`, an unchanged file is reported as such instead of being sent again. */
  getFile(repo: RepoRef, path: string, etag?: string): Promise<FileResult>;
  /** Issues, pull requests, workflow runs or releases of a repository, newest change first. With `etag`, an unchanged list is reported as such. Throws when the host cannot answer. */
  getActivity(repo: RepoRef, request: ActivityRequest, etag?: string): Promise<ActivityResult>;
}
