import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { extractPath } from "@/features/config/domain/json-path";
import { LIMITS } from "@/features/config/domain/limits";
import { parseConfig } from "@/features/config/domain/parse-config";
import { LOADERS } from "@/features/widgets/components/registry";
import type { WidgetType } from "@/features/widgets/domain/types";
import { CONTENT_SECURITY_POLICY } from "@/lib/csp";
import messages from "../../messages/en.json";

/** Content that comes from a repository or a source is hostile until proven otherwise (docs/scope.md, threat table). */

const SCRIPTS = [
  "</style><script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  '"><svg onload=alert(1)>',
  "</script><iframe src=javascript:alert(1)></iframe>",
  "a: red} body { display: none } [x",
];
const BAD_URLS = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "//evil.test/x"];

/** What a browser would build from the HTML the server sends. */
function browserView(html: string) {
  const document = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
  const elements = [...document.querySelectorAll("*")];
  return {
    injected: document.querySelectorAll("script, img, iframe, object, embed, form, base, meta, link, svg[onload]"),
    handlers: elements.flatMap((el) => [...el.attributes].filter((a) => a.name.startsWith("on")).map((a) => `${el.tagName} ${a.name}`)),
    urls: elements.flatMap((el) => ["href", "src", "action", "formaction", "xlink:href"].flatMap((name) => el.getAttribute(name) ?? [])),
    styles: [...document.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n"),
  };
}

describe("threat: XSS", () => {
  const components = new Map<string, React.ComponentType<{ widget: never; data: unknown }>>();
  beforeAll(async () => {
    for (const [type, load] of Object.entries(LOADERS)) components.set(type, (await load()).default as never);
  });

  // One fixture per widget type, hostile in every place a repository or a source can write to.
  const fixtures: Record<WidgetType, (x: string) => { widget: object; data: unknown }> = {
    kpi: (x) => ({ widget: { type: "kpi", title: x, label: x, unit: x, source: "s", path: "v" }, data: { v: x } }),
    status: (x) => ({ widget: { type: "status", title: x, source: "s", path: "v", up: [x] }, data: { v: x } }),
    line: (x) => ({ widget: { type: "line", title: x, source: "s", path: "l", x: "a", y: "b" }, data: { l: [{ a: x, b: 1 }] } }),
    bar: (x) => ({ widget: { type: "bar", title: x, source: "s", path: "l", x: "a", y: "b" }, data: { l: [{ a: x, b: 1 }] } }),
    donut: (x) => ({ widget: { type: "donut", title: x, source: "s", path: "l", name: "a", value: "b" }, data: { l: [{ a: x, b: 1 }] } }),
    table: (x) => ({
      widget: { type: "table", title: x, source: "s", path: "l", searchable: true, columns: ["text", "number", "date", "badge"].map((format) => ({ header: x, path: "a", format })) },
      data: { l: [{ a: x }] },
    }),
    cohort: (x) => ({ widget: { type: "cohort", title: x, source: "s", path: "l", cohort: "a", values: "v" }, data: { l: [{ a: x, v: [1] }] } }),
    markdown: (x) => ({
      widget: { type: "markdown", title: x, source: "s", path: "t" },
      data: { t: [x, `# ${x}`, `**${x}** and \`${x}\``, `> ${x}`, `- ${x}`, ...BAD_URLS.map((url) => `[${x}](${url})`)].join("\n\n") },
    }),
    "github.issues": (x) => github("github.issues", x),
    "github.pull_requests": (x) => github("github.pull_requests", x),
    "github.workflow_runs": (x) => github("github.workflow_runs", x),
    "github.releases": (x) => github("github.releases", x),
  };
  const github = (type: string, x: string) => ({
    widget: { type, title: x },
    data: BAD_URLS.map((url, i) => ({ key: `#${i}`, title: x, state: x, by: x, url, at: x })),
  });

  it.each(Object.keys(LOADERS) as WidgetType[])("the %s widget renders hostile source values as text", (type) => {
    for (const payload of SCRIPTS) {
      // Short labels are cut: keep the payload whole where a widget cuts at 64 characters.
      expect(payload.length).toBeLessThanOrEqual(64);
      const { widget, data } = fixtures[type](payload);
      const Component = components.get(type) as React.ComponentType<{ widget: unknown; data: unknown }>;
      // Server rendering, as the hub does it: this is the HTML a browser parses.
      const html = renderToString(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <Component widget={widget} data={data} />
        </NextIntlClientProvider>,
      );
      const seen = browserView(html);
      expect([...seen.injected].map((el) => el.outerHTML)).toEqual([]);
      expect(seen.handlers).toEqual([]);
      expect(seen.urls.filter((url) => !/^https:\/\/github\.com\//.test(url))).toEqual([]);
      expect(seen.styles).not.toContain("display: none");
    }
  });

  it("the content security policy allows no other origin, plug-in, frame or eval", () => {
    for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "connect-src 'self'"]) {
      expect(CONTENT_SECURITY_POLICY.split("; ")).toContain(directive);
    }
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/\*|unsafe-eval|https?:/);
  });
});

