import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LIMITS } from "./limits";
import { ConfigV1, WIDGET_TYPES } from "./schema-v1";

const base = { version: 1, project: { name: "Starfall" }, pages: [{ id: "overview", title: "Overview", widgets: [] }] };
const withWidgets = (...widgets: unknown[]) => ({ ...base, sources: { s: { url: "https://a.example/x" } }, pages: [{ id: "p", title: "P", widgets }] });
const withSource = (source: unknown) => ({ ...base, sources: { s: source } });
const kpi = { type: "kpi", source: "s", path: "a.b", label: "L" };

const ok = (value: unknown) => ConfigV1.safeParse(value);
const issues = (value: unknown) => {
  const result = ok(value);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};
const rejects = (value: unknown, where?: string) => {
  const found = issues(value);
  expect(found.length, "expected a rejection").toBeGreaterThan(0);
  if (where) expect(found.some((m) => m.startsWith(where))).toBe(true);
};

// The sample of docs/scope.md, as parsed from YAML.
const sample = {
  version: 1,
  project: { name: "Starfall", color: "#7c3aed" },
  sources: {
    game_stats: {
      url: "https://api.starfall.example/internal/stats",
      method: "GET",
      headers: { Authorization: "Bearer ${GAME_API_TOKEN}" },
      ttl: "60s",
    },
  },
  pages: [
    {
      id: "overview",
      title: "Overview",
      widgets: [
        { type: "kpi", source: "game_stats", path: "data.retention.d7", label: "Day-7 retention", unit: "%", alert: { below: 18 } },
        { type: "github.pull_requests", state: "open" },
      ],
    },
  ],
};

describe("ConfigV1 valid configs", () => {
  it("accepts the scope sample and fills defaults", () => {
    const result = ConfigV1.parse(sample);
    expect(result.sources.game_stats.method).toBe("GET");
    expect(result.pages[0].widgets[1]).toEqual({ type: "github.pull_requests", state: "open", limit: 10 });
  });

  it("defaults widget options", () => {
    const [table] = ConfigV1.parse(withWidgets({ type: "table", source: "s", path: "a", columns: [{ header: "H", path: "p" }] })).pages[0].widgets;
    expect(table).toMatchObject({ searchable: true, columns: [{ format: "text" }] });
    expect(ConfigV1.parse(withWidgets({ type: "github.issues" })).pages[0].widgets[0]).toMatchObject({ state: "open", limit: 10 });
  });

  it("defaults sources, method and ttl", () => {
    const result = ConfigV1.parse(withSource({ url: "http://a.example/x" }));
    expect(result.sources.s).toEqual({ url: "http://a.example/x", method: "GET", ttl: "5m" });
    expect(ConfigV1.parse(base).sources).toEqual({});
  });

  it("accepts a POST source with headers and a static body", () => {
    expect(ok(withSource({ url: "https://a.example/q?k=${KEY}", method: "POST", body: { query: "{ a }", n: [1, null] }, headers: { "X-Api-Key": "${K}" } })).success).toBe(true);
  });

  it("accepts one widget of every type", () => {
    const widgets = [
      kpi,
      { type: "kpi", source: "s", path: "a", label: "L", trend: "a_delta", alert: { above: 1 } },
      { type: "line", source: "s", path: "a", x: "d", y: "v" },
      { type: "bar", source: "s", path: "a", x: "d", y: "v" },
      { type: "donut", source: "s", path: "a", name: "n", value: "v" },
      { type: "table", source: "s", path: "a", columns: [{ header: "H", path: "p" }], searchable: false },
      { type: "status", source: "s", path: "a", up: ["ok", 200, true], degraded: ["slow"] },
      { type: "cohort", source: "s", path: "a", cohort: "week", values: "ret" },
      { type: "markdown", content: "# Hi" },
      { type: "markdown", source: "s", path: "a.notes" },
      { type: "github.issues", state: "all", limit: 50 },
      { type: "github.pull_requests" },
      { type: "github.workflow_runs", branch: "main" },
      { type: "github.releases", title: "Releases" },
    ];
    expect(issues(withWidgets(...widgets))).toEqual([]);
    expect(new Set(widgets.map((w) => w.type))).toEqual(new Set(WIDGET_TYPES));
  });

  it("lists the widget catalog", () => {
    expect([...WIDGET_TYPES].sort()).toEqual(
      ["bar", "cohort", "donut", "github.issues", "github.pull_requests", "github.releases", "github.workflow_runs", "kpi", "line", "markdown", "status", "table"],
    );
  });

  it("accepts the documented limits exactly", () => {
    const sources = Object.fromEntries(Array.from({ length: LIMITS.maxSources }, (_, i) => [`s${i}`, { url: "https://a.example" }]));
    expect(ok({ ...base, sources }).success).toBe(true);
    const widgets = Array.from({ length: LIMITS.maxWidgets }, () => ({ type: "github.releases" }));
    expect(ok({ ...base, pages: [{ id: "p", title: "P", widgets }] }).success).toBe(true);
    expect(ok(withSource({ url: "https://a.example", ttl: "10s" })).success).toBe(true);
    expect(ok(withSource({ url: "https://a.example", ttl: "24h" })).success).toBe(true);
  });
});

