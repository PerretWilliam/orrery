// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ConfigV1 } from "@/features/config/domain/schema-v1";
import type { ProxyResult } from "@/features/data-proxy/domain/source-proxy";
import { createWidgetData } from "./widget-data";

const config = ConfigV1.parse({
  version: 1,
  project: { name: "S" },
  sources: {
    stats: { url: "https://api.example.com/s", headers: { Authorization: "Bearer ${TOKEN}" }, ttl: "90s" },
    q: { url: "https://api.example.com/q", method: "POST", body: { query: "{x}" } },
  },
  pages: [{ id: "overview", title: "O", widgets: [] }],
});
const project = { id: "r1", owner: "acme", name: "web", config };
const fetchedAt = new Date(1000);
const hit = (state: "fresh" | "stale" | "miss", data: unknown = { n: 1 }): ProxyResult => ({ ok: true, state, data, fetchedAt, expiresAt: new Date(2000) });
const setup = (result: ProxyResult, activity = vi.fn()) => {
  const get = vi.fn(async () => result);
  return { get, activity, widgets: createWidgetData({ proxy: { get }, activity: { load: activity } }) };
};
const kpi = { type: "kpi", source: "stats", path: "n", label: "N" } as never;

describe("widget data", () => {
  it("asks the proxy for the source of the widget, with the project, the request as written and the TTL in seconds", async () => {
    const { get, widgets } = setup(hit("fresh"));
    expect(await widgets.load(project, kpi)).toEqual({ ok: true, data: { n: 1 }, fetchedAt, stale: false });
    expect(get).toHaveBeenCalledWith({
      repositoryId: "r1",
      source: { url: "https://api.example.com/s", method: "GET", headers: { Authorization: "Bearer ${TOKEN}" }, body: undefined, ttlSeconds: 90 },
    });
  });
  it("passes the static body of a POST source", async () => {
    const { get, widgets } = setup(hit("miss"));
    await widgets.load(project, { type: "table", source: "q", path: "p", columns: [] } as never);
    expect(get).toHaveBeenCalledWith({ repositoryId: "r1", source: expect.objectContaining({ method: "POST", body: { query: "{x}" }, ttlSeconds: 300 }) });
  });
  it("falls back to 5 minutes if a stored TTL is somehow unusable", async () => {
    const { get, widgets } = setup(hit("fresh"));
    const odd = { id: "r1", owner: "acme", name: "web", config: { sources: { s: { url: "https://a.test/", method: "GET", ttl: "bad" } } } as never };
    await widgets.load(odd, { type: "kpi", source: "s", path: "n", label: "N" } as never);
    expect(get).toHaveBeenCalledWith({ repositoryId: "r1", source: expect.objectContaining({ ttlSeconds: 300 }) });
  });
  it("marks stale data, which is being refreshed in the background", async () => {
    expect(await setup(hit("stale")).widgets.load(project, kpi)).toMatchObject({ ok: true, stale: true });
  });
  it("returns the failure instead of throwing, so it stays in its widget", async () => {
    const errors = [{ code: "source_timeout", message: "m", fix: "f" }];
    expect(await setup({ ok: false, errors }).widgets.load(project, kpi)).toEqual({ ok: false, errors });
  });
  it("reads nothing for a widget without a source", async () => {
    const { get, widgets } = setup(hit("fresh"));
    expect(await widgets.load(project, { type: "markdown", content: "hi" } as never)).toEqual({ ok: true, data: null, fetchedAt: null, stale: false });
    expect(get).not.toHaveBeenCalled();
  });
  it("fails with a code when the source is not declared, and never reaches an inherited property", async () => {
    const { get, widgets } = setup(hit("fresh"));
    for (const source of ["nope", "toString", "constructor"]) {
      expect(await widgets.load(project, { type: "kpi", source, path: "n", label: "N" } as never)).toMatchObject({ ok: false, errors: [{ code: "config_unknown_source" }] });
    }
    expect(get).not.toHaveBeenCalled();
  });
  describe("GitHub widgets", () => {
    const at = new Date(5000);
    it("read the repository's own lists through the Git host, with the options of the widget, and never the proxy", async () => {
      const { get, activity, widgets } = setup(hit("fresh"), vi.fn(async () => ({ ok: true, items: [1], fetchedAt: at, stale: false })));
      expect(await widgets.load(project, { type: "github.issues", state: "closed", limit: 3 } as never)).toEqual({ ok: true, data: [1], fetchedAt: at, stale: false });
      expect(activity).toHaveBeenCalledWith(project, { kind: "issues", state: "closed", branch: undefined, limit: 3 });
      await widgets.load(project, { type: "github.workflow_runs", branch: "main", limit: 2 } as never);
      expect(activity).toHaveBeenLastCalledWith(project, { kind: "workflow_runs", state: undefined, branch: "main", limit: 2 });
      expect(get).not.toHaveBeenCalled();
    });
    it("return the failure of the Git host in the widget's cell", async () => {
      const errors = [{ code: "github_unavailable", message: "m", fix: "f" }];
      const { widgets } = setup(hit("fresh"), vi.fn(async () => ({ ok: false, errors })));
      expect(await widgets.load(project, { type: "github.releases", limit: 1 } as never)).toEqual({ ok: false, errors });
    });
  });
});
