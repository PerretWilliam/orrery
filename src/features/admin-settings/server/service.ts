import type { AuditEvent } from "@/features/audit/domain/events";
import { secretContext } from "@/features/secrets/server/service";
import { SETTINGS_CONTEXT } from "@/features/setup/server/service";
import { needsRotation, reencrypt, type Keyring } from "@/lib/crypto";
import type { AdminAction, AdminErrorCode } from "../domain/admin";
import type { AdminStore, AppCiphertexts } from "./store";

export type AdminDeps = { store: AdminStore; keyring: () => Keyring; audit?: (event: AuditEvent) => Promise<void> };
export type Actor = { userId: string; login: string };
export type AdminResult = { ok: true } | { ok: false; reason: "forbidden" } | { ok: false; reason: "invalid"; code: AdminErrorCode };

const invalid = (code: AdminErrorCode): AdminResult => ({ ok: false, reason: "invalid", code });
const OK: AdminResult = { ok: true };
const contexts = Object.entries(SETTINGS_CONTEXT) as [keyof typeof SETTINGS_CONTEXT, string][];

/** Instance admins only; anyone else is refused before anything is read. Every change is written to the audit log. */
export function createAdminSettings({ store, keyring, audit }: AdminDeps) {
  const allowed = (actor: Actor) => store.isAdmin(actor.login.toLowerCase());

  const staleApp = async (ring: Keyring): Promise<[keyof typeof SETTINGS_CONTEXT, string][]> => {
    const stored: AppCiphertexts = await store.appCiphertexts();
    return contexts.flatMap(([name]) => {
      const ciphertext = stored[name];
      return ciphertext !== undefined && needsRotation(ciphertext, ring) ? [[name, ciphertext] as [keyof typeof SETTINGS_CONTEXT, string]] : [];
    });
  };

  async function rotate(actor: Actor): Promise<AdminResult> {
    try {
      const ring = keyring();
      const secrets = await store.staleSecrets(ring.activeId);
      for (const secret of secrets) await store.saveSecret(secret.id, reencrypt(secret.ciphertext, ring, secretContext(secret.repositoryId, secret.name)), ring.activeId);
      const app = await staleApp(ring);
      await store.saveAppCiphertexts(Object.fromEntries(app.map(([name, ciphertext]) => [name, reencrypt(ciphertext, ring, SETTINGS_CONTEXT[name])])), ring.activeId);
      await audit?.({ event: "key_rotated", actor: actor.login, detail: { key: ring.activeId, secrets: String(secrets.length), credentials: String(app.length) } });
      return OK;
    } catch {
      return invalid("admin_rotation_failed");
    }
  }

  const done = async (changed: boolean, event: AuditEvent["event"], actor: Actor, detail: Record<string, string>): Promise<AdminResult> => {
    if (changed) await audit?.({ event, actor: actor.login, detail });
    return OK;
  };

  return {
    /** `null` when the user is not an admin. */
    async overview(actor: Actor) {
      if (!(await allowed(actor))) return null;
      const [allowlist, hosts, admins, rules] = await Promise.all([store.allowlist(), store.hosts(), store.admins(), store.rules()]);
      let key: { active: string; pending: number } | null = null;
      try {
        const ring = keyring();
        key = { active: ring.activeId, pending: (await store.staleSecrets(ring.activeId)).length + (await staleApp(ring)).length };
      } catch {
        // No usable key (or a ciphertext that cannot be read): the page says so instead of failing.
      }
      return { allowlist, hosts, admins, rules, key };
    },

    async apply(actor: Actor, action: AdminAction): Promise<AdminResult> {
      if (!(await allowed(actor))) return { ok: false, reason: "forbidden" };
      switch (action.type) {
        case "allow_add":
        case "allow_remove": {
          const entry = `${action.entry.kind}:${action.entry.value}`;
          const added = action.type === "allow_add";
          return done(added ? await store.addAllow(action.entry, actor.userId) : await store.removeAllow(action.entry), "allowlist_changed", actor, { scope: "sign_in", change: added ? "added" : "removed", entry });
        }
        case "host_add":
        case "host_remove": {
          const added = action.type === "host_add";
          return done(added ? await store.addHost(action.host, actor.userId) : await store.removeHost(action.host), "allowlist_changed", actor, { scope: "private_hosts", change: added ? "added" : "removed", host: action.host });
        }
        case "admin_add":
        case "admin_remove": {
          const added = action.type === "admin_add";
          if (!added && (await store.admins()).length <= 1) return invalid("admin_last_admin");
          return done(added ? await store.addAdmin(action.login, actor.userId) : await store.removeAdmin(action.login), "policy_changed", actor, { scope: "admins", change: added ? "added" : "removed", login: action.login });
        }
        case "rule_add":
        case "rule_remove": {
          const added = action.type === "rule_add";
          const changed = added ? await store.addRule(action.project, action.rule, actor.userId) : await store.removeRule(action.project, action.rule);
          if (changed === null) return invalid("admin_unknown_project");
          const subject = action.rule.effect === "hide" ? "" : `${action.rule.subject.kind}:${action.rule.subject.value}`;
          return done(changed, "policy_changed", actor, { scope: "project_rule", change: added ? "added" : "removed", project: `${action.project.owner}/${action.project.name}`, effect: action.rule.effect, subject });
        }
        case "rotate_keys":
          return rotate(actor);
      }
    },
  };
}
export type AdminSettings = ReturnType<typeof createAdminSettings>;
