// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const guard = vi.fn(async () => new Response("guarded"));
vi.mock("@/features/api/server/runtime", () => ({ getApi: () => ({ guard }) }));

import { getMcp } from "./runtime";

describe("getMcp", () => {
  it("is one instance, on top of the REST API's guard", async () => {
    expect(getMcp()).toBe(getMcp());
    const response = await getMcp().handle(new Request("http://x", { method: "POST", body: '{"id":1,"method":"ping"}' }));
    expect(await response.text()).toBe("guarded");
  });
});
