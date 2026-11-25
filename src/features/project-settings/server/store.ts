import type { RepoRef } from "@/features/repos/domain/git-provider";

export type ProjectSettingsStore = {
  /** The repository's id, whatever the case of its name; `null` when unknown. */
  repositoryId(repo: RepoRef): Promise<string | null>;
  hosts(repositoryId: string): Promise<string[]>;
  /** `false` when the host was already there. */
  addHost(repositoryId: string, host: string, userId: string): Promise<boolean>;
  /** `false` when there was nothing to remove. */
  removeHost(repositoryId: string, host: string): Promise<boolean>;
};
