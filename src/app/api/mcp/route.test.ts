// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const handle = vi.fn(async () => new Response("rpc"));
vi.mock("@/features/mcp/server/runtime", () => ({ getMcp: () => ({ handle }) }));
vi.mock("next/server", () => ({ connection: async () => undefined }));

import { GET, POST } from "./route";

describe("/api/mcp", () => {
  it("hands a POST to the MCP server", async () => {
    const request = new Request("http://hub.test/api/mcp", { method: "POST" });
    expect(await (await POST(request)).text()).toBe("rpc");
    expect(handle).toHaveBeenCalledWith(request);
  });
  it("has no stream to open", () => {
    const response = GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});
