import { z } from "zod";
import { parsePath } from "./json-path";
import { LIMITS } from "./limits";
import { parseTtl, TTL_PATTERN } from "./ttl";

// Stryker disable StringLiteral,ObjectLiteral,ArrayDeclaration: the remaining literals are documentation text and examples
// (checked by the JSON Schema test) or enum values and defaults asserted exactly by schema-v1.test.ts.
/**
 * `.hub.yml` version 1. Frozen: fields are never renamed or removed, and a stricter rule is a breaking change.
 * Every field carries a description and an example (checked by a test) because they feed the published JSON Schema.
 * Unknown fields are rejected everywhere.
 */

const field = <T extends z.ZodType>(schema: T, description: string, example: unknown): T =>
  schema.meta({ description, examples: [example] });

// ---- Shared building blocks -------------------------------------------------------------------

const SOURCE_ID = /^[a-z][a-z0-9_]{0,63}$/;
const PAGE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;
const HEADER_VALUE = /^[\x20-\x7e]{0,2048}$/;
const FORBIDDEN_HEADERS = new Set(["host", "content-length", "transfer-encoding", "connection"]);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** A path read by the safe extractor: `data.retention.d7`, `items[0].name`. No wildcards, no expressions. */
const jsonPath = (description: string, example: string) =>
  field(z.string().max(256).refine((p) => parsePath(p) !== null, "Not a plain path such as data.items[0].name"), description, example);

const isPlainHttpUrl = (value: string): boolean => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  const web = url.protocol === "http:" || url.protocol === "https:";
  // Credentials in the URL and `${SECRET}` in the host are refused: secrets go in headers or the body.
  return web && !url.username && !url.password && !/[${}]/.test(url.hostname);
};

const sourceRef = field(z.string().regex(SOURCE_ID), "Id of a source declared under `sources`.", "game_stats");
const title = field(z.string().min(1).max(120).optional(), "Heading shown above the widget.", "Daily active users");
const limit = field(z.number().int().min(1).max(50).default(10), "Maximum number of items to show.", 10);
const itemPath = (what: string, example: string) => jsonPath(`Path of ${what} inside each item.`, example);
const listPath = (example: string) => jsonPath("Path of the array of items in the source response.", example);

// ---- Sources ----------------------------------------------------------------------------------

const Source = z
  .strictObject({
    url: field(
      z.string().max(2048).refine(isPlainHttpUrl, "Must be an http(s) URL without credentials or secrets in the host"),
      "http(s) URL of the endpoint. Secrets (`${NAME}`) are allowed in the path, query and headers, never in the host.",
      "https://api.starfall.example/internal/stats",
    ),
    method: field(z.enum(["GET", "POST"]).default("GET"), "HTTP method.", "GET"),
    headers: field(
      z
        .record(
          z.string().regex(HEADER_NAME).refine((name) => !FORBIDDEN_HEADERS.has(name.toLowerCase()), "Forbidden header"),
          z.string().regex(HEADER_VALUE),
        )
        .optional(),
      "Request headers. Values may reference secrets as `${SECRET_NAME}`.",
      { Authorization: "Bearer ${GAME_API_TOKEN}" },
    ),
    body: field(
      z.record(z.string(), z.json()).optional(),
      "Static JSON body, POST only (for example a GraphQL query).",
      { query: "{ stats { retention } }" },
    ),
    ttl: field(
      z
        .string()
        .regex(TTL_PATTERN)
        .refine((v) => parseTtl(v) !== null, "TTL must be between 10s and 24h")
        .default(LIMITS.ttlDefault),
      "How long a response is cached: a number and `s`, `m` or `h`, from 10s to 24h.",
      "60s",
    ),
  })
  .refine((source) => source.body === undefined || source.method === "POST", {
    path: ["body"],
    message: "A body requires method POST",
  });

// ---- Widgets ----------------------------------------------------------------------------------

const Alert = z
  .strictObject({
    below: field(z.number().finite().optional(), "Highlight the widget when the value is below this number.", 18),
    above: field(z.number().finite().optional(), "Highlight the widget when the value is above this number.", 100),
  })
  .refine((a) => a.below !== undefined || a.above !== undefined, "Set below, above or both");

const Kpi = z.strictObject({
  type: field(z.literal("kpi"), "Single value with optional trend and alert threshold.", "kpi"),
  title,
  source: sourceRef,
  path: jsonPath("Path of the value in the source response.", "data.retention.d7"),
  label: field(z.string().min(1).max(80), "Name of the value.", "Day-7 retention"),
  unit: field(z.string().min(1).max(16).optional(), "Unit shown after the value.", "%"),
  trend: jsonPath("Path of the trend value (a number, shown with an arrow) in the source response.", "data.retention.d7_delta").optional(),
  alert: field(Alert.optional(), "Only changes the color and icon of the widget; never sends a notification.", { below: 18 }),
});

const series = (type: "line" | "bar") =>
  z.strictObject({
    type: field(z.literal(type), `Chart of type ${type}.`, type),
    title,
    source: sourceRef,
    path: listPath("data.daily"),
    x: itemPath("the X value", "date"),
    y: itemPath("the Y value", "players"),
  });

const Donut = z.strictObject({
  type: field(z.literal("donut"), "Donut chart.", "donut"),
  title,
  source: sourceRef,
  path: listPath("data.platforms"),
  name: itemPath("the slice name", "platform"),
  value: itemPath("the slice value", "players"),
});

