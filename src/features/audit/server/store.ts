import type { AuditEntry, AuditEvent, AuditEventName } from "../domain/events";

export type AuditStore = {
  append(entry: Required<Omit<AuditEvent, "repository">> & { repository: string | null }, at: Date): Promise<void>;
  /** Newest first. `before` pages backwards; `event` filters. */
  list(options: { limit: number; before?: Date; event?: AuditEventName }): Promise<AuditEntry[]>;
  /** Deletes entries older than `cutoff`; returns how many. */
  purge(cutoff: Date): Promise<number>;
};
