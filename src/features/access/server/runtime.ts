import { getDb } from "@/lib/db/instance";
import { createAccessStore } from "./drizzle-store";
import { createPermissionService } from "./permissions";
import { createAccessPolicy, type AccessPolicy } from "./policy";
import { getRegisteredAccessPolicy, registerAccessPolicy } from "./registry";
import { unavailableGit } from "./unavailable-git";

/**
 * The one access policy of the process, created on first use. The repository discovery card swaps `unavailableGit` for
 * the Octokit adapter here; nothing else changes.
 */
export function getAccessPolicy(): AccessPolicy {
  const live = getRegisteredAccessPolicy();
  if (live) return live;
  const policy = createAccessPolicy({ store: createAccessStore(getDb()), git: unavailableGit, permissions: createPermissionService({ provider: unavailableGit }) });
  registerAccessPolicy(policy);
  return policy;
}
