import type { AllowEntry, ProjectRule } from "@/features/access/domain/policy";
import type { RepoRef } from "@/features/repos/domain/git-provider";
import type { SETTINGS_CONTEXT } from "@/features/setup/server/service";

export type RuleRow = { project: string; rule: ProjectRule };
export type AppCiphertexts = Partial<Record<keyof typeof SETTINGS_CONTEXT, string>>;

/** What the admin settings need from the database. The Drizzle implementation is tested against Postgres. Every `add`/`remove` says whether it changed anything. */
export type AdminStore = {
  isAdmin(login: string): Promise<boolean>;
  allowlist(): Promise<AllowEntry[]>;
  addAllow(entry: AllowEntry, userId: string): Promise<boolean>;
  removeAllow(entry: AllowEntry): Promise<boolean>;
  hosts(): Promise<string[]>;
  addHost(host: string, userId: string): Promise<boolean>;
  removeHost(host: string): Promise<boolean>;
  admins(): Promise<string[]>;
  addAdmin(login: string, userId: string): Promise<boolean>;
  removeAdmin(login: string): Promise<boolean>;
  rules(): Promise<RuleRow[]>;
  /** `null` when the project is unknown. */
  addRule(repo: RepoRef, rule: ProjectRule, userId: string): Promise<boolean | null>;
  removeRule(repo: RepoRef, rule: ProjectRule): Promise<boolean>;
  /** Project secrets not sealed with this key, still encrypted. */
  staleSecrets(activeKeyId: string): Promise<{ id: string; repositoryId: string; name: string; ciphertext: string }[]>;
  saveSecret(id: string, ciphertext: string, keyId: string): Promise<void>;
  /** The App credentials as stored (ciphertext only). */
  appCiphertexts(): Promise<AppCiphertexts>;
  /** Replaces these ciphertexts and records the key the credentials are now sealed with. */
  saveAppCiphertexts(values: AppCiphertexts, keyId: string): Promise<void>;
};
