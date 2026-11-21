// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const complete = vi.fn();
vi.mock("@/features/setup/server/runtime", () => ({ getSetupService: () => ({ complete: (...a: unknown[]) => complete(...a) }) }));

import { GET } from "./route";

const get = (query: string, cookie?: string, headers: Record<string, string> = {}) =>
  new Request(`http://orrery.test/setup/github/callback${query}`, { headers: { host: "orrery.test", ...(cookie ? { cookie } : {}), ...headers } });

afterEach(() => complete.mockReset());

describe("GET /setup/github/callback", () => {
  it("passes the cookie, the state and the code to the service", async () => {
    complete.mockResolvedValue({ ok: false, issue: { code: "setup_state_invalid" } });
    await GET(get("?code=abc&state=xyz", "a=1; orrery_setup=1.n.mac"));
    expect(complete).toHaveBeenCalledWith("1.n.mac", "xyz", "abc");
  });
  it("hands the admin claim to the browser once, clears the setup cookie, and shows the done page", async () => {
    complete.mockResolvedValue({ ok: true, slug: "orrery-abc", claimSecret: "CLAIM", claimExpiresAt: new Date() });
    const response = await GET(get("?code=abc&state=xyz", "orrery_setup=s"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/setup/done?app=orrery-abc");
    expect(response.headers.getSetCookie()).toEqual([
      "orrery_admin_claim=CLAIM; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax",
      "orrery_setup=; Path=/setup; Max-Age=0; HttpOnly; SameSite=Lax",
    ]);
  });
  it("marks the cookies Secure behind HTTPS", async () => {
    complete.mockResolvedValue({ ok: true, slug: "s", claimSecret: "C", claimExpiresAt: new Date() });
    const response = await GET(get("?code=abc&state=xyz", "orrery_setup=s", { "x-forwarded-proto": "https" }));
    expect(response.headers.getSetCookie().every((cookie) => cookie.endsWith("; Secure"))).toBe(true);
  });
  it("sends any refusal back to /setup with its code, and sets no cookie", async () => {
    complete.mockResolvedValue({ ok: false, issue: { code: "setup_session_required" } });
    const response = await GET(get("?code=abc&state=xyz"));
    expect(complete).toHaveBeenCalledWith(undefined, "xyz", "abc");
    expect(response.headers.get("location")).toBe("/setup?error=setup_session_required");
    expect(response.headers.getSetCookie()).toEqual([]);
  });
  it("passes missing parameters as null", async () => {
    complete.mockResolvedValue({ ok: false, issue: { code: "setup_state_invalid" } });
    await GET(get(""));
    expect(complete).toHaveBeenCalledWith(undefined, null, null);
  });
});
