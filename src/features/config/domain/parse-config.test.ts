import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits";
import type { ConfigIssue } from "./errors";
import { formatPath, parseConfig } from "./parse-config";

const VALID = `version: 1
project:
  name: Starfall
  color: "#7c3aed"
sources:
  game_stats:
    url: https://api.starfall.example/internal/stats
    method: GET
    headers:
      Authorization: Bearer \${GAME_API_TOKEN}
    ttl: 60s
pages:
  - id: overview
    title: Overview
    widgets:
      - type: kpi
        source: game_stats
        path: data.retention.d7
        label: Day-7 retention
        unit: "%"
        alert: { below: 18 }
      - type: github.pull_requests
        state: open
`;

const MINIMAL = "version: 1\nproject: { name: X }\npages: [{ id: p, title: P, widgets: [] }]\n";

const issuesOf = (text: string): Omit<ConfigIssue, "fix">[] => {
  const result = parseConfig(text);
  if (result.ok) throw new Error("expected issues");
  // Every issue carries a suggested fix; the other tests compare the rest.
  // Lines are asserted in their own tests; here they are kept only for problems found by the YAML parser.
  return result.issues.map(({ fix, line, ...rest }) => {
    expect(fix).toBeTruthy();
    const fromYaml = ["config_syntax", "config_duplicate_key", "config_multiple_documents"].includes(rest.code);
    return fromYaml ? { ...rest, line } : rest;
  });
};
const linesOf = (text: string): Record<string, number | undefined> => {
  const result = parseConfig(text);
  if (result.ok) throw new Error("expected issues");
  return Object.fromEntries(result.issues.map((i) => [i.path || i.code, i.line]));
};
const codes = (text: string) => issuesOf(text).map((i) => i.code);
const nested = (depth: number) => `${'{"a":'.repeat(depth)}1${"}".repeat(depth)}`;
const withBody = (body: string) => `version: 1
project: { name: X }
sources: { s: { url: "https://a.example", method: POST, body: ${body} } }
pages: [{ id: p, title: P, widgets: [] }]
`;

describe("parseConfig valid input", () => {
  it("parses the sample of the scope", () => {
    const result = parseConfig(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.project.name).toBe("Starfall");
      expect(result.config.sources.game_stats.headers).toEqual({ Authorization: "Bearer ${GAME_API_TOKEN}" });
    }
  });

  it("accepts a few aliases", () => {
    const text = `version: 1
project: { name: X }
sources:
  a: { url: &u "https://a.example" }
  b: { url: *u }
pages: [{ id: p, title: P, widgets: [] }]
`;
    expect(parseConfig(text).ok).toBe(true);
  });

  it("accepts a file of exactly the maximum size and refuses one more byte", () => {
    const pad = (bytes: number) => `${MINIMAL}#${"x".repeat(bytes - MINIMAL.length - 1)}`;
    expect(parseConfig(pad(LIMITS.maxBytes)).ok).toBe(true);
    expect(codes(pad(LIMITS.maxBytes + 1))).toEqual(["config_too_large"]);
  });

  it("accepts nesting of exactly the maximum depth", () => {
    // root, sources and the source take 3 levels; the body and its nested maps take the rest
    expect(parseConfig(withBody(nested(LIMITS.maxDepth - 3))).ok).toBe(true);
  });
});

