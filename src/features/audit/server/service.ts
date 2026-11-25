import { log } from "@/lib/logger";
import { AUDIT_RETENTION_DAYS, cleanDetail, type AuditEntry, type AuditEvent, type AuditEventName } from "../domain/events";
import type { AuditStore } from "./store";

export const MAX_PAGE = 200;

export type AuditDeps = {
  store: AuditStore;
  /** Is this GitHub login an instance admin? */
  isAdmin: (login: string) => Promise<boolean>;
  now: () => Date;
};

/**
 * The audit log. Anyone may be recorded, only an instance admin may read it, and nobody may change it. Recording never
 * throws: a failed write is logged (the event name only) and must not take the action it describes down with it.
 */
export function createAudit({ store, isAdmin, now }: AuditDeps) {
  return {
    async record(event: AuditEvent): Promise<void> {
      try {
        await store.append({ event: event.event, actor: event.actor, repository: event.repository ?? null, detail: cleanDetail(event.detail) }, now());
      } catch (error) {
        log("error", "audit entry could not be written", { event: event.event, error: error instanceof Error ? error.message : "unknown error" });
      }
    },

    /** `null` when `login` is not an admin: the log is not even acknowledged to anyone else. */
    async list(login: string, options: { limit?: number; before?: Date; event?: AuditEventName } = {}): Promise<AuditEntry[] | null> {
      if (!(await isAdmin(login.toLowerCase()))) return null;
      return store.list({ limit: Math.min(Math.max(options.limit ?? 50, 1), MAX_PAGE), before: options.before, event: options.event });
    },

    /** Removes what is older than the retention. The only deletion the log allows. */
    purge: () => store.purge(new Date(now().getTime() - AUDIT_RETENTION_DAYS * 86_400_000)),
  };
}
export type Audit = ReturnType<typeof createAudit>;
