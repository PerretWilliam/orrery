import { describe, expect, it } from "vitest";
import { AUTH_ERRORS, authIssue } from "./errors";

describe("auth error catalog", () => {
  // Released codes are never renamed or reused: this list only grows.
  it("keeps its stable codes", () => {
    expect(Object.keys(AUTH_ERRORS)).toEqual([
      "auth_not_configured",
      "auth_sign_in_refused",
      "auth_session_invalid",
      "auth_refresh_failed",
      "auth_origin_invalid",
    ]);
  });
  it.each(Object.keys(AUTH_ERRORS))("gives %s a suggested fix", (code) => {
    const issue = authIssue(code as keyof typeof AUTH_ERRORS, "message");
    expect(issue).toEqual({ code, message: "message", fix: AUTH_ERRORS[code as keyof typeof AUTH_ERRORS].fix });
    expect(issue.fix.length).toBeGreaterThan(10);
  });
});