const Table = z.strictObject({
  type: field(z.literal("table"), "Sortable, searchable table.", "table"),
  title,
  source: sourceRef,
  path: listPath("data.players"),
  columns: field(
    z
      .array(
        z.strictObject({
          header: field(z.string().min(1).max(80), "Column title.", "Player"),
          path: itemPath("the cell value", "name"),
          format: field(
            z.enum(["text", "number", "date", "badge"]).default("text"),
            "How to render the cell. `badge` shows the value as a status badge.",
            "text",
          ),
        }),
      )
      .min(1)
      .max(20),
    "Columns, in display order.",
    [{ header: "Player", path: "name" }],
  ),
  searchable: field(z.boolean().default(true), "Show a search box.", true),
});

const scalar = z.union([z.string().max(64), z.number().finite(), z.boolean()]);

const Status = z.strictObject({
  type: field(z.literal("status"), "Health or uptime indicator: up, degraded or down.", "status"),
  title,
  source: sourceRef,
  path: jsonPath("Path of the value to classify in the source response.", "data.status"),
  up: field(z.array(scalar).min(1).max(20), "Values that mean up.", ["ok"]),
  degraded: field(z.array(scalar).max(20).optional(), "Values that mean degraded. Any other value means down.", ["slow"]),
});

const Cohort = z.strictObject({
  type: field(z.literal("cohort"), "Retention matrix: one row per cohort, one column per day.", "cohort"),
  title,
  source: sourceRef,
  path: listPath("data.cohorts"),
  cohort: itemPath("the cohort name", "week"),
  values: itemPath("the array of retention values, one per day", "retention"),
});

const Markdown = z
  .strictObject({
    type: field(z.literal("markdown"), "Sanitized Markdown notes, inline or read from a source.", "markdown"),
    title,
    content: field(z.string().min(1).max(10_000).optional(), "Inline Markdown. Use this or `source` and `path`.", "Season 3 ships on Friday."),
    source: field(sourceRef.optional(), "Id of a source holding the Markdown. Needs `path`.", "release_notes"),
    path: jsonPath("Path of the Markdown text in the source response.", "data.notes").optional(),
  })
  .refine((w) => (w.content !== undefined) !== (w.source !== undefined && w.path !== undefined), {
    message: "Set either content, or source and path",
  })
  .refine((w) => w.source === undefined || w.path !== undefined, { path: ["path"], message: "source needs path" });

const github = <T extends string, S extends z.ZodRawShape>(type: T, description: string, shape: S) =>
  z.strictObject({ type: field(z.literal(type), description, type), title, ...shape });

const Issues = github("github.issues", "Issues of this repository.", {
  state: field(z.enum(["open", "closed", "all"]).default("open"), "Which issues to list.", "open"),
  limit,
});
const PullRequests = github("github.pull_requests", "Pull requests of this repository.", {
  state: field(z.enum(["open", "closed", "all"]).default("open"), "Which pull requests to list.", "open"),
  limit,
});
const WorkflowRuns = github("github.workflow_runs", "Recent GitHub Actions runs of this repository.", {
  branch: field(z.string().min(1).max(255).optional(), "Only runs on this branch.", "main"),
  limit,
});
const Releases = github("github.releases", "Releases of this repository.", { limit });

const Widget = z.discriminatedUnion("type", [
  Kpi,
  series("line"),
  series("bar"),
  Donut,
  Table,
  Status,
  Cohort,
  Markdown,
  Issues,
  PullRequests,
  WorkflowRuns,
  Releases,
]);

/** Widget types known to schema v1. The widget registry must cover exactly these. */
export const WIDGET_TYPES: readonly string[] = Widget.options.map((option) => option.shape.type.value);

// ---- Root -------------------------------------------------------------------------------------

const Page = z.strictObject({
  id: field(z.string().regex(PAGE_ID), "Unique page id, used in the tab URL.", "overview"),
  title: field(z.string().min(1).max(80), "Page title.", "Overview"),
  widgets: field(z.array(Widget).max(LIMITS.maxWidgets), "Widgets of the page, in display order.", [
    { type: "github.pull_requests", state: "open" },
  ]),
});

export const ConfigV1 = z
  .strictObject({
    version: field(z.literal(1), "Schema version. Always 1.", 1),
    project: field(
      z.strictObject({
        name: field(z.string().min(1).max(80), "Project name shown in the tab.", "Starfall"),
        color: field(z.string().regex(HEX_COLOR).optional(), "Accent color, as #rrggbb.", "#7c3aed"),
      }),
      "Project identity.",
      { name: "Starfall", color: "#7c3aed" },
    ),
    sources: field(
      z.record(z.string().regex(SOURCE_ID), Source).default({}),
      `Data sources by id, ${LIMITS.maxSources} at most. Widgets refer to them by id.`,
      { game_stats: { url: "https://api.starfall.example/internal/stats", ttl: "60s" } },
    ),
    pages: field(z.array(Page).min(1), "Pages of the dashboard. At least one.", [
      { id: "overview", title: "Overview", widgets: [] },
    ]),
  })
  .superRefine((config, ctx) => {
    const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    if (Object.keys(config.sources).length > LIMITS.maxSources) fail(["sources"], `At most ${LIMITS.maxSources} sources`);
    if (config.pages.reduce((n, page) => n + page.widgets.length, 0) > LIMITS.maxWidgets) {
      fail(["pages"], `At most ${LIMITS.maxWidgets} widgets in total`);
    }
    const seen = new Set<string>();
    config.pages.forEach((page, p) => {
      if (seen.has(page.id)) fail(["pages", p, "id"], `Duplicate page id "${page.id}"`);
      seen.add(page.id);
      page.widgets.forEach((widget, w) => {
        const ref = "source" in widget ? widget.source : undefined;
        if (ref !== undefined && !Object.hasOwn(config.sources, ref)) {
          fail(["pages", p, "widgets", w, "source"], `Unknown source "${ref}"`);
        }
      });
    });
  });

export type ConfigV1 = z.infer<typeof ConfigV1>;
