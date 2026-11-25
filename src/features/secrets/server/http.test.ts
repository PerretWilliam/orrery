// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authenticatedMutation = vi.fn();
const currentViewer = vi.fn();
const save = vi.fn();
const remove = vi.fn();
vi.mock("@/features/auth/server/route-guard", () => ({ authenticatedMutation: (r: Request) => authenticatedMutation(r) }));
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (h: Headers) => currentViewer(h) }));
vi.mock("./runtime", () => ({ getSecrets: () => ({ save, remove }) }));

import { deleteSecret, saveSecret } from "./http";

const target = { owner: "acme", name: "we b" };
const post = (fields: Record<string, string | Blob>) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request("http://hub.test/x", { method: "POST", body });
};
beforeEach(() => {
  authenticatedMutation.mockResolvedValue({ context: {} });
  currentViewer.mockResolvedValue({ userId: "u1", login: "octo" });
  save.mockResolvedValue({ ok: true });
  remove.mockResolvedValue({ ok: true });
});
afterEach(() => vi.clearAllMocks());

describe("secret mutations over HTTP", () => {
  it("answers with the guard's response when the request is refused (wrong origin, no GitHub App)", async () => {
    const refusal = new Response(null, { status: 303 });
    authenticatedMutation.mockResolvedValue({ response: refusal });
    expect(await saveSecret(post({}), target)).toBe(refusal);
    expect(save).not.toHaveBeenCalled();
  });
  it("refuses a visitor without a session (401) and a body that is not a form (400)", async () => {
    currentViewer.mockResolvedValue(null);
    expect((await saveSecret(post({}), target)).status).toBe(401);
    currentViewer.mockResolvedValue({ userId: "u1", login: "octo" });
    const json = new Request("http://hub.test/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect((await saveSecret(json, target)).status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
  it("saves with the fields of the form, splitting the hosts on spaces and commas", async () => {
    const response = await saveSecret(post({ name: "A_KEY", value: "v", hosts: "a.com, b.com  c.com" }), target);
    expect(save).toHaveBeenCalledWith({ owner: "acme", name: "we b" }, { userId: "u1", login: "octo" }, { name: "A_KEY", value: "v", hosts: ["a.com", "b.com", "c.com"] });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/settings/acme/we%20b/secrets?saved=1");
  });
  it("treats missing fields and file uploads as empty", async () => {
    await saveSecret(post({ name: new Blob(["x"]) }), target);
    expect(save).toHaveBeenCalledWith(expect.anything(), expect.anything(), { name: "", value: "", hosts: [] });
  });
  it("sends the first problem back as a code, never text, and never the value", async () => {
    save.mockResolvedValue({ ok: false, reason: "invalid", issues: [{ code: "secret_invalid_name" }, { code: "secret_invalid_host" }] });
    const response = await saveSecret(post({ name: "x", value: "topsecret", hosts: "a.com" }), target);
    expect(response.headers.get("location")).toBe("/settings/acme/we%20b/secrets?error=secret_invalid_name");
    expect(response.headers.get("location")).not.toContain("topsecret");
  });
  it("answers 404 when the user may not manage the project", async () => {
    save.mockResolvedValue({ ok: false, reason: "forbidden" });
    expect((await saveSecret(post({}), target)).status).toBe(404);
  });
  it("deletes by name", async () => {
    const response = await deleteSecret(post({ name: "A_KEY" }), target);
    expect(remove).toHaveBeenCalledWith({ owner: "acme", name: "we b" }, { userId: "u1", login: "octo" }, "A_KEY");
    expect(response.headers.get("location")).toBe("/settings/acme/we%20b/secrets?saved=1");
  });
});
