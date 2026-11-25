import type { RepoRef } from "@/features/repos/domain/git-provider";
import { encrypt, type Keyring } from "@/lib/crypto";
import { isValidSecretValue, validateSecretInput } from "../domain/bindings";
import { secretIssue, type SecretIssue } from "../domain/errors";
import type { SecretSummary, SecretsStore } from "./store";

/** The ciphertext is bound to its repository and name: copied to another secret, it no longer decrypts. */
export const secretContext = (repositoryId: string, name: string): string => `secret:${repositoryId}:${name}`;

export type SecretsDeps = {
  store: SecretsStore;
  keyring: () => Keyring;
  /** The `manage_secrets` capability of this user on this project (access policy included). Fails closed. */
  canManage: (repo: RepoRef, login: string) => Promise<boolean>;
  now: () => Date;
};

export type Actor = { userId: string; login: string };
export type SecretResult = { ok: true } | { ok: false; reason: "forbidden" } | { ok: false; reason: "invalid"; issues: SecretIssue[] };

/**
 * Secrets are write-only: the service lists names and bound hosts, creates or replaces a value, and deletes. Nothing
 * returns a value. Only maintainers and admins may use it; an unknown project and a refused user look the same.
 */
export function createSecrets({ store, keyring, canManage, now }: SecretsDeps) {
  const allowed = async (repo: RepoRef, actor: Actor) => ((await canManage(repo, actor.login)) ? store.repositoryId(repo) : null);

  return {
    /** `null` when the user may not manage this project's secrets. */
    async list(repo: RepoRef, actor: Actor): Promise<SecretSummary[] | null> {
      const id = await allowed(repo, actor);
      return id === null ? null : store.list(id);
    },

    async save(repo: RepoRef, actor: Actor, input: { name: string; value: string; hosts: readonly string[] }): Promise<SecretResult> {
      const id = await allowed(repo, actor);
      if (id === null) return { ok: false, reason: "forbidden" };
      const checked = validateSecretInput(input);
      const issues = checked.ok ? [] : [...checked.issues];
      if (!isValidSecretValue(input.value)) issues.push(secretIssue("secret_invalid_value", "value", "The value is empty, too long or has control characters"));
      if (!checked.ok || issues.length > 0) return { ok: false, reason: "invalid", issues };
      const ring = keyring();
      await store.save(
        { repositoryId: id, name: input.name, ciphertext: encrypt(input.value, ring, secretContext(id, input.name)), keyId: ring.activeId, boundHosts: checked.hosts, userId: actor.userId },
        now(),
      );
      return { ok: true };
    },

    async remove(repo: RepoRef, actor: Actor, name: string): Promise<SecretResult> {
      const id = await allowed(repo, actor);
      if (id === null) return { ok: false, reason: "forbidden" };
      await store.remove(id, name);
      return { ok: true };
    },
  };
}
export type Secrets = ReturnType<typeof createSecrets>;
