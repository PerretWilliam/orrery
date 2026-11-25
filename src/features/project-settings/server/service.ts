import type { Capability } from "@/features/access/domain/capabilities";
import type { AuditEvent } from "@/features/audit/domain/events";
import type { RepoRef } from "@/features/repos/domain/git-provider";
import { cleanProjectHost, MAX_PROJECT_HOSTS, type SettingsErrorCode } from "../domain/hosts";
import type { ProjectSettingsStore } from "./store";

export type SettingsDeps = {
  store: ProjectSettingsStore;
  /** The access policy: GitHub's permission, narrowed by the admin's rules. Fails closed. */
  can: (repo: RepoRef, login: string, capability: Capability) => Promise<boolean>;
  /** Reads the project's config again, ignoring what GitHub says is unchanged. Throws when GitHub fails. */
  reindex: (repo: RepoRef) => Promise<void>;
  audit?: (event: AuditEvent) => Promise<void>;
};

export type Actor = { userId: string; login: string };
export type Overview = { hosts: string[]; canManageSecrets: boolean; canReindex: boolean };
export type SettingsResult = { ok: true } | { ok: false; reason: "forbidden" } | { ok: false; reason: "invalid"; code: SettingsErrorCode };

/** Maintainers and admins only. An unknown project and a refused user look the same. Every change is written to the audit log. */
export function createProjectSettings({ store, can, reindex, audit }: SettingsDeps) {
  const key = (repo: RepoRef) => `${repo.owner}/${repo.name}`;
  const allowed = async (repo: RepoRef, actor: Actor, capability: Capability) => ((await can(repo, actor.login, capability)) ? store.repositoryId(repo) : null);

  return {
    /** `null` when the user may not manage this project. */
    async overview(repo: RepoRef, actor: Actor): Promise<Overview | null> {
      const id = await allowed(repo, actor, "manage_hosts");
      if (id === null) return null;
      const [hosts, canManageSecrets, canReindex] = await Promise.all([store.hosts(id), can(repo, actor.login, "manage_secrets"), can(repo, actor.login, "reindex")]);
      return { hosts, canManageSecrets, canReindex };
    },

    async addHost(repo: RepoRef, actor: Actor, input: string): Promise<SettingsResult> {
      const id = await allowed(repo, actor, "manage_hosts");
      if (id === null) return { ok: false, reason: "forbidden" };
      const host = cleanProjectHost(input);
      if (!host || (await store.hosts(id)).length >= MAX_PROJECT_HOSTS) return { ok: false, reason: "invalid", code: "settings_invalid_host" };
      if (await store.addHost(id, host, actor.userId)) await audit?.({ event: "allowlist_changed", actor: actor.login, repository: key(repo), detail: { change: "added", host } });
      return { ok: true };
    },

    async removeHost(repo: RepoRef, actor: Actor, host: string): Promise<SettingsResult> {
      const id = await allowed(repo, actor, "manage_hosts");
      if (id === null) return { ok: false, reason: "forbidden" };
      if (await store.removeHost(id, host)) await audit?.({ event: "allowlist_changed", actor: actor.login, repository: key(repo), detail: { change: "removed", host } });
      return { ok: true };
    },

    async reindex(repo: RepoRef, actor: Actor): Promise<SettingsResult> {
      if ((await allowed(repo, actor, "reindex")) === null) return { ok: false, reason: "forbidden" };
      await audit?.({ event: "reindex_forced", actor: actor.login, repository: key(repo) });
      try {
        await reindex(repo);
      } catch {
        return { ok: false, reason: "invalid", code: "settings_reindex_failed" };
      }
      return { ok: true };
    },
  };
}
export type ProjectSettings = ReturnType<typeof createProjectSettings>;
