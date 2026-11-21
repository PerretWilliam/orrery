import { afterEach, describe, expect, it, vi } from "vitest";
import type { PermissionService } from "./permissions";
import { getPermissionService, invalidatePermissions, registerPermissionService } from "./registry";

afterEach(() => registerPermissionService(undefined));

describe("permission service registry", () => {
  it("does nothing while no service is registered", () => {
    expect(getPermissionService()).toBeUndefined();
    expect(() => invalidatePermissions({ username: "octocat" })).not.toThrow();
  });
  it("forwards invalidations to the registered service", () => {
    const invalidate = vi.fn();
    const service = { invalidate } as unknown as PermissionService;
    registerPermissionService(service);
    expect(getPermissionService()).toBe(service);
    invalidatePermissions({ username: "octocat" });
    invalidatePermissions();
    expect(invalidate.mock.calls).toEqual([[{ username: "octocat" }], [{}]]);
  });
});
