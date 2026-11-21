import { log } from "@/lib/logger";
import { parseAdminLogins, parseAllowlist } from "../domain/policy";
import type { AccessStore } from "./store";

/**
 * At startup, the two environment variables that keep a new instance from being open by accident and a lost one from
 * being locked for good:
 * - `ORRERY_ADMINS` makes those GitHub users instance admins on every start (the way back in when every admin is gone);
 * - `ORRERY_SIGNIN_ALLOWLIST` fills the sign-in allowlist once, while it is empty. After that the admin owns the list.
 * Entries that cannot be read are skipped with a warning: a typo can narrow access, never widen it.
 */
export async function seedAccess(deps: { env: Record<string, string | undefined>; store: AccessStore }): Promise<void> {
  const admins = parseAdminLogins(deps.env.ORRERY_ADMINS);
  const allowlist = parseAllowlist(deps.env.ORRERY_SIGNIN_ALLOWLIST);
  if (admins.problems.length > 0) log("warn", "ORRERY_ADMINS has entries that are not GitHub usernames and were ignored", { entries: admins.problems });
  if (allowlist.problems.length > 0) {
    log("warn", "ORRERY_SIGNIN_ALLOWLIST has entries that are not org:name, team:org/slug or user:name and were ignored", { entries: allowlist.problems });
  }
  await deps.store.grantAdmins(admins.items);
  const added = await deps.store.seedAllowlist(allowlist.items);
  if (added > 0) log("info", "The sign-in allowlist was filled from ORRERY_SIGNIN_ALLOWLIST", { entries: added });
}
