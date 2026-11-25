// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const authenticate = vi.fn(async () => ({ tokenId: "t", userId: "u", login: "ann" }));
vi.mock("@/features/agents/server/runtime", () => ({ getTokens: () => ({ authenticate }) }));
vi.mock("@/features/repos/server/runtime", () => ({ getProjects: () => ({ visibleTo: async () => [], open: async () => null }) }));
vi.mock("@/features/widgets/server/runtime", () => ({ getWidgetData: () => ({ load: vi.fn() }) }));

import { getApi } from "./runtime";

describe("getApi", () => {
  it("is one instance, authenticating with the agent tokens", async () => {
    expect(getApi()).toBe(getApi());
    const response = await getApi().listProjects(new Request("http://x", { headers: { authorization: "Bearer tok" } }));
    expect(authenticate).toHaveBeenCalledWith("tok");
    expect((await response.json()).projects).toEqual([]);
  });
});
