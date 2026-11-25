import type { RepoRef } from "@/features/repos/domain/git-provider";

/** What is shown about a secret: never its value, not even encrypted. */
export type SecretSummary = { name: string; boundHosts: string[]; updatedAt: Date };

export type SecretWrite = {
  repositoryId: string;
  name: string;
  ciphertext: string;
  keyId: string;
  boundHosts: string[];
  userId: string;
};

/** What the secrets service needs from the database. The Drizzle implementation is tested against Postgres. */
export type SecretsStore = {
  /** Id of the repository (found without regard to case), or `null` when it is unknown. */
  repositoryId(repo: RepoRef): Promise<string | null>;
  list(repositoryId: string): Promise<SecretSummary[]>;
  /** Creates the secret, or replaces its value and hosts. */
  save(entry: SecretWrite, now: Date): Promise<void>;
  /** `true` when a secret was deleted. */
  remove(repositoryId: string, name: string): Promise<boolean>;
};
