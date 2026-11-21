// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Auth } from "./better-auth";
import { endSession, finishSignIn, SIGN_IN_PATH, startSignIn } from "./http";

const cookies = (...values: string[]) => {
  const headers = new Headers({ "content-type": "application/json" });
  for (const value of values) headers.append("set-cookie", value);
  return headers;
};

describe("startSignIn", () => {
  it("redirects to GitHub and passes Better Auth's state cookies on", async () => {
    const signInSocial = vi.fn(async () => new Response(JSON.stringify({ url: "https://github.com/login/oauth/authorize?state=abc" }), { headers: cookies("orrery.state=x; HttpOnly") }));
    const requestHeaders = new Headers({ cookie: "a=b" });
    const response = await startSignIn({ api: { signInSocial } } as unknown as Auth, requestHeaders);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://github.com/login/oauth/authorize?state=abc");
    expect(response.headers.getSetCookie()).toEqual(["orrery.state=x; HttpOnly"]);
    expect(signInSocial).toHaveBeenCalledWith({
      body: { provider: "github", callbackURL: "/", errorCallbackURL: "/sign-in" },
      headers: requestHeaders,
      asResponse: true,
    });
  });
});

describe("endSession", () => {
  it("asks Better Auth to delete the session, then sends the browser to the sign-in page with the cleared cookie", async () => {
    const signOut = vi.fn(async () => new Response("{}", { headers: cookies("orrery.session_token=; Max-Age=0") }));
    const requestHeaders = new Headers({ cookie: "orrery.session_token=abc" });
    const response = await endSession({ api: { signOut } } as unknown as Auth, requestHeaders);
    expect(signOut).toHaveBeenCalledWith({ headers: requestHeaders, asResponse: true });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(SIGN_IN_PATH);
    expect(response.headers.getSetCookie()).toEqual(["orrery.session_token=; Max-Age=0"]);
  });
});

describe("finishSignIn", () => {
  const callback = new Request("http://hub.test/api/auth/callback/github?code=c&state=s");

  it("returns Better Auth's answer unchanged and clears the one-time admin claim cookie", async () => {
    const handler = vi.fn(async () => new Response("body", { status: 302, headers: { location: "/", "set-cookie": "orrery.session_token=t; HttpOnly" } }));
    const response = await finishSignIn({ handler } as unknown as Auth, callback, false);
    expect(handler).toHaveBeenCalledWith(callback);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(await response.text()).toBe("body");
    expect(response.headers.getSetCookie()).toEqual([
      "orrery.session_token=t; HttpOnly",
      "orrery_admin_claim=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    ]);
  });
  it("clears the claim cookie with the Secure flag over HTTPS, and also after a refusal", async () => {
    const handler = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/sign-in?error=unable_to_create_user" } }));
    const response = await finishSignIn({ handler } as unknown as Auth, callback, true);
    expect(response.headers.getSetCookie()).toEqual(["orrery_admin_claim=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure"]);
  });
});
