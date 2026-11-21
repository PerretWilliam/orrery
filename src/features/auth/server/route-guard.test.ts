// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const getAuthContext = vi.fn();
vi.mock("./runtime", () => ({ getAuthContext: (headers: Headers) => getAuthContext(headers) }));

import { authenticatedMutation, failTo } from "./route-guard";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const post = (headers: Record<string, string>) => new Request("http://hub.test/auth/sign-in", { method: "POST", headers });

describe("failTo", () => {
  it("sends the browser to the sign-in page with a known code", () => {
    const response = failTo("auth_origin_invalid");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/sign-in?error=auth_origin_invalid");
  });
});

describe("authenticatedMutation", () => {
  it.each([
    ["no Origin header", { host: "hub.test" }],
    ["another site's Origin", { host: "hub.test", origin: "https://evil.example" }],
    ["an unparsable Origin", { host: "hub.test", origin: "null" }],
  ])("refuses %s before touching anything", async (_name, headers) => {
    const result = await authenticatedMutation(post(headers));
    expect(result).toHaveProperty("response");
    expect((result as { response: Response }).response.headers.get("location")).toBe("/sign-in?error=auth_origin_invalid");
    expect(getAuthContext).not.toHaveBeenCalled();
  });

  it("refuses a request whose Origin is not the configured public origin", async () => {
    vi.stubEnv("ORRERY_PUBLIC_URL", "https://hub.example.com");
    const result = await authenticatedMutation(post({ host: "hub.test", origin: "http://hub.test" }));
    expect((result as { response: Response }).response.headers.get("location")).toContain("auth_origin_invalid");
  });

  it("says the instance is not set up when there is no GitHub App yet", async () => {
    getAuthContext.mockResolvedValue(null);
    const result = await authenticatedMutation(post({ host: "hub.test", origin: "http://hub.test" }));
    expect((result as { response: Response }).response.headers.get("location")).toBe("/sign-in?error=auth_not_configured");
  });

  it("hands over the auth context for a request from this site", async () => {
    const context = { auth: {}, service: {} };
    getAuthContext.mockResolvedValue(context);
    const headers = { host: "hub.test", origin: "http://hub.test" };
    expect(await authenticatedMutation(post(headers))).toEqual({ context });
    expect(getAuthContext.mock.calls[0][0].get("host")).toBe("hub.test");
  });
});