describe("ConfigV1 rejects invalid configs", () => {
  it.each([
    ["wrong version", { ...base, version: 2 }, "version"],
    ["missing version", { project: base.project, pages: base.pages }, "version"],
    ["string version", { ...base, version: "1" }, "version"],
    ["unknown root field", { ...base, extra: 1 }, ""],
    ["unknown project field", { ...base, project: { name: "X", logo: "y" } }, "project"],
    ["empty project name", { ...base, project: { name: "" } }, "project.name"],
    ["bad color", { ...base, project: { name: "X", color: "red" } }, "project.color"],
    ["short color", { ...base, project: { name: "X", color: "#fff" } }, "project.color"],
    ["trailing color junk", { ...base, project: { name: "X", color: "#7c3aedx" } }, "project.color"],
    ["leading color junk", { ...base, project: { name: "X", color: "x#7c3aed" } }, "project.color"],
    ["page id with space", { ...base, pages: [{ id: "a b", title: "P", widgets: [] }] }, "pages.0.id"],
    ["page id too long", { ...base, pages: [{ id: `a${"b".repeat(64)}`, title: "P", widgets: [] }] }, "pages.0.id"],
    ["no pages", { ...base, pages: [] }, "pages"],
    ["unknown page field", { ...base, pages: [{ id: "p", title: "P", widgets: [], icon: "x" }] }, "pages"],
    ["bad page id", { ...base, pages: [{ id: "Over View", title: "P", widgets: [] }] }, "pages.0.id"],
    ["empty page title", { ...base, pages: [{ id: "p", title: "", widgets: [] }] }, "pages.0.title"],
  ])("%s", (_name, config, where) => rejects(config, where));

  it("rejects duplicate page ids", () => {
    rejects({ ...base, pages: [{ id: "p", title: "A", widgets: [] }, { id: "p", title: "B", widgets: [] }] }, "pages.1.id");
  });

  it("rejects more than the allowed sources and widgets", () => {
    const sources = Object.fromEntries(Array.from({ length: LIMITS.maxSources + 1 }, (_, i) => [`s${i}`, { url: "https://a.example" }]));
    rejects({ ...base, sources }, "sources");
    const page = (n: number) => ({ id: `p${n}`, title: "P", widgets: Array.from({ length: 51 }, () => ({ type: "github.releases" })) });
    rejects({ ...base, pages: [page(1), page(2)] }, "pages"); // 102 across pages
    rejects({ ...base, pages: [{ id: "p", title: "P", widgets: Array.from({ length: 101 }, () => ({ type: "github.releases" })) }] }, "pages");
  });

  it("rejects bad source ids", () => {
    for (const id of ["Upper", "1abc", "a-b", "a".repeat(65), ""]) {
      rejects({ ...base, sources: { [id]: { url: "https://a.example" } } }, "sources");
    }
  });

  it("never lets a __proto__ source reach the result (the parser rejects the key outright)", () => {
    const sources = JSON.parse('{"__proto__": {"url": "https://a.example"}}');
    const result = ConfigV1.parse({ ...base, sources });
    expect(Object.keys(result.sources)).toEqual([]);
    expect(Object.getPrototypeOf(result.sources)).toBe(Object.prototype);
  });

  it.each([
    ["file scheme", "file:///etc/passwd"],
    ["ftp scheme", "ftp://a.example/x"],
    ["javascript scheme", "javascript:alert(1)"],
    ["no scheme", "a.example/x"],
    ["relative", "/x"],
    ["credentials", "https://user:pass@a.example/x"],
    ["user only", "https://token@a.example/x"],
    ["spoofed host", "https://a.example@evil.example/x"],
    ["secret in host", "https://${HOST}.example.com/x"],
    ["secret as host", "https://${HOST}/x"],
    ["too long", `https://a.example/${"a".repeat(2048)}`],
  ])("rejects source url: %s", (_name, url) => rejects(withSource({ url }), "sources.s.url"));

  it.each([
    ["Host", "evil"],
    ["content-length", "1"],
    ["Transfer-Encoding", "chunked"],
    ["CONNECTION", "close"],
    ["Bad Name", "x"],
    ["X-A", "line\r\nInjected: 1"],
    ["X-A", "tab\there"],
    ["X-A", "é"],
    ["X-A", "a".repeat(2049)],
  ])("rejects header %s: %j", (name, value) => rejects(withSource({ url: "https://a.example", headers: { [name]: value } }), "sources.s.headers"));

  it("rejects bad methods, bodies without POST and bad ttls", () => {
    rejects(withSource({ url: "https://a.example", method: "DELETE" }), "sources.s.method");
    rejects(withSource({ url: "https://a.example", method: "get" }), "sources.s.method");
    rejects(withSource({ url: "https://a.example", body: { a: 1 } }), "sources.s.body");
    rejects(withSource({ url: "https://a.example", method: "GET", body: {} }), "sources.s.body");
    rejects(withSource({ url: "https://a.example", body: [1] , method: "POST"}), "sources.s.body");
    for (const ttl of ["9s", "25h", "1441m", "5", "5d", "0m", 60]) rejects(withSource({ url: "https://a.example", ttl }), "sources.s.ttl");
    rejects(withSource({ url: "https://a.example", retries: 3 }), "sources.s");
  });

  it("rejects unknown widget types and fields", () => {
    rejects(withWidgets({ type: "gauge" }), "pages.0.widgets.0");
    rejects(withWidgets({}), "pages.0.widgets.0");
    rejects(withWidgets({ ...kpi, color: "red" }), "pages.0.widgets.0");
    rejects(withWidgets({ type: "github.issues", repo: "a/b" }), "pages.0.widgets.0");
  });

  it("rejects widgets pointing to unknown sources, including inherited names", () => {
    rejects(withWidgets({ ...kpi, source: "nope" }), "pages.0.widgets.0.source");
    rejects(withWidgets({ ...kpi, source: "constructor" }), "pages.0.widgets.0.source");
    rejects(withWidgets(kpi, { ...kpi, source: "ghost" }), "pages.0.widgets.1.source");
    rejects(withWidgets({ type: "markdown", source: "ghost", path: "a" }), "pages.0.widgets.0.source");
  });

  it.each([
    "",
    "$.a",
    "a..b",
    "a.",
    ".a",
    "a.*",
    "a[*]",
    "a[-1]",
    "a[]",
    "a[0",
    "a[?(@.x)]",
    "a b",
    "a;b",
    "a()",
    "1a",
    "__proto__",
    "a.__proto__.b",
    "constructor.prototype",
    "a[0].constructor",
    "a[1234567]",
    "a".repeat(257),
  ])("rejects json path %j", (path) => rejects(withWidgets({ ...kpi, path }), "pages.0.widgets.0.path"));

  it("accepts plain and indexed json paths", () => {
    for (const path of ["a", "a.b", "a_b.c-d", "a[0]", "items[12].name", "a.0.b", "_x"]) {
      expect(ok(withWidgets({ ...kpi, path })).success, path).toBe(true);
    }
    expect(ok(withWidgets({ ...kpi, path: "a".repeat(256) })).success).toBe(true);
  });

  it("rejects incomplete or invalid widget fields", () => {
    const bad = (widget: unknown) => rejects(withWidgets(widget), "pages.0.widgets.0");
    bad({ type: "kpi", source: "s", path: "a" }); // label missing
    bad({ ...kpi, label: "" });
    bad({ ...kpi, label: "x".repeat(81) });
    bad({ ...kpi, unit: "" });
    bad({ ...kpi, trend: "a b" });
    bad({ ...kpi, alert: {} });
    bad({ ...kpi, alert: { below: Number.POSITIVE_INFINITY } });
    bad({ ...kpi, alert: { below: "1" } });
    bad({ ...kpi, alert: { sound: true, below: 1 } });
    bad({ ...kpi, title: "" });
    bad({ ...kpi, title: "x".repeat(121) });
    bad({ type: "line", source: "s", path: "a", x: "d" });
    bad({ type: "donut", source: "s", path: "a", name: "n" });
    bad({ type: "table", source: "s", path: "a", columns: [] });
    bad({ type: "table", source: "s", path: "a", columns: Array.from({ length: 21 }, () => ({ header: "H", path: "p" })) });
    bad({ type: "table", source: "s", path: "a", columns: [{ header: "H", path: "p", format: "html" }] });
    bad({ type: "table", source: "s", path: "a", columns: [{ header: "", path: "p" }] });
    bad({ type: "status", source: "s", path: "a", up: [] });
    bad({ type: "status", source: "s", path: "a", up: [{}] });
    bad({ type: "status", source: "s", path: "a", up: ["ok"], degraded: Array.from({ length: 21 }, () => 1) });
    bad({ type: "cohort", source: "s", path: "a", cohort: "w" });
    bad({ type: "github.issues", state: "merged" });
    bad({ type: "github.issues", limit: 0 });
    bad({ type: "github.issues", limit: 51 });
    bad({ type: "github.issues", limit: 1.5 });
    bad({ type: "github.workflow_runs", branch: "" });
  });

  it("requires markdown to have either inline content or a source with a path", () => {
    rejects(withWidgets({ type: "markdown" }), "pages.0.widgets.0");
    rejects(withWidgets({ type: "markdown", content: "x", source: "s", path: "a" }), "pages.0.widgets.0");
    rejects(withWidgets({ type: "markdown", source: "s" }), "pages.0.widgets.0.path");
    rejects(withWidgets({ type: "markdown", path: "a" }), "pages.0.widgets.0");
    rejects(withWidgets({ type: "markdown", content: "x", source: "s" }), "pages.0.widgets.0.path");
    rejects(withWidgets({ type: "markdown", content: "" }), "pages.0.widgets.0");
    rejects(withWidgets({ type: "markdown", content: "x".repeat(10_001) }), "pages.0.widgets.0");
  });

  it("is not fooled by a __proto__ key in the parsed document", () => {
    const polluted = JSON.parse('{"version":1,"project":{"name":"X"},"pages":[{"id":"p","title":"P","widgets":[]}],"__proto__":{"admin":true}}');
    rejects(polluted);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });
});

