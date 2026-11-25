// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const api = {
  listProjects: vi.fn(async () => new Response("list")),
  getProject: vi.fn(async () => new Response("project")),
  getWidgetData: vi.fn(async () => new Response("data")),
};
vi.mock("@/features/api/server/runtime", () => ({ getApi: () => api }));

import { GET as widgetData } from "./projects/[owner]/[repo]/pages/[page]/widgets/[index]/data/route";
import { GET as project } from "./projects/[owner]/[repo]/route";
import { GET as projects } from "./projects/route";

vi.mock("next/server", () => ({ connection: async () => undefined }));
import { GET as spec } from "./openapi.json/route";

const request = new Request("http://hub.test/x");

describe("/api/v1 routes", () => {
  it("hand the request and the path to the API", async () => {
    expect(await (await projects(request)).text()).toBe("list");
    const params = Promise.resolve({
      owner: "o",
      repo: "r",
      page: "p",
      index: "3",
    });
    expect(await (await project(request, { params })).text()).toBe("project");
    expect(api.getProject).toHaveBeenCalledWith(request, {
      owner: "o",
      name: "r",
    });
    expect(await (await widgetData(request, { params })).text()).toBe("data");
    expect(api.getWidgetData).toHaveBeenCalledWith(
      request,
      { owner: "o", name: "r" },
      "p",
      "3",
    );
  });
  it("serves the OpenAPI spec", async () =>
    expect((await (await spec()).json()).openapi).toBe("3.1.0"));
});
