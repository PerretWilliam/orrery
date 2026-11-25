// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const authenticate = vi.fn(async () => ({
  tokenId: "t",
  userId: "u",
  login: "ann",
}));
const can = vi.fn(async () => true);
const preview = vi.fn();
vi.mock("@/features/agents/server/runtime", () => ({
  getTokens: () => ({ authenticate }),
}));
vi.mock("@/features/access/server/runtime", () => ({
  getAccessPolicy: () => ({ can }),
}));
vi.mock("@/features/data-proxy/server/runtime", () => ({
  getSourceProxy: () => ({ preview }),
}));
vi.mock("@/features/repos/server/runtime", () => ({
  getProjects: () => ({
    visibleTo: async () => [],
    open: async () => ({ id: "r1", config: null, issues: [] }),
  }),
}));
vi.mock("@/features/widgets/server/runtime", () => ({
  getWidgetData: () => ({ load: vi.fn() }),
}));

import { getApi } from "./runtime";

describe("getApi", () => {
  it("is one instance, authenticating with the agent tokens", async () => {
    expect(getApi()).toBe(getApi());
    const response = await getApi().listProjects(
      new Request("http://x", { headers: { authorization: "Bearer tok" } }),
    );
    expect(authenticate).toHaveBeenCalledWith("tok");
    expect((await response.json()).projects).toEqual([]);
  });
  it("asks the access policy for the manage right before a preview", async () => {
    const request = new Request("http://x", {
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: "{}",
    });
    expect(
      (await getApi().previewSource(request, { owner: "o", name: "r" })).status,
    ).toBe(400);
    expect(can).toHaveBeenCalledWith(
      { owner: "o", name: "r" },
      "ann",
      "manage_hosts",
    );
  });
});
