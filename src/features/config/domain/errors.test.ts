import { describe, expect, it } from "vitest";
import { CONFIG_ERRORS, configIssue } from "./errors";
import { parseConfig } from "./parse-config";

// Released codes are never renamed, reused or removed: adding one is fine, changing this list's existing entries is not.
const RELEASED = [
  "config_alias_limit",
  "config_duplicate_key",
  "config_duplicate_page_id",
  "config_forbidden_key",
  "config_invalid_value",
  "config_limit_exceeded",
  "config_multiple_documents",
  "config_not_a_mapping",
  "config_required",
  "config_syntax",
  "config_too_deep",
  "config_too_large",
  "config_unknown_field",
  "config_unknown_source",
  "config_unsupported_version",
];

describe("config error catalog", () => {
  it("keeps every released code", () => {
    expect(Object.keys(CONFIG_ERRORS).sort()).toEqual(RELEASED);
  });

  it("gives each code a stable name and a suggested fix", () => {
    for (const [code, { fix }] of Object.entries(CONFIG_ERRORS)) {
      expect(code).toMatch(/^config_[a-z_]+$/);
      expect(fix.length).toBeGreaterThan(20);
      expect(fix.endsWith(".")).toBe(true);
    }
  });

  it("builds an issue with code, path, message, fix and an optional line", () => {
    expect(configIssue("config_required", "project.name", "Required")).toStrictEqual({
      code: "config_required",
      path: "project.name",
      message: "Required",
      fix: CONFIG_ERRORS.config_required.fix,
    });
    expect(configIssue("config_syntax", "", "Bad", 4).line).toBe(4);
  });

  it("is serialized identically wherever it is shown", () => {
    const result = parseConfig("version: 1\nextra: 1\n");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const json = JSON.parse(JSON.stringify(result.issues));
      expect(json).toEqual(
        expect.arrayContaining([
          { code: "config_unknown_field", path: "extra", message: 'Unknown field "extra"', fix: CONFIG_ERRORS.config_unknown_field.fix },
          expect.objectContaining({ code: "config_required", path: "project" }),
          expect.objectContaining({ code: "config_required", path: "pages" }),
        ]),
      );
    }
  });

  it("reaches the specific codes through the parser", () => {
    const sources = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`s${i}`, { url: "https://a.example" }]));
    const cases: [string, string][] = [
      [JSON.stringify({ version: 1, project: { name: "X" }, sources, pages: [{ id: "p", title: "P", widgets: [] }] }), "config_limit_exceeded"],
      [JSON.stringify({ version: 1, project: { name: "X" }, pages: [{ id: "p", title: "P", widgets: [] }, { id: "p", title: "Q", widgets: [] }] }), "config_duplicate_page_id"],
    ];
    for (const [text, code] of cases) {
      const result = parseConfig(text);
      expect(!result.ok && result.issues.map((i) => i.code)).toContain(code);
    }
  });
});
