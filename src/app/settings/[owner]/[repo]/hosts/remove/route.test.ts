// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const handler = vi.fn(async () => new Response("ok"));
vi.mock("@/features/project-settings/server/http", () => ({ removeHost: (...args: unknown[]) => (handler as (...a: unknown[]) => unknown)(...args) }));

import { POST } from "./route";

describe("POST /settings/[owner]/[repo]/hosts/remove", () => {
  it("hands the request and the project's name to the handler", async () => {
    const request = new Request("http://hub.test/x", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ owner: "acme", repo: "web" }) });
    expect(await response.text()).toBe("ok");
    expect(handler).toHaveBeenCalledWith(request, { owner: "acme", name: "web" });
  });
});
