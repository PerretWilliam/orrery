// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_DAYS, MAX_DAYS, MAX_NAME, TOKEN_ERRORS, hashToken, isTokenId, looksLikeToken, newToken, validateTokenInput } from "./tokens";

describe("token generation", () => {
  it("makes unique tokens that pass the shape check, and hashes them as SHA-256 hex", () => {
    const [a, b] = [newToken(), newToken()];
    expect(a).not.toBe(b);
    expect(looksLikeToken(a)).toBe(true);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(hashToken(a)).not.toContain(a.slice(4));
  });
  it("refuses strings that are not tokens", () => {
    for (const bad of ["", "orr_short", `orr_${"a".repeat(44)}`, `xyz_${"a".repeat(43)}`, `orr_${"a".repeat(42)}!`]) expect(looksLikeToken(bad)).toBe(false);
  });
  it("recognizes a database id and nothing else", () => {
    expect(isTokenId("0b9f4c1e-5d2a-4e8b-9c3d-1a2b3c4d5e6f")).toBe(true);
    expect(isTokenId("1; drop table")).toBe(false);
  });
});

describe("token input", () => {
  it("defaults to 90 days and trims the label", () => {
    expect(validateTokenInput({ name: "  Claude  ", days: "" })).toEqual({ ok: true, name: "Claude", days: DEFAULT_DAYS });
    expect(validateTokenInput({ name: "x", days: " 365 " })).toEqual({ ok: true, name: "x", days: MAX_DAYS });
  });
  it("refuses a bad label with a code, a path and a fix", () => {
    for (const name of ["", "   ", "a".repeat(MAX_NAME + 1), "bad\nlabel"]) {
      const result = validateTokenInput({ name, days: "" });
      expect(result).toEqual({ ok: false, issues: [expect.objectContaining({ code: "token_invalid_name", path: "name", fix: TOKEN_ERRORS.token_invalid_name.fix })] });
    }
  });
  it("refuses a lifetime that is not a whole number between 1 and 365 days", () => {
    for (const days of ["0", "366", "-1", "1.5", "abc", "99999"]) {
      expect(validateTokenInput({ name: "x", days })).toEqual({ ok: false, issues: [expect.objectContaining({ code: "token_invalid_expiry", path: "days" })] });
    }
  });
  it("reports both problems at once", () => {
    const result = validateTokenInput({ name: "", days: "0" });
    expect(result.ok ? [] : result.issues.map((i) => i.code)).toEqual(["token_invalid_name", "token_invalid_expiry"]);
  });
});
