import { and, desc, eq, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { cleanDetail, type AuditEventName } from "../domain/events";
import type { AuditStore } from "./store";

/** Drizzle implementation of `AuditStore`. Excluded from unit coverage; tests/integration/audit-store.test.ts runs it on Postgres. */
export function createAuditStore(db: Db): AuditStore {
  return {
    async append(entry, at) {
      // The actor is kept as a login snapshot, so the entry outlives the user.
      await db.insert(auditLog).values({
        at,
        action: entry.event,
        actorLogin: entry.actor,
        targetType: entry.repository ? "repository" : null,
        targetId: entry.repository,
        metadata: entry.detail,
      });
    },
    async list({ limit, before, event }) {
      const rows = await db
        .select()
        .from(auditLog)
        .where(and(before ? lt(auditLog.at, before) : undefined, event ? eq(auditLog.action, event) : undefined))
        .orderBy(desc(auditLog.at))
        .limit(limit);
      return rows.map((row) => ({
        id: String(row.id),
        at: row.at,
        event: row.action as AuditEventName,
        actor: row.actorLogin,
        repository: row.targetType === "repository" ? row.targetId : null,
        detail: cleanDetail((row.metadata ?? {}) as Record<string, string>),
      }));
    },
    async purge(cutoff) {
      return (await db.delete(auditLog).where(lt(auditLog.at, cutoff))).rowCount ?? 0;
    },
  };
}
