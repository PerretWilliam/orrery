import type { RepoRef } from "@/features/repos/domain/git-provider";
import type { AllowEntry, ProjectRule } from "../domain/policy";

/** What the access policy needs from the database. The Drizzle implementation is tested against Postgres. */
export type AccessStore = {
  allowlist(): Promise<AllowEntry[]>;
  /** Rules of one project, found by name without regard to case. No row for the repository means no rule. */
  rulesFor(repo: RepoRef): Promise<ProjectRule[]>;
  /** Adds the entries only if the allowlist is still empty (the admin's own edits are never overwritten). Returns how many were added. */
  seedAllowlist(entries: AllowEntry[]): Promise<number>;
  /** Makes these logins (lowercase) instance admins; the ones that already are stay as they are. */
  grantAdmins(logins: string[]): Promise<void>;
};
