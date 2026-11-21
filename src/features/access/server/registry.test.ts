import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessPolicy } from "./policy";
import { getRegisteredAccessPolicy, invalidatePermissions, registerAccessPolicy } from "./registry";

afterEach(() => registerAccessPolicy(undefined));

describe("access policy registry", () => {
  it("does nothing while no policy is registered", () => {
    expect(getRegisteredAccessPolicy()).toBeUndefined();
    expect(() => invalidatePermissions({ username: "octocat" })).not.toThrow();
  });
  it("forwards invalidations to the registered policy", () => {
    const invalidate = vi.fn();
    const policy = { invalidate } as unknown as AccessPolicy;
    registerAccessPolicy(policy);
    expect(getRegisteredAccessPolicy()).toBe(policy);
    invalidatePermissions({ username: "octocat" });
    invalidatePermissions();
    expect(invalidate.mock.calls).toEqual([[{ username: "octocat" }], [{}]]);
  });
});
