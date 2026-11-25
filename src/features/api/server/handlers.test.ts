import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/features/repos/server/projects";
import { createRateLimiter } from "../domain/rate-limit";
import { createApi } from "./handlers";

const config = {
  version: 1,
  project: { name: "Star" },
  sources: {},
  pages: [{ id: "main", title: "Main", widgets: [{ type: "markdown", title: "Hi", content: "x" }, { type: "github.releases", limit: 5 }] }],
};
const project = { id: "r1", owner: "o", name: "r", title: "Star", archived: false, config, issues: [] } as unknown as Project;
const broken = { ...project, config: null, issues: [{ code: "config_syntax" }] } as unknown as Project;

function setup(over: { open?: Project | null; limit?: number } = {}) {
  const authenticate = vi.fn(async (token: string) => (token === "good" ? { tokenId: "t1", login: "ann" } : null));
  const open = vi.fn(async () => (over.open === undefined ? project : over.open));
  const load = vi.fn<(p: unknown, w: unknown) => Promise<unknown>>(async () => ({ ok: true, data: [1], fetchedAt: new Date("2026-01-01T00:00:00Z"), stale: true }));
  const api = createApi({
    authenticate,
    projects: { visibleTo: async () => [project, broken], open },
    widgetData: { load } as never,
    limiter: createRateLimiter({ limit: over.limit }),
  });
  const get = (token = "good") => new Request("http://hub.test/api/v1/x", { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { api, get, open, load, authenticate };
}
const code = async (r: Response) => (await r.json()).errors[0].code;

describe("REST API", () => {
  it.each([["no header", ""], ["unknown token", "bad"]])("refuses %s with a 401 and the same body", async (_, token) => {
    const { api, get } = setup();
    const response = await api.listProjects(get(token));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await code(response)).toBe("api_unauthorized");
  });
  it("refuses a malformed scheme and an authentication that throws", async () => {
    const { api, authenticate } = setup();
    expect((await api.listProjects(new Request("http://x", { headers: { authorization: "Basic good" } }))).status).toBe(401);
    authenticate.mockRejectedValue(new Error("db down"));
    expect((await api.listProjects(new Request("http://x", { headers: { authorization: "Bearer good" } }))).status).toBe(401);
  });
  it("rate limits per token with Retry-After", async () => {
    const { api, get } = setup({ limit: 1 });
    expect((await api.listProjects(get())).status).toBe(200);
    const limited = await api.listProjects(get());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await code(limited)).toBe("api_rate_limited");
  });
  it("lists the owner's projects, marked untrusted", async () => {
    const { api, get } = setup();
    const body = await (await api.listProjects(get())).json();
    expect(body).toEqual({
      trust: "untrusted",
      projects: [
        { owner: "o", name: "r", title: "Star", archived: false, valid: true },
        { owner: "o", name: "r", title: "Star", archived: false, valid: false },
      ],
    });
  });
  it("describes a project's pages and widgets by index", async () => {
    const { api, get, open } = setup();
    const body = await (await api.getProject(get(), { owner: "o", name: "r" })).json();
    expect(open).toHaveBeenCalledWith({ owner: "o", name: "r" }, "ann");
    expect(body.pages).toEqual([{ id: "main", title: "Main", widgets: [{ index: 0, type: "markdown", title: "Hi" }, { index: 1, type: "github.releases" }] }]);
    expect(body.trust).toBe("untrusted");
  });
  it("shows a never-valid project's issues and no pages", async () => {
    const { api, get } = setup({ open: broken });
    const body = await (await api.getProject(get(), { owner: "o", name: "r" })).json();
    expect(body.pages).toEqual([]);
    expect(body.issues[0].code).toBe("config_syntax");
  });
  it("answers 404 the same for a project the owner may not see", async () => {
    const { api, get } = setup({ open: null });
    expect(await code(await api.getProject(get(), { owner: "o", name: "r" }))).toBe("api_not_found");
    expect(await code(await api.getWidgetData(get(), { owner: "o", name: "r" }, "main", "0"))).toBe("api_not_found");
  });
  it("returns widget data with its freshness", async () => {
    const { api, get, load } = setup();
    const body = await (await api.getWidgetData(get(), { owner: "o", name: "r" }, "main", "1")).json();
    expect(body).toEqual({ trust: "untrusted", data: [1], fetchedAt: "2026-01-01T00:00:00.000Z", stale: true });
    expect(load).toHaveBeenCalledWith({ owner: "o", name: "r", id: "r1", config }, config.pages[0].widgets[1]);
  });
  it("has null freshness for a widget without a source", async () => {
    const { api, get, load } = setup();
    load.mockResolvedValue({ ok: true, data: null, fetchedAt: null, stale: false });
    expect((await (await api.getWidgetData(get(), { owner: "o", name: "r" }, "main", "0")).json()).fetchedAt).toBeNull();
  });
  it("returns the structured errors of a failing source, with a 200 like the UI's isolated widget", async () => {
    const { api, get, load } = setup();
    load.mockResolvedValue({ ok: false, errors: [{ code: "source_timeout", message: "m", fix: "f" }, { code: "c", message: "m", fix: "f", path: "source" }] });
    const body = await (await api.getWidgetData(get(), { owner: "o", name: "r" }, "main", "0")).json();
    expect(body.errors).toEqual([{ code: "source_timeout", path: "", message: "m", fix: "f" }, { code: "c", path: "source", message: "m", fix: "f" }]);
  });
  it.each([["nope", "0"], ["main", "2"], ["main", "-1"], ["main", "1e1"], ["main", "x"], ["main", "00000"]])("404s page %s widget %s", async (page, index) => {
    const { api, get } = setup();
    expect(await code(await api.getWidgetData(get(), { owner: "o", name: "r" }, page, index))).toBe("api_not_found");
  });
  it("404s the widgets of a project without a valid config", async () => {
    const { api, get } = setup({ open: broken });
    expect(await code(await api.getWidgetData(get(), { owner: "o", name: "r" }, "main", "0"))).toBe("api_not_found");
  });
});
