import { describe, expect, it } from "vitest";
import { SETUP_ERRORS, setupIssue } from "./errors";

describe("setup error catalog", () => {
  it("pins the released codes: never rename or reuse them", () => {
    expect(Object.keys(SETUP_ERRORS)).toEqual([
      "setup_token_invalid",
      "setup_session_required",
      "setup_state_invalid",
      "setup_origin_invalid",
      "setup_already_completed",
      "setup_key_missing",
      "setup_github_failed",
    ]);
  });
  it("gives each code its own fix", () => {
    const fixes = Object.values(SETUP_ERRORS).map((e) => e.fix);
    expect(new Set(fixes).size).toBe(fixes.length);
  });
  it("builds an issue with the fix of its code", () => {
    expect(setupIssue("setup_token_invalid", "Wrong token")).toEqual({
      code: "setup_token_invalid",
      message: "Wrong token",
      fix: SETUP_ERRORS.setup_token_invalid.fix,
    });
  });
});
