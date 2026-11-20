/**
 * Provider-agnostic access to a Git host. GitHub is the only implementation in V1
 * (Octokit adapter lives in features/repos/server); GitLab arrives in V3.
 * Read-only on purpose: write operations are a V2 concern.
 */
export type RepoRef = { owner: string; name: string };

export type RepoPermission = "none" | "read" | "triage" | "write" | "maintain" | "admin";

export type RepoSummary = RepoRef & { defaultBranch: string; isPrivate: boolean };

export type FileContent = { content: string; etag: string };

export interface GitProviderInterface {
  /** Repositories the app installation can see. */
  listRepositories(): Promise<RepoSummary[]>;
  /** Explicit permission of a user on a repository (public-repo implicit read is NOT counted). */
  getUserPermission(repo: RepoRef, username: string): Promise<RepoPermission>;
  /** File at the root of the default branch; null when absent or unchanged (ETag match). */
  getFile(repo: RepoRef, path: string, etag?: string): Promise<FileContent | null>;
}
