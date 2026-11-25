import { describe, expect, it, vi } from "vitest";
import { createMcp } from "./mcp";

const reply = (body: string, status = 200) => new Response(body, { status });
function setup(authorized = true) {
  const api = {
    guard: vi.fn(
      async (_r: Request, run: (login: string) => Promise<Response>) =>
        authorized ? run("ann") : new Response("no", { status: 401 }),
    ),
    listProjects: vi.fn(async () => reply('{"projects":[]}')),
    getProject: vi.fn(async () => reply('{"pages":[]}')),
    getWidgetData: vi.fn(async () => reply('{"errors":[]}', 404)),
  };
  const mcp = createMcp(api);
  const post = (body: unknown) =>
    new Request("http://hub.test/api/mcp", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const rpc = async (
    method: string,
    params?: object,
    id: number | string | undefined = 1,
  ) => (await mcp.handle(post({ jsonrpc: "2.0", id, method, params }))).json();
  const tool = (name: string, args?: unknown) =>
    rpc("tools/call", { name, arguments: args });
  return { api, mcp, post, rpc, tool };
}

describe("MCP server", () => {
  it("is refused without a valid token, for every method", async () => {
    const { mcp, post } = setup(false);
    expect(
      (await mcp.handle(post({ jsonrpc: "2.0", id: 1, method: "initialize" })))
        .status,
    ).toBe(401);
  });
  it("initializes, pings and lists its read-only tools", async () => {
    const { rpc } = setup();
    expect((await rpc("initialize")).result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "orrery" },
    });
    expect((await rpc("ping")).result).toEqual({});
    const names = (await rpc("tools/list")).result.tools.map(
      (t: { name: string }) => t.name,
    );
    expect(names).toEqual([
      "list_projects",
      "get_project",
      "read_widget",
      "explain_error",
      "validate_config",
    ]);
  });
  it("answers a notification with 202 and no body", async () => {
    const { mcp, post } = setup();
    const response = await mcp.handle(
      post({ jsonrpc: "2.0", method: "notifications/initialized" }),
    );
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });
  it("rejects bad JSON, batches, non-requests and oversized bodies", async () => {
    const { mcp, post } = setup();
    expect((await (await mcp.handle(post("{nope"))).json()).error.code).toBe(
      -32700,
    );
    for (const body of [
      [{ jsonrpc: "2.0" }],
      "null",
      "3",
      { id: 1 },
      { id: 1, method: 4 },
    ])
      expect((await (await mcp.handle(post(body))).json()).error.code).toBe(
        -32600,
      );
    expect(
      (await (await mcp.handle(post(`"${"a".repeat(1024 * 1024)}"`))).json())
        .error.code,
    ).toBe(-32600);
  });
  it("rejects an unknown method", async () =>
    expect((await setup().rpc("resources/list")).error.code).toBe(-32601));
  it("forwards the API's answer for the data tools, flagging failures", async () => {
    const { tool, api } = setup();
    expect((await tool("list_projects")).result).toEqual({
      content: [{ type: "text", text: '{"projects":[]}' }],
      isError: false,
    });
    expect(
      (await tool("get_project", { owner: "o", repo: "r" })).result.isError,
    ).toBe(false);
    expect(api.getProject).toHaveBeenCalledWith(expect.any(Request), {
      owner: "o",
      name: "r",
    });
    const widget = await tool("read_widget", {
      owner: "o",
      repo: "r",
      page: "p",
      index: 2,
    });
    expect(widget.result).toEqual({
      content: [{ type: "text", text: '{"errors":[]}' }],
      isError: true,
    });
    expect(api.getWidgetData).toHaveBeenCalledWith(
      expect.any(Request),
      { owner: "o", name: "r" },
      "p",
      "2",
    );
  });
  it.each([
    ["get_project", { owner: "o" }],
    ["get_project", { repo: "r" }],
    ["read_widget", { owner: "o", repo: "r", page: "p", index: 1.5 }],
    ["read_widget", { owner: "o", repo: "r", page: "p", index: "1" }],
    ["read_widget", { owner: "o", repo: "r", index: 1 }],
    ["explain_error", {}],
    ["validate_config", { yaml: 3 }],
    ["nope", {}],
    ["list_projects", "bad"],
  ])("refuses %s with %j", async (name, args) => {
    const { tool } = setup();
    const answer = await tool(name, args);
    expect(
      name === "list_projects" ? answer.result : answer.error.code,
    ).toBeDefined();
  });
  it("refuses a call without a tool name", async () =>
    expect((await setup().rpc("tools/call", {})).error.code).toBe(-32602));
  it("treats missing arguments as empty", async () =>
    expect(
      (await setup().rpc("tools/call", { name: "get_project" })).error.code,
    ).toBe(-32602));
  it("explains config and API error codes, and says when it does not know one", async () => {
    const { tool } = setup();
    const config = JSON.parse(
      (await tool("explain_error", { code: "config_unknown_field" })).result
        .content[0].text,
    );
    expect(config).toMatchObject({
      code: "config_unknown_field",
      message: null,
    });
    expect(config.fix).toMatch(/Remove the field/);
    const api = JSON.parse(
      (await tool("explain_error", { code: "api_rate_limited" })).result
        .content[0].text,
    );
    expect(api.message).toMatch(/Too many/);
    const unknown = (await tool("explain_error", { code: "__proto__" })).result;
    expect(unknown.isError).toBe(true);
    expect(
      (await tool("explain_error", { code: "toString" })).result.isError,
    ).toBe(true);
  });
  it("validates a config with the server's parser", async () => {
    const { tool } = setup();
    const bad = JSON.parse(
      (await tool("validate_config", { yaml: "version: 2" })).result.content[0]
        .text,
    );
    expect(bad.valid).toBe(false);
    expect(bad.issues[0]).toMatchObject({
      code: "config_unsupported_version",
      fix: expect.any(String),
    });
    const good = JSON.parse(
      (
        await tool("validate_config", {
          yaml: "version: 1\nproject: {name: A}\npages:\n  - {id: a, title: A, widgets: []}\n",
        })
      ).result.content[0].text,
    );
    expect(good).toEqual({ valid: true, issues: [] });
  });
});
