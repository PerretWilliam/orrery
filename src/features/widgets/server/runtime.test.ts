// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const get = vi.fn(async () => ({ ok: false, errors: [] }));
vi.mock("@/features/repos/server/runtime", () => ({ getGitProvider: () => ({}) }));
vi.mock("@/features/data-proxy/server/runtime", () => ({ getSourceProxy: () => ({ get }) }));

import { getWidgetData } from "./runtime";

describe("getWidgetData", () => {
  it("is one service per process, on the process's data proxy", async () => {
    const service = getWidgetData();
    expect(getWidgetData()).toBe(service);
    await service.load({ id: "r1", owner: "acme", name: "web", config: { sources: { s: { url: "https://a.test/", method: "GET", ttl: "60s" } } } as never }, { type: "kpi", source: "s", path: "n", label: "N" } as never);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
