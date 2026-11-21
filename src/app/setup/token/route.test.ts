// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const login = vi.fn();
vi.mock("@/features/setup/server/runtime", () => ({ getSetupService: () => ({ login: (...a: unknown[]) => login(...a) }) }));

import { POST } from "./route";

const post = (body: Record<string, string>, headers: Record<string, string> = {}) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) form.set(key, value);
  return new Request("http://orrery.test/setup/token", { method: "POST", body: form, headers: { host: "orrery.test", origin: "http://orrery.test", ...headers } });
};

afterEach(() => {
  login.mockReset();
  vi.unstubAllEnvs();
});

describe("POST /setup/token", () => {
  it("stores the session in a scoped, HttpOnly cookie and sends the person back to /setup", async () => {
    login.mockResolvedValue({ ok: true, session: "1.n.mac", maxAgeSeconds: 1800 });
    const response = await POST(post({ token: "the-token" }));
    expect(login).toHaveBeenCalledWith("the-token");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/setup");
    expect(response.headers.getSetCookie()).toEqual(["orrery_setup=1.n.mac; Path=/setup; Max-Age=1800; HttpOnly; SameSite=Lax"]);
  });
  it("adds Secure behind HTTPS", async () => {
    login.mockResolvedValue({ ok: true, session: "s", maxAgeSeconds: 1800 });
    const response = await POST(post({ token: "t" }, { "x-forwarded-proto": "https" }));
    expect(response.headers.getSetCookie()[0]).toContain("; Secure");
  });
  it("sends a wrong token back with its error code and no cookie", async () => {
    login.mockResolvedValue({ ok: false, issue: { code: "setup_token_invalid" } });
    const response = await POST(post({ token: "wrong" }));
    expect(response.headers.get("location")).toBe("/setup?error=setup_token_invalid");
    expect(response.headers.getSetCookie()).toEqual([]);
  });
  it("passes a missing token field to the service as such", async () => {
    login.mockResolvedValue({ ok: false, issue: { code: "setup_token_invalid" } });
    await POST(post({}));
    expect(login).toHaveBeenCalledWith(null);
  });
  it.each([
    ["a foreign origin", { origin: "https://evil.test" }],
    ["no origin", { origin: "" }],
  ])("refuses %s without reading the token", async (_name, headers) => {
    const response = await POST(post({ token: "t" }, headers));
    expect(response.headers.get("location")).toBe("/setup?error=setup_origin_invalid");
    expect(login).not.toHaveBeenCalled();
  });
  it("checks the origin against ORRERY_PUBLIC_URL when it is set", async () => {
    vi.stubEnv("ORRERY_PUBLIC_URL", "https://orrery.example.com");
    login.mockResolvedValue({ ok: true, session: "s", maxAgeSeconds: 1 });
    expect((await POST(post({ token: "t" }, { origin: "http://orrery.test" }))).headers.get("location")).toBe("/setup?error=setup_origin_invalid");
    expect((await POST(post({ token: "t" }, { origin: "https://orrery.example.com" }))).headers.get("location")).toBe("/setup");
  });
});
