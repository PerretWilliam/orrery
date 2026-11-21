// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { getSetupToken } from "./token-holder";

const KEY = Symbol.for("orrery.setupToken");
afterEach(() => Reflect.deleteProperty(globalThis, KEY));

describe("getSetupToken", () => {
  it("resolves once and returns the same token to every caller", () => {
    const first = getSetupToken({});
    expect(first.source).toBe("generated");
    expect(getSetupToken({ ORRERY_SETUP_TOKEN: "x".repeat(40) })).toBe(first);
  });
  it("uses ORRERY_SETUP_TOKEN when it is set", () => {
    expect(getSetupToken({ ORRERY_SETUP_TOKEN: "y".repeat(30) })).toEqual({ token: "y".repeat(30), source: "env" });
  });
  it("reads process.env by default", () => {
    expect(getSetupToken().token.length).toBeGreaterThan(0);
  });
});
