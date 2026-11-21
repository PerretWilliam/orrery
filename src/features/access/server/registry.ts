import type { PermissionScope } from "../domain/capabilities";
import type { AccessPolicy } from "./policy";

// Route handlers can be bundled apart from the pages, so the one live policy (and its caches) hangs off globalThis instead of a module variable.
const KEY = Symbol.for("orrery.access-policy");

export const registerAccessPolicy = (policy: AccessPolicy | undefined) => {
  Reflect.set(globalThis, KEY, policy);
};

export const getRegisteredAccessPolicy = (): AccessPolicy | undefined => Reflect.get(globalThis, KEY);

/** Nothing registered means nothing is cached, so there is nothing to forget. */
export const invalidatePermissions = (scope: PermissionScope = {}) => getRegisteredAccessPolicy()?.invalidate(scope);
