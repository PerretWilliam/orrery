// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authenticatedMutation = vi.fn();
const currentViewer = vi.fn();
const create = vi.fn();
const revoke = vi.fn();
vi.mock("@/features/auth/server/route-guard", () => ({ authenticatedMutation: (r: Request) => authenticatedMutation(r) }));
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (h: Headers) => currentViewer(h) }));
vi.mock("./runtime", () => ({ getTokens: () => ({ create, revoke }) }));

import { createToken, revokeToken } from "./http";

const post = (fields: Record<string, string | Blob>, headers: Record<string, string> = {}) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request("http://hub.test/x", { method: "POST", body, headers });
};
const who = { userId: "u1", login: "octo" };
const TOKEN = `orr_${"a".repeat(43)}`;
beforeEach(() => {
  authenticatedMutation.mockResolvedValue({ context: {} });
  currentViewer.mockResolvedValue(who);
  create.mockResolvedValue({ ok: true, token: TOKEN, expiresAt: new Date(0) });
  revoke.mockResolvedValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("token mutations over HTTP", () => {
  it("answers with the guard's response when the request is refused", async () => {
    const refusal = new Response(null, { status: 303 });
    authenticatedMutation.mockResolvedValue({ response: refusal });
    expect(await createToken(post({}))).toBe(refusal);
    expect(await revokeToken(post({}))).toBe(refusal);
    expect(create).not.toHaveBeenCalled();
  });
  it("refuses a visitor without a session (401) and a body that is not a form (400)", async () => {
    currentViewer.mockResolvedValue(null);
    expect((await createToken(post({}))).status).toBe(401);
    currentViewer.mockResolvedValue(who);
    const json = new Request("http://hub.test/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect((await revokeToken(json)).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });
  it("creates a token and hands it to the page in a short-lived cookie, never in the URL", async () => {
    const response = await createToken(post({ name: "Claude", days: "30" }));
    expect(create).toHaveBeenCalledWith(who, { name: "Claude", days: "30" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/account/tokens");
    expect(response.headers.get("location")).not.toContain(TOKEN);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toBe(`orrery_new_token=${TOKEN}; Path=/account/tokens; Max-Age=60; HttpOnly; SameSite=Lax`);
  });
  it("marks the cookie Secure over HTTPS", async () => {
    const response = await createToken(post({ name: "x" }, { host: "hub.test", "x-forwarded-proto": "https" }));
    expect(response.headers.get("set-cookie")).toContain("; Secure");
  });
  it("treats missing fields and file uploads as empty, and shows the first issue as a code", async () => {
    create.mockResolvedValue({ ok: false, issues: [{ code: "token_invalid_name" }, { code: "token_invalid_expiry" }] });
    const response = await createToken(post({ name: new Blob(["x"]) }));
    expect(create).toHaveBeenCalledWith(who, { name: "", days: "" });
    expect(response.headers.get("location")).toBe("/account/tokens?error=token_invalid_name");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("revokes by id, and answers the same whether or not there was something to revoke", async () => {
    expect((await revokeToken(post({ id: "abc" }))).headers.get("location")).toBe("/account/tokens?saved=1");
    expect(revoke).toHaveBeenCalledWith(who, "abc");
    revoke.mockResolvedValue(false);
    expect((await revokeToken(post({}))).headers.get("location")).toBe("/account/tokens?saved=1");
    expect(revoke).toHaveBeenLastCalledWith(who, "");
  });
});
