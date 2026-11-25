// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authenticatedMutation = vi.fn();
const currentViewer = vi.fn();
const addHost = vi.fn();
const removeHost = vi.fn();
const reindexProject = vi.fn();
vi.mock("@/features/auth/server/route-guard", () => ({ authenticatedMutation: (r: Request) => authenticatedMutation(r) }));
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (h: Headers) => currentViewer(h) }));
vi.mock("./runtime", () => ({ getProjectSettings: () => ({ addHost, removeHost, reindex: reindexProject }) }));

import { addHost as add, reindex, removeHost as remove } from "./http";

const target = { owner: "acme", name: "we b" };
const who = { userId: "u1", login: "octo" };
const post = (fields: Record<string, string | Blob>) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request("http://hub.test/x", { method: "POST", body });
};
beforeEach(() => {
  authenticatedMutation.mockResolvedValue({ context: {} });
  currentViewer.mockResolvedValue(who);
  for (const fn of [addHost, removeHost, reindexProject]) fn.mockResolvedValue({ ok: true });
});
afterEach(() => vi.clearAllMocks());

describe("project settings over HTTP", () => {
  it("answers with the guard's response when the request is refused", async () => {
    const refusal = new Response(null, { status: 303 });
    authenticatedMutation.mockResolvedValue({ response: refusal });
    expect(await add(post({}), target)).toBe(refusal);
    expect(addHost).not.toHaveBeenCalled();
  });
  it("refuses a visitor without a session (401) and a body that is not a form (400)", async () => {
    currentViewer.mockResolvedValue(null);
    expect((await add(post({}), target)).status).toBe(401);
    currentViewer.mockResolvedValue(who);
    const json = new Request("http://hub.test/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect((await add(json, target)).status).toBe(400);
    expect(addHost).not.toHaveBeenCalled();
  });
  it("adds and removes the host of the form, and redirects to the settings page", async () => {
    const response = await add(post({ host: "a.com" }), target);
    expect(addHost).toHaveBeenCalledWith(target, who, "a.com");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/settings/acme/we%20b?saved=1");
    await remove(post({ host: "a.com" }), target);
    expect(removeHost).toHaveBeenCalledWith(target, who, "a.com");
  });
  it("treats a missing field or a file upload as empty", async () => {
    await add(post({ host: new Blob(["x"]) }), target);
    expect(addHost).toHaveBeenCalledWith(target, who, "");
  });
  it("forces the re-index of the project", async () => {
    expect((await reindex(post({}), target)).status).toBe(303);
    expect(reindexProject).toHaveBeenCalledWith(target, who);
  });
  it("sends a problem back as a code, never as text", async () => {
    addHost.mockResolvedValue({ ok: false, reason: "invalid", code: "settings_invalid_host" });
    expect((await add(post({ host: "<b>" }), target)).headers.get("location")).toBe("/settings/acme/we%20b?error=settings_invalid_host");
  });
  it("answers 404 when the user may not manage the project", async () => {
    reindexProject.mockResolvedValue({ ok: false, reason: "forbidden" });
    expect((await reindex(post({}), target)).status).toBe(404);
  });
});
