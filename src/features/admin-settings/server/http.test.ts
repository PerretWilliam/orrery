// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authenticatedMutation = vi.fn();
const currentViewer = vi.fn();
const apply = vi.fn();
vi.mock("@/features/auth/server/route-guard", () => ({ authenticatedMutation: (r: Request) => authenticatedMutation(r) }));
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (h: Headers) => currentViewer(h) }));
vi.mock("./runtime", () => ({ getAdminSettings: () => ({ apply }) }));

import { adminAction } from "./http";

const who = { userId: "u1", login: "octo" };
const post = (fields: Record<string, string | Blob>) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request("http://hub.test/admin/action", { method: "POST", body });
};
beforeEach(() => {
  authenticatedMutation.mockResolvedValue({ context: {} });
  currentViewer.mockResolvedValue(who);
  apply.mockResolvedValue({ ok: true });
});
afterEach(() => vi.clearAllMocks());

describe("admin action over HTTP", () => {
  it("answers with the guard's response when the request is refused", async () => {
    const refusal = new Response(null, { status: 303 });
    authenticatedMutation.mockResolvedValue({ response: refusal });
    expect(await adminAction(post({}))).toBe(refusal);
    expect(apply).not.toHaveBeenCalled();
  });
  it("refuses a visitor without a session (401) and a body that is not a form (400)", async () => {
    currentViewer.mockResolvedValue(null);
    expect((await adminAction(post({}))).status).toBe(401);
    currentViewer.mockResolvedValue(who);
    const json = new Request("http://hub.test/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect((await adminAction(json)).status).toBe(400);
    expect(apply).not.toHaveBeenCalled();
  });
  it("applies the action of the form and redirects to the page with a saved notice", async () => {
    const response = await adminAction(post({ action: "host_add", value: "a.com" }));
    expect(apply).toHaveBeenCalledWith(who, { type: "host_add", host: "a.com" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?saved=1");
  });
  it("redirects with the error code for a malformed form or a refused value, without calling the service for the former", async () => {
    const response = await adminAction(post({ action: "host_add", value: "http://a.com" }));
    expect(response.headers.get("location")).toBe("/admin?error=admin_invalid_entry");
    expect(await adminAction(post({ action: "host_add", value: new Blob(["x"]) }).clone())).toBeInstanceOf(Response);
    expect(apply).not.toHaveBeenCalled();
    apply.mockResolvedValue({ ok: false, reason: "invalid", code: "admin_last_admin" });
    expect((await adminAction(post({ action: "admin_remove", value: "octo" }))).headers.get("location")).toBe("/admin?error=admin_last_admin");
  });
  it("is a plain 404 for a user who is not an admin", async () => {
    apply.mockResolvedValue({ ok: false, reason: "forbidden" });
    const response = await adminAction(post({ action: "rotate_keys" }));
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });
});
