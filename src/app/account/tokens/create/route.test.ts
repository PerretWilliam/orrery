// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const handler = vi.fn(async () => new Response("ok"));
vi.mock("@/features/agents/server/http", () => ({ createToken: (...args: unknown[]) => (handler as (...a: unknown[]) => unknown)(...args) }));

import { POST } from "./route";

describe("POST /account/tokens/create", () => {
  it("hands the request to the handler", async () => {
    const request = new Request("http://hub.test/x", { method: "POST" });
    expect(await (await POST(request)).text()).toBe("ok");
    expect(handler).toHaveBeenCalledWith(request);
  });
});
