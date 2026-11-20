import { describe, expect, it } from "vitest";
import { runCli } from "./validate";

const VALID = "version: 1\nproject: { name: X }\npages: [{ id: p, title: P, widgets: [] }]\n";
const INVALID = "version: 1\nproject:\n  name: X\n  logo: y\npages: [{ id: p, title: P, widgets: [] }]\n";
const reader = (text: string) => () => text;

describe("orrery validate", () => {
  it("accepts a valid file", () => {
    expect(runCli(["validate", "a.yml"], reader(VALID))).toEqual({ code: 0, stdout: "a.yml is valid\n", stderr: "" });
  });

  it("prints path, line, code, message and fix for each problem", () => {
    const result = runCli(["validate", "a.yml"], reader(INVALID));
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      'a.yml:4 project.logo [config_unknown_field] Unknown field "logo"\n  fix: Remove the field or fix its spelling. Unknown fields are rejected.\n',
    );
  });

  it("omits the line when there is none and names the root", () => {
    const result = runCli(["validate", "a.yml"], reader("x".repeat(300 * 1024)));
    expect(result.stderr).toMatch(/^a\.yml \(root\) \[config_too_large\] The file is larger than 256 KB\n {2}fix: /);
  });

  it("prints JSON with --json, in any position", () => {
    for (const argv of [["validate", "--json", "a.yml"], ["validate", "a.yml", "--json"]]) {
      const bad = runCli(argv, reader(INVALID));
      expect(bad.code).toBe(1);
      expect(JSON.parse(bad.stdout)).toMatchObject({ valid: false, issues: [{ code: "config_unknown_field", path: "project.logo", line: 4 }] });
      expect(bad.stderr).toBe("");
    }
    expect(JSON.parse(runCli(["validate", "--json", "a.yml"], reader(VALID)).stdout)).toEqual({ valid: true, issues: [] });
  });

  it("reports unreadable files with exit code 2", () => {
    const failing = (code?: string) => () => {
      throw Object.assign(new Error("boom with /secret/path"), code ? { code } : {});
    };
    expect(runCli(["validate", "a.yml"], failing("ENOENT"))).toEqual({ code: 2, stdout: "", stderr: "Cannot read a.yml: ENOENT\n" });
    expect(runCli(["validate", "a.yml"], failing()).stderr).toBe("Cannot read a.yml: unknown error\n");
  });

  it("shows usage with exit code 2 for bad invocations", () => {
    for (const argv of [[], ["check", "a.yml"], ["validate"], ["validate", "a", "b"], ["validate", "--bogus"], ["validate", "--json"]]) {
      const result = runCli(argv, reader(VALID));
      expect(result.code, argv.join(" ")).toBe(2);
      expect(result.stderr).toBe("Usage: orrery validate [--json] <file>\n");
    }
  });

  it("shows help with exit code 0", () => {
    for (const argv of [["--help"], ["-h"], ["validate", "--help"], ["validate", "-h"]]) {
      expect(runCli(argv, reader(VALID))).toEqual({ code: 0, stdout: "Usage: orrery validate [--json] <file>\n", stderr: "" });
    }
  });
});