describe("ConfigV1 JSON Schema", () => {
  type Node = { properties?: Record<string, Node>; items?: Node; anyOf?: Node[]; oneOf?: Node[]; additionalProperties?: Node | boolean; description?: string; examples?: unknown[]; $ref?: string };
  const schema = z.toJSONSchema(ConfigV1, { io: "input", target: "draft-2020-12" }) as unknown as Node;

  const walk = (node: Node, path: string, visit: (n: Node, p: string) => void) => {
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      visit(child, `${path}.${key}`);
      walk(child, `${path}.${key}`, visit);
    }
    for (const sub of [node.items, ...(node.anyOf ?? []), ...(node.oneOf ?? []), typeof node.additionalProperties === "object" ? node.additionalProperties : undefined]) {
      if (sub) walk(sub, path, visit);
    }
  };

  it("documents every field with a description and an example", () => {
    const missing: string[] = [];
    let count = 0;
    walk(schema, "", (node, path) => {
      count += 1;
      if (!node.description) missing.push(`${path}: description`);
      if (!node.examples?.length) missing.push(`${path}: examples`);
    });
    expect(count).toBeGreaterThan(60);
    expect(missing).toEqual([]);
  });

  it("forbids unknown fields", () => {
    expect(schema.additionalProperties).toBe(false);
  });
});
