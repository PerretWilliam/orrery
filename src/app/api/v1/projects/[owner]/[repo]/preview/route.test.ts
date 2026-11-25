// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const previewSource = vi.fn(async () => new Response("done"));
vi.mock("@/features/api/server/runtime", () => ({
  getApi: () => ({ previewSource }),
}));

import { POST } from "./route";

describe("POST /api/v1/projects/{owner}/{repo}/preview", () => {
  it("hands the request and the repository to the API", async () => {
    const request = new Request("http://hub.test/x", { method: "POST" });
    expect(
      await (
        await POST(request, {
          params: Promise.resolve({ owner: "o", repo: "r" }),
        })
      ).text(),
    ).toBe("done");
    expect(previewSource).toHaveBeenCalledWith(request, {
      owner: "o",
      name: "r",
    });
  });
});