const yml = (rest: string) => `version: 1\nproject:\n  name: A\n${rest}`;
const PAGE = "pages:\n  - id: main\n    title: Main\n    widgets: []\n";
const codes = (text: string) => {
  const result = parseConfig(text);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
};

describe("threat: Malicious config", () => {
  it("accepts the harmless file the attacks below are built from", () => {
    expect(codes(yml(PAGE))).toEqual([]);
  });

  it("refuses a file over the size cap before parsing it", () => {
    expect(codes(yml(`${PAGE}# ${"x".repeat(LIMITS.maxBytes)}\n`))).toEqual(["config_too_large"]);
  });

  it("refuses an alias bomb", () => {
    const bomb = ["a: &a [x,x,x,x,x,x,x,x,x]"];
    for (const [name, previous] of ["ba", "cb", "dc", "ed", "fe", "gf", "hg"].map((pair) => [pair[0], pair[1]])) {
      bomb.push(`${name}: &${name} [${Array(9).fill(`*${previous}`).join(",")}]`);
    }
    const started = Date.now();
    expect(codes(yml(`${PAGE}${bomb.join("\n")}\n`))).toEqual(["config_alias_limit"]);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("refuses nesting deeper than the limit", () => {
    const deep = `${"[".repeat(LIMITS.maxDepth + 1)}${"]".repeat(LIMITS.maxDepth + 1)}`;
    expect(codes(yml(`${PAGE}deep: ${deep}\n`))).toEqual(["config_too_deep"]);
  });

  it.each([
    ["at the top", yml(`${PAGE}__proto__:\n  polluted: true\n`)],
    ["inside a source", yml(`sources:\n  s:\n    url: https://x.test/a\n    headers: { __proto__: x }\n${PAGE}`)],
  ])("refuses a __proto__ key %s, and pollutes nothing", (_, text) => {
    expect(codes(text)).toEqual(["config_forbidden_key"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses unknown fields and custom YAML tags", () => {
    expect(codes(yml(`${PAGE}exec: rm -rf /\n`))).toEqual(["config_unknown_field"]);
    expect(codes(yml(`${PAGE}x: !!js/function 'function () {}'\n`)).length).toBeGreaterThan(0);
  });

  it("reads paths as data only: no code, no prototype access", () => {
    for (const path of ["a.constructor", "a.__proto__", "constructor.name", "a.toString", "a[0].constructor"]) {
      expect(extractPath({ a: [{}] }, path)).toBeUndefined();
    }
    const widget = (path: string) => yml(`sources:\n  s: {url: 'https://x.test/a'}\npages:\n  - id: main\n    title: Main\n    widgets:\n      - {type: kpi, source: s, label: L, path: '${path}'}\n`);
    expect(codes(widget("data.value"))).toEqual([]);
    for (const path of ["process.exit()", "a[?(@.b)]", "a;b", "$..a", "a[*]"]) expect(codes(widget(path)).length).toBeGreaterThan(0);
  });
});
