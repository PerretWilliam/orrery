// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const getAuthContext = vi.fn();
const finishSignIn = vi.fn();
vi.mock("@/features/auth/server/runtime", () => ({ getAuthContext: (headers: Headers) => getAuthContext(headers) }));
vi.mock("@/features/auth/server/http", () => ({ SIGN_IN_PATH: "/sign-in", finishSignIn: (...args: unknown[]) => finishSignIn(...args) }));

import { GET } from "./route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
const request = (headers: Record<string, string> = { host: "hub.test" }) =>
  new Request("http://hub.test/api/auth/callback/github?code=c&state=s", { headers });

describe("GET /api/auth/callback/github", () => {
  it("sends the browser to the sign-in page when the instance is not set up", async () => {
    getAuthContext.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.headers.get("location")).toBe("/sign-in?error=auth_not_configured");
    expect(finishSignIn).not.toHaveBeenCalled();
  });
  it("lets Better Auth finish the sign-in, with plain cookies over HTTP", async () => {
    const answer = new Response(null, { status: 302 });
    getAuthContext.mockResolvedValue({ auth: "auth" });
    finishSignIn.mockResolvedValue(answer);
    const incoming = request();
    expect(await GET(incoming)).toBe(answer);
    expect(finishSignIn).toHaveBeenCalledWith("auth", incoming, false);
  });
  it("uses Secure cookies when the instance is served over HTTPS", async () => {
    getAuthContext.mockResolvedValue({ auth: "auth" });
    finishSignIn.mockResolvedValue(new Response(null));
    const incoming = request({ host: "hub.example.com", "x-forwarded-proto": "https" });
    await GET(incoming);
    expect(finishSignIn).toHaveBeenCalledWith("auth", incoming, true);
  });
});
