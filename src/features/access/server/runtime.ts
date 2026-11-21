import { getGitProvider } from "@/features/repos/server/runtime";
import { getDb } from "@/lib/db/instance";
import { createAccessStore } from "./drizzle-store";
import { createPermissionService } from "./permissions";
import { createAccessPolicy, type AccessPolicy } from "./policy";
import { getRegisteredAccessPolicy, registerAccessPolicy } from "./registry";

/**
 * The one access policy of the process, created on first use, asking GitHub through the App. Until the first-run
 * setup has created the App every question fails, and a failure is a denial: only instance admins get in.
 */
export function getAccessPolicy(): AccessPolicy {
  const live = getRegisteredAccessPolicy();
  if (live) return live;
  const git = getGitProvider();
  const policy = createAccessPolicy({ store: createAccessStore(getDb()), git, permissions: createPermissionService({ provider: git }) });
  registerAccessPolicy(policy);
  return policy;
}
