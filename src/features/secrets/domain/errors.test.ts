import { describe, expect, it } from "vitest";
import { SECRET_ERRORS, secretIssue } from "./errors";

describe("secret error catalog", () => {
  it("pins the released codes: never rename or reuse them", () => {
    expect(Object.keys(SECRET_ERRORS)).toEqual([
      "secret_invalid_name",
      "secret_invalid_host",
      "secret_invalid_value",
      "secret_unknown",
      "secret_host_not_bound",
      "secret_not_allowed_here",
    ]);
  });
  it("gives every code a distinct, actionable fix", () => {
    const fixes = Object.values(SECRET_ERRORS).map((e) => e.fix);
    expect(new Set(fixes).size).toBe(fixes.length);
    fixes.forEach((fix) => expect(fix.length).toBeGreaterThan(20));
  });
  it("builds an issue with the fix of its code", () => {
    expect(secretIssue("secret_unknown", "headers.Authorization", "Unknown secret")).toEqual({
      code: "secret_unknown",
      path: "headers.Authorization",
      message: "Unknown secret",
      fix: SECRET_ERRORS.secret_unknown.fix,
    });
  });
});
