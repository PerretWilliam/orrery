import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { instanceAdmins, projectRules, repositories, signInAllowlist } from "@/lib/db/schema";
import type { ProjectRule } from "../domain/policy";
import type { AccessStore } from "./store";

/** Drizzle implementation of `AccessStore`. Excluded from unit coverage; tests/integration/access-store.test.ts runs it on Postgres. */
export function createAccessStore(db: Db): AccessStore {
  return {
    async allowlist() {
      const rows = await db.select({ kind: signInAllowlist.kind, value: signInAllowlist.value }).from(signInAllowlist);
      return rows;
    },

    async rulesFor(repo) {
      const rows = await db
        .select({ effect: projectRules.effect, kind: projectRules.subjectKind, value: projectRules.subjectValue })
        .from(projectRules)
        .innerJoin(repositories, eq(repositories.id, projectRules.repositoryId))
        .where(sql`lower(${repositories.owner}) = lower(${repo.owner}) and lower(${repositories.name}) = lower(${repo.name})`);
      // A restrict_to row without a subject cannot exist (check constraint); if it ever did, it would hide the project.
      return rows.map((row): ProjectRule => (row.effect === "restrict_to" && row.kind && row.value ? { effect: "restrict_to", subject: { kind: row.kind, value: row.value.toLowerCase() } } : { effect: "hide" }));
    },

    async seedAllowlist(entries) {
      if (entries.length === 0) return 0;
      return db.transaction(async (tx) => {
        // Serializes two instances starting at once: the second one sees the first one's rows.
        await tx.execute(sql`lock table ${signInAllowlist} in share row exclusive mode`);
        const [existing] = await tx.select({ id: signInAllowlist.id }).from(signInAllowlist).limit(1);
        if (existing) return 0;
        const rows = await tx.insert(signInAllowlist).values(entries).onConflictDoNothing().returning({ id: signInAllowlist.id });
        return rows.length;
      });
    },

    async grantAdmins(logins) {
      if (logins.length === 0) return;
      await db.insert(instanceAdmins).values(logins.map((login) => ({ login }))).onConflictDoNothing();
    },
  };
}
