// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const handler = vi.fn();
vi.mock("@/features/webhooks/server/runtime", () => ({ getWebhookHandler: () => handler }));

import { POST } from "./route";

describe("POST /api/webhooks/github", () => {
  it("hands the request to the webhook handler", async () => {
    const answer = new Response("ok");
    handler.mockResolvedValue(answer);
    const request = new Request("http://hub.test/api/webhooks/github", { method: "POST", body: "{}" });
    expect(await POST(request)).toBe(answer);
    expect(handler).toHaveBeenCalledWith(request);
  });
});
