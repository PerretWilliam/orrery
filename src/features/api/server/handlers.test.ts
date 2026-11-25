import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/features/repos/server/projects";
import { createRateLimiter } from "../domain/rate-limit";
import { createApi } from "./handlers";

const YAML =
  "version: 1\nproject: {name: A}\nsources:\n  s: {url: 'https://x.test/a', ttl: 1m}\npages:\n  - id: main\n    title: Main\n    widgets:\n      - {type: kpi, source: s, path: n, label: N}\n      - {type: markdown, content: hi}\n";
const config = {
  version: 1,
  project: { name: "Star" },
  sources: {},
  pages: [
    {
      id: "main",
      title: "Main",
      widgets: [
        { type: "markdown", title: "Hi", content: "x" },
        { type: "github.releases", limit: 5 },
      ],
    },
  ],
};
const project = {
  id: "r1",
  owner: "o",
  name: "r",
  title: "Star",
  archived: false,
  config,
  issues: [],
} as unknown as Project;
const broken = {
  ...project,
  config: null,
  issues: [{ code: "config_syntax" }],
} as unknown as Project;

function setup(
  over: { open?: Project | null; limit?: number; manage?: boolean } = {},
) {
  const preview = vi.fn<(r: unknown) => Promise<unknown>>(async () => ({
    ok: true,
    data: { n: 1 },
    fetchedAt: new Date("2026-01-02T00:00:00Z"),
    expiresAt: new Date(),
  }));
  const canManage = vi.fn(async () => over.manage ?? true);
  const authenticate = vi.fn(async (token: string) =>
    token === "good" ? { tokenId: "t1", login: "ann" } : null,
  );
  const open = vi.fn(async () =>
    over.open === undefined ? project : over.open,
  );
  const load = vi.fn<(p: unknown, w: unknown) => Promise<unknown>>(
    async () => ({
      ok: true,
      data: [1],
      fetchedAt: new Date("2026-01-01T00:00:00Z"),
      stale: true,
    }),
  );
  const api = createApi({
    authenticate,
    projects: { visibleTo: async () => [project, broken], open },
    widgetData: { load } as never,
    limiter: createRateLimiter({ limit: over.limit }),
    canManage,
    proxy: { preview } as never,
  });
  const get = (token = "good") =>
    new Request("http://hub.test/api/v1/x", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  return { api, get, open, load, authenticate, preview, canManage };
}
const code = async (r: Response) => (await r.json()).errors[0].code;

describe("REST API", () => {
  it.each([
    ["no header", ""],
    ["unknown token", "bad"],
  ])("refuses %s with a 401 and the same body", async (_, token) => {
    const { api, get } = setup();
    const response = await api.listProjects(get(token));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await code(response)).toBe("api_unauthorized");
  });
  it("refuses a malformed scheme and an authentication that throws", async () => {
    const { api, authenticate } = setup();
    expect(
      (
        await api.listProjects(
          new Request("http://x", { headers: { authorization: "Basic good" } }),
        )
      ).status,
    ).toBe(401);
    authenticate.mockRejectedValue(new Error("db down"));
    expect(
      (
        await api.listProjects(
          new Request("http://x", {
            headers: { authorization: "Bearer good" },
          }),
        )
      ).status,
    ).toBe(401);
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
    const body = await (
      await api.getProject(get(), { owner: "o", name: "r" })
    ).json();
    expect(open).toHaveBeenCalledWith({ owner: "o", name: "r" }, "ann");
    expect(body.pages).toEqual([
      {
        id: "main",
        title: "Main",
        widgets: [
          { index: 0, type: "markdown", title: "Hi" },
          { index: 1, type: "github.releases" },
        ],
      },
    ]);
    expect(body.trust).toBe("untrusted");
  });
  it("shows a never-valid project's issues and no pages", async () => {
    const { api, get } = setup({ open: broken });
    const body = await (
      await api.getProject(get(), { owner: "o", name: "r" })
    ).json();
    expect(body.pages).toEqual([]);
    expect(body.issues[0].code).toBe("config_syntax");
  });
  it("answers 404 the same for a project the owner may not see", async () => {
    const { api, get } = setup({ open: null });
    expect(
      await code(await api.getProject(get(), { owner: "o", name: "r" })),
    ).toBe("api_not_found");
    expect(
      await code(
        await api.getWidgetData(get(), { owner: "o", name: "r" }, "main", "0"),
      ),
    ).toBe("api_not_found");
  });
  it("returns widget data with its freshness", async () => {
    const { api, get, load } = setup();
    const body = await (
      await api.getWidgetData(get(), { owner: "o", name: "r" }, "main", "1")
    ).json();
    expect(body).toEqual({
      trust: "untrusted",
      data: [1],
      fetchedAt: "2026-01-01T00:00:00.000Z",
      stale: true,
    });
    expect(load).toHaveBeenCalledWith(
      { owner: "o", name: "r", id: "r1", config },
      config.pages[0].widgets[1],
    );
  });
  it("has null freshness for a widget without a source", async () => {
    const { api, get, load } = setup();
    load.mockResolvedValue({
      ok: true,
      data: null,
      fetchedAt: null,
      stale: false,
    });
    expect(
      (
        await (
          await api.getWidgetData(get(), { owner: "o", name: "r" }, "main", "0")
        ).json()
      ).fetchedAt,
    ).toBeNull();
  });
  it("returns the structured errors of a failing source, with a 200 like the UI's isolated widget", async () => {
    const { api, get, load } = setup();
    load.mockResolvedValue({
      ok: false,
      errors: [
        { code: "source_timeout", message: "m", fix: "f" },
        { code: "c", message: "m", fix: "f", path: "source" },
      ],
    });
    const body = await (
      await api.getWidgetData(get(), { owner: "o", name: "r" }, "main", "0")
    ).json();
    expect(body.errors).toEqual([
      { code: "source_timeout", path: "", message: "m", fix: "f" },
      { code: "c", path: "source", message: "m", fix: "f" },
    ]);
  });
  it.each([
    ["nope", "0"],
    ["main", "2"],
    ["main", "-1"],
    ["main", "1e1"],
    ["main", "x"],
    ["main", "00000"],
  ])("404s page %s widget %s", async (page, index) => {
    const { api, get } = setup();
    expect(
      await code(
        await api.getWidgetData(get(), { owner: "o", name: "r" }, page, index),
      ),
    ).toBe("api_not_found");
  });
  it("404s the widgets of a project without a valid config", async () => {
    const { api, get } = setup({ open: broken });
    expect(
      await code(
        await api.getWidgetData(get(), { owner: "o", name: "r" }, "main", "0"),
      ),
    ).toBe("api_not_found");
  });

  describe("preview", () => {
    const repo = { owner: "o", name: "r" };
    const post = (body: unknown, token = "good") =>
      new Request("http://hub.test/p", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
    it("fetches a source by id, now, as the project, and reports freshness", async () => {
      const { api, preview } = setup();
      const response = await api.previewSource(
        post({ yaml: YAML, source: "s" }),
        repo,
      );
      expect(await response.json()).toEqual({
        trust: "untrusted",
        data: { n: 1 },
        fetchedAt: "2026-01-02T00:00:00.000Z",
        stale: false,
      });
      expect(preview).toHaveBeenCalledWith({
        repositoryId: "r1",
        source: expect.objectContaining({
          url: "https://x.test/a",
          method: "GET",
          ttlSeconds: 0,
        }),
      });
    });
    it("fetches the source of a widget", async () => {
      const { api, preview } = setup();
      expect(
        (
          await api.previewSource(
            post({ yaml: YAML, page: "main", index: 0 }),
            repo,
          )
        ).status,
      ).toBe(200);
      expect(preview).toHaveBeenCalledTimes(1);
    });
    it("returns the source's structured failures", async () => {
      const { api, preview } = setup();
      preview.mockResolvedValue({
        ok: false,
        errors: [{ code: "ssrf_host_not_allowed", message: "m", fix: "f" }],
      });
      expect(
        (
          await (
            await api.previewSource(post({ yaml: YAML, source: "s" }), repo)
          ).json()
        ).errors[0],
      ).toEqual({
        code: "ssrf_host_not_allowed",
        path: "",
        message: "m",
        fix: "f",
      });
    });
    it("needs a valid token, sees nothing for a hidden project, and wants the manage right", async () => {
      expect(
        (await setup().api.previewSource(post({}, "bad"), repo)).status,
      ).toBe(401);
      const hidden = setup({ open: null });
      expect(
        (
          await hidden.api.previewSource(
            post({ yaml: YAML, source: "s" }),
            repo,
          )
        ).status,
      ).toBe(404);
      expect(hidden.canManage).not.toHaveBeenCalled();
      const viewer = setup({ manage: false });
      expect(
        await code(
          await viewer.api.previewSource(
            post({ yaml: YAML, source: "s" }),
            repo,
          ),
        ),
      ).toBe("api_forbidden");
      expect(viewer.preview).not.toHaveBeenCalled();
    });
    it.each([
      ["not JSON", "{no"],
      ["null", "null"],
      ["no yaml", { source: "s" }],
      ["yaml not text", { yaml: 1 }],
      ["source not text", { yaml: YAML, source: 1 }],
      ["page not text", { yaml: YAML, page: 1 }],
      ["index not an integer", { yaml: YAML, page: "main", index: 1.5 }],
      ["too big", JSON.stringify({ yaml: "x".repeat(600_000) })],
      ["no source, no page", { yaml: YAML }],
      ["unknown source", { yaml: YAML, source: "nope" }],
      ["inherited source name", { yaml: YAML, source: "toString" }],
      ["unknown page", { yaml: YAML, page: "nope", index: 0 }],
      ["page without index", { yaml: YAML, page: "main" }],
      ["widget without source", { yaml: YAML, page: "main", index: 1 }],
    ])("answers 400 for %s", async (_, body) => {
      const { api, preview } = setup();
      const response = await api.previewSource(post(body), repo);
      expect(response.status).toBe(400);
      expect(await code(response)).toBe("api_invalid_request");
      expect(preview).not.toHaveBeenCalled();
    });
    it.each([
      ["a POST source", "method: POST", { source: "s" }, "source"],
      ["a method override header", "headers: { X-HTTP-Method-Override: DELETE }", { source: "s" }, "source"],
      ["another spelling of it", "headers: { x-method-override: PUT }", { source: "s" }, "source"],
      ["the third one", "headers: { X-HTTP-Method: PUT }", { source: "s" }, "source"],
      ["the widget of a POST source", "method: POST", { page: "main", index: 0 }, "page"],
    ])("sends nothing for %s", async (_, extra, target, path) => {
      const { api, preview } = setup();
      const yaml = YAML.replace("ttl: 1m", `ttl: 1m, ${extra}`);
      const response = await api.previewSource(post({ yaml, ...target }), repo);
      expect(response.status).toBe(400);
      expect((await response.json()).errors[0]).toMatchObject({ code: "api_preview_get_only", path });
      expect(preview).not.toHaveBeenCalled();
    });
    it("answers 400 with the config's own issues when the yaml is invalid", async () => {
      const { api } = setup();
      const response = await api.previewSource(
        post({ yaml: "version: 2", source: "s" }),
        repo,
      );
      expect(response.status).toBe(400);
      expect((await response.json()).errors[0]).toMatchObject({
        code: "config_unsupported_version",
        fix: expect.any(String),
      });
    });
  });
});