describe("parseConfig limits", () => {
  it("counts bytes, not characters", () => {
    const text = `${MINIMAL}#${"é".repeat(LIMITS.maxBytes / 2)}`; // 2 bytes each, over the limit once the file is added
    expect(text.length).toBeLessThan(LIMITS.maxBytes);
    expect(codes(text)).toEqual(["config_too_large"]);
  });

  it("rejects an oversized file without parsing it", () => {
    expect(issuesOf("x".repeat(LIMITS.maxBytes + 1))).toEqual([{ code: "config_too_large", path: "", message: "The file is larger than 256 KB" }]);
  });

  it("rejects an alias bomb quickly", () => {
    const names = [..."abcdefghi"];
    const lines = names.map((name, i) => `${name}: &${name} [${Array(9).fill(i === 0 ? "x" : `*${names[i - 1]}`).join(", ")}]`);
    const text = `${lines.join("\n")}\n`;
    const started = Date.now();
    expect(issuesOf(`version: 1\n${text}`)).toEqual([{ code: "config_alias_limit", path: "", message: "Aliases expand beyond the limit of 100" }]);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("rejects more than the allowed number of alias expansions", () => {
    const aliases = Array(LIMITS.maxAliasExpansions + 1).fill("*a").join(", ");
    expect(codes(`version: 1\nx: &a [1]\ny: [${aliases}]\n`)).toEqual(["config_alias_limit"]);
  });

  it("rejects nesting deeper than the maximum", () => {
    const [issue] = issuesOf(withBody(nested(LIMITS.maxDepth - 2)));
    expect(issue.code).toBe("config_too_deep");
    expect(issue.path).toMatch(/^sources\.s\.body/);
    expect(issue.message).toBe("Nesting is deeper than 32 levels");
  });

  it("survives absurd nesting without crashing", () => {
    expect(codes(`a: ${"[".repeat(100_000)}${"]".repeat(100_000)}`).length).toBeGreaterThan(0);
    expect(codes("[".repeat(200_000)).length).toBeGreaterThan(0);
  });

  it("rejects a cyclic alias instead of looping", () => {
    expect(codes("version: 1\na: &a [*a]\n").length).toBeGreaterThan(0);
  });
});

describe("parseConfig forbidden keys", () => {
  it.each([
    ["top level", "__proto__: { admin: true }\nversion: 1\n", ""],
    ["quoted", '"__proto__": 1\nversion: 1\n', ""],
    ["flow", '{ "__proto__": { "x": 1 }, version: 1 }', ""],
    ["nested in a source", "version: 1\nsources:\n  s:\n    __proto__: { x: 1 }\n", "sources.s"],
    ["in a list item", "version: 1\npages:\n  - __proto__: 1\n", "pages[0]"],
    ["in a static body", withBody('{ "__proto__": { "x": 1 } }'), "sources.s.body"],
  ])("rejects __proto__ %s", (_name, text, path) => {
    expect(issuesOf(text)).toEqual([{ code: "config_forbidden_key", path, message: "The key __proto__ is not allowed" }]);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it("does not treat a merge key as a merge", () => {
    const text = `version: 1\nproject: { name: X }\nsources:\n  base: &b { url: "https://a.example" }\n  s:\n    <<: *b\npages: [{ id: p, title: P, widgets: [] }]\n`;
    expect(issuesOf(text).map((i) => [i.code, i.path])).toContainEqual(["config_unknown_field", "sources.s.<<"]);
  });
});

describe("parseConfig YAML problems", () => {
  it("reports syntax errors with a line", () => {
    const [issue] = issuesOf("version: 1\nproject: [unclosed\n");
    expect(issue).toMatchObject({ code: "config_syntax", path: "", line: 3 });
    expect(issue.message).toMatch(/\bline 3\b/);
  });

  it("reports the line where the problem is, not the last one", () => {
    expect(issuesOf("a:\n  b: 1\n c: 2\nd: 3\ne: 4\n")[0]).toMatchObject({ code: "config_syntax", line: 3 });
  });

  it("keeps the offending source text out of syntax messages", () => {
    const text = "version: 1\ntoken: [s3cr3t-value-123\nother: 1\n";
    const issues = issuesOf(text);
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.message).not.toContain("\n");
      expect(issue.message).not.toContain("s3cr3t");
    }
  });

  it("rejects tab indentation, duplicate keys and several documents", () => {
    expect(codes("a:\n\t- b\n")).toContain("config_syntax");
    expect(codes("version: 1\nversion: 1\n")).toEqual(["config_duplicate_key"]);
    expect(codes("version: 1\n---\nversion: 1\n")).toEqual(["config_multiple_documents"]);
  });

  it("rejects collections used as keys", () => {
    expect(issuesOf("? [a, b]\n: 1\n")).toEqual([{ code: "config_syntax", path: "", line: 1, message: "Keys must be plain text, not lists or mappings" }]);
    expect(issuesOf("version: 1\nx:\n  ? { a: 1 }\n  : 2\n")).toMatchObject([{ code: "config_syntax", line: 3 }]);
  });

  it("rejects unknown tags", () => {
    expect(codes('version: 1\nx: !!js/function "alert(1)"\n')).toEqual(["config_syntax"]);
  });

  it("caps the number of syntax issues", () => {
    expect(issuesOf(`${"\t- x\n".repeat(60)}`).length).toBeLessThanOrEqual(20);
  });

  it.each([["", "empty"], ["# only a comment\n", "comment"], ["hello", "scalar"], ["- a\n- b\n", "list"], ["null", "null"], ["42", "number"]])(
    "rejects a document that is not a mapping: %j (%s)",
    (text) => expect(issuesOf(text)).toEqual([{ code: "config_not_a_mapping", path: "", message: "The file must contain a mapping at its top level" }]),
  );

  it("never throws on garbage", () => {
    for (const text of ["\u0000", "{", "}", "- - -", "!!binary x", "&a", "*a", "? ? ?", ": :", "\uFEFF", "a: |\n", `${"a".repeat(10_000)}: 1`]) {
      expect(() => parseConfig(text), JSON.stringify(text.slice(0, 20))).not.toThrow();
    }
  });
});

describe("parseConfig version", () => {
  it("requires version 1", () => {
    expect(issuesOf("project: { name: X }\n")).toEqual([{ code: "config_required", path: "version", message: "The version field is required" }]);
    for (const version of ["2", '"1"', "0", "null", "[1]", "1.5"]) {
      expect(issuesOf(`version: ${version}\n`)).toEqual([{ code: "config_unsupported_version", path: "version", message: "Only version 1 is supported" }]);
    }
  });
});

describe("parseConfig schema issues", () => {
  it("reports unknown fields with their full path", () => {
    const text = VALID.replace("unit: \"%\"", 'unit: "%"\n        colour: red').replace("version: 1", "version: 1\nextra: 1");
    expect(issuesOf(text)).toEqual(
      expect.arrayContaining([
        { code: "config_unknown_field", path: "extra", message: 'Unknown field "extra"' },
        { code: "config_unknown_field", path: "pages[0].widgets[0].colour", message: 'Unknown field "colour"' },
      ]),
    );
  });

  it("reports missing required fields", () => {
    const issues = issuesOf("version: 1\nproject: {}\npages: [{ id: p, title: P, widgets: [{ type: kpi, source: s, path: a }] }]\n");
    expect(issues.map((i) => [i.code, i.path])).toEqual(expect.arrayContaining([["config_required", "project.name"]]));
  });

  it("reports invalid values and unknown widget types", () => {
    const issues = issuesOf(
      "version: 1\nproject: { name: X, color: red }\npages:\n  - id: p\n    title: P\n    widgets:\n      - { type: gauge }\n",
    );
    expect(issues.map((i) => [i.code, i.path])).toEqual([
      ["config_invalid_value", "project.color"],
      ["config_invalid_value", "pages[0].widgets[0].type"],
    ]);
  });

  it("tells a wrong type from a missing field", () => {
    const text = "version: 1\nproject: { name: 5 }\npages: [{ id: p, title: P }]\n";
    expect(issuesOf(text).map((i) => [i.code, i.path])).toEqual([
      ["config_invalid_value", "project.name"],
      ["config_required", "pages[0].widgets"],
    ]);
  });

  it("reports unknown sources", () => {
    const text = "version: 1\nproject: { name: X }\npages: [{ id: p, title: P, widgets: [{ type: kpi, source: ghost, path: a, label: L }] }]\n";
    expect(issuesOf(text)).toEqual([{ code: "config_unknown_source", path: "pages[0].widgets[0].source", message: 'Unknown source "ghost"' }]);
  });

  it("reports at most 20 issues", () => {
    const fields = Array.from({ length: 40 }, (_, i) => `f${i}: 1`).join("\n");
    expect(issuesOf(`${MINIMAL}${fields}\n`)).toHaveLength(20);
  });

  it("never echoes values in messages", () => {
    const secret = "s3cr3t-value-123";
    const texts = [
      `version: 1\nproject: { name: 5, color: ${secret} }\npages: [{ id: p, title: P, widgets: [] }]\n`,
      `version: 1\nproject: { name: X }\nsources: { s: { url: "https://${secret}@a.example", ttl: ${secret} } }\npages: [{ id: p, title: P, widgets: [{ type: ${secret} }] }]\n`,
      `version: ${secret}\n`,
    ];
    for (const text of texts) {
      expect(JSON.stringify(issuesOf(text))).not.toContain(secret);
    }
  });
});

describe("parseConfig lines", () => {
  const text = `version: 1
project:
  name: X
  logo: y
sources:
  s:
    url: https://a.example
    ttl: 1s
pages:
  - id: p
    title: P
    widgets:
      - type: kpi
        source: ghost
        path: a
        label: L
`;
  it("points schema issues at the offending line", () => {
    const result = parseConfig(text);
    expect(result.ok).toBe(false);
    const lines = Object.fromEntries(result.ok ? [] : result.issues.map((i) => [i.path, i.line]));
    expect(lines).toMatchObject({ "project.logo": 4, "sources.s.ttl": 8 });
    expect(linesOf(text.replace("    ttl: 1s\n", "").replace("  logo: y\n", ""))).toMatchObject({ "pages[0].widgets[0].source": 12 });
  });

  it("falls back to the closest parent (where its value starts) for a missing field", () => {
    expect(linesOf("version: 1\nproject:\n  color: \"#fff000\"\npages:\n  - id: p\n    title: P\n")).toMatchObject({ "project.name": 3, "pages[0].widgets": 5 });
  });

  it("locates the version", () => {
    expect(linesOf("# c\n\nversion: 2\n")).toEqual({ version: 3 });
    expect(linesOf("project: {}\n")).toEqual({ version: 1 });
  });
});

describe("formatPath", () => {
  it("formats keys and indexes", () => {
    expect(formatPath([])).toBe("");
    expect(formatPath(["pages", 0, "widgets", 12, "source"])).toBe("pages[0].widgets[12].source");
    expect(formatPath([0, "a"])).toBe("[0].a");
    expect(formatPath(["a"])).toBe("a");
  });
});
