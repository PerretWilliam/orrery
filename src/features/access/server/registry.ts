import type { PermissionScope } from "../domain/capabilities";
import type { PermissionService } from "./permissions";

// Route handlers can be bundled apart from the pages, so the one live cache hangs off globalThis instead of a module variable.
const KEY = Symbol.for("orrery.permission-service");

/** Called once by whoever builds the service with a real Git provider. */
export const registerPermissionService = (service: PermissionService | undefined) => {
  Reflect.set(globalThis, KEY, service);
};

export const getPermissionService = (): PermissionService | undefined => Reflect.get(globalThis, KEY);

/** Nothing registered means nothing is cached, so there is nothing to forget. */
export const invalidatePermissions = (scope: PermissionScope = {}) => getPermissionService()?.invalidate(scope);
