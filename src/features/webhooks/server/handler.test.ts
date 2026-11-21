// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createWebhookHandler, type WebhookDeps } from "./handler";

const SECRET = "WEBHOOK-SECRET-VALUE";
const NOW = new Date("2026-03-01T10:00:00Z");
const repository = { name: "web", owner: { login: "acme" } };

function setup(overrides: Partial<WebhookDeps> = {}) {
  const seen = new Set<string>();
  const deps = {
    secret: vi.fn(async () => SECRET as string | null),
    claim: vi.fn(async (id: string) => (seen.has(id) ? false : (seen.add(id), true))),
    invalidate: vi.fn(),
    now: () => NOW,
    ...overrides,
  };
  return { deps, handle: createWebhookHandler(deps) };
}

function delivery(payload: unknown, opts: { secret?: string; event?: string; id?: string; signature?: string | null; raw?: string; extra?: Record<string, string> } = {}) {
  const raw = opts.raw ?? JSON.stringify(payload);
  const headers: Record<string, string> = { "x-github-event": opts.event ?? "member", "x-github-delivery": opts.id ?? "d-1", ...opts.extra };
  const signature = opts.signature === undefined ? `sha256=${createHmac("sha256", opts.secret ?? SECRET).update(raw).digest("hex")}` : opts.signature;
  if (signature !== null) headers["x-hub-signature-256"] = signature;
  return new Request("http://hub.test/api/webhooks/github", { method: "POST", body: raw, headers });
}
const member = { action: "removed", repository, member: { login: "hubot" } };

describe("a genuine delivery", () => {
  it("invalidates the narrowest scope and says what it did", async () => {
    const { handle, deps } = setup();
    const response = await handle(delivery(member));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, event: "member", invalidated: 1 });
    expect(deps.invalidate).toHaveBeenCalledWith({ repo: { owner: "acme", name: "web" }, username: "hubot" });
    expect(deps.claim).toHaveBeenCalledWith("d-1", "member", NOW);
  });
  it("falls back to invalidating everything when the payload has an unexpected shape", async () => {
    const { handle, deps } = setup();
    await handle(delivery({ action: "removed" }, { event: "member" }));
    expect(deps.invalidate).toHaveBeenCalledWith({});
  });
  it("answers 200 without acting for events it does not subscribe to, such as push and ping", async () => {
    const { handle, deps } = setup();
    for (const event of ["push", "ping"]) {
      const response = await handle(delivery({ zen: "x" }, { event, id: `d-${event}` }));
      expect(await response.json()).toEqual({ ok: true, event, ignored: true });
    }
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.invalidate).not.toHaveBeenCalled();
  });
});

describe("replay", () => {
  it("acknowledges a delivery id it has seen without invalidating again", async () => {
    const { handle, deps } = setup();
    await handle(delivery(member));
    const again = await handle(delivery(member));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, event: "member", duplicate: true });
    expect(deps.invalidate).toHaveBeenCalledTimes(1);
  });
  it("does not record a delivery whose signature is wrong", async () => {
    const { handle, deps } = setup();
    await handle(delivery(member, { secret: "wrong" }));
    expect(deps.claim).not.toHaveBeenCalled();
    expect((await handle(delivery(member))).status).toBe(200);
    expect(deps.invalidate).toHaveBeenCalledTimes(1);
  });
});

describe("forgery", () => {
  async function refused(response: Response, status: number, code: string, path?: string) {
    expect(response.status).toBe(status);
    const { error } = await response.json();
    expect(error).toMatchObject({ code, fix: expect.any(String), message: expect.any(String) });
    if (path) expect(error.path).toBe(path);
    expect(JSON.stringify(error)).not.toContain(SECRET);
  }
  const untouched = (deps: ReturnType<typeof setup>["deps"]) => {
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.invalidate).not.toHaveBeenCalled();
  };

  it("refuses a signature made with another secret", async () => {
    const { handle, deps } = setup();
    await refused(await handle(delivery(member, { secret: "guess" })), 401, "webhook_signature_invalid", "headers.x-hub-signature-256");
    untouched(deps);
  });
  it("refuses a body changed after signing", async () => {
    const { handle, deps } = setup();
    const signed = delivery(member);
    const tampered = new Request(signed.url, { method: "POST", headers: signed.headers, body: JSON.stringify({ ...member, member: { login: "admin" } }) });
    await refused(await handle(tampered), 401, "webhook_signature_invalid");
    untouched(deps);
  });
  it.each([null, "", "sha256=", `sha1=${"a".repeat(40)}`, `sha256=${"0".repeat(64)}`])("refuses the signature header %j", async (signature) => {
    const { handle, deps } = setup();
    await refused(await handle(delivery(member, { signature })), 401, "webhook_signature_invalid");
    untouched(deps);
  });
  it("checks the signature before looking at the other headers or the JSON", async () => {
    const { handle } = setup();
    const noHeaders = new Request("http://hub.test/", { method: "POST", body: "not json", headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) } });
    await refused(await handle(noHeaders), 401, "webhook_signature_invalid");
  });
  it("refuses everything while the instance has no GitHub App, without reading the body", async () => {
    const { handle, deps } = setup({ secret: async () => null });
    await refused(await handle(delivery(member)), 503, "webhook_not_configured");
    untouched(deps);
  });
  it("treats an empty stored secret as not configured, since anyone could sign with it", async () => {
    const { handle, deps } = setup({ secret: async () => "" });
    await refused(await handle(delivery(member, { secret: "" })), 503, "webhook_not_configured", "$");
    untouched(deps);
  });
  it("refuses a payload over 5 MB, declared or streamed", async () => {
    const { handle, deps } = setup();
    const declared = delivery(member, { extra: { "content-length": String(5 * 1024 * 1024 + 1) } });
    await refused(await handle(declared), 413, "webhook_payload_too_large");
    untouched(deps);
  });
  it("lets a signed delivery with a missing event or delivery id through to a 400, not a crash", async () => {
    const { handle, deps } = setup();
    await refused(await handle(delivery(member, { extra: { "x-github-event": "" } })), 400, "webhook_headers_invalid", "headers.x-github-event");
    await refused(await handle(delivery(member, { id: "bad id!" })), 400, "webhook_headers_invalid", "headers.x-github-delivery");
    untouched(deps);
  });
  it("refuses a correctly signed body that is not JSON, without recording it", async () => {
    const { handle, deps } = setup();
    await refused(await handle(delivery(null, { raw: "{nope" })), 400, "webhook_payload_invalid", "body");
    untouched(deps);
  });
  it("does not accept a signature computed over the string with the wrong encoding", async () => {
    const { handle } = setup();
    const raw = JSON.stringify({ ...member, note: "é" });
    const wrong = `sha256=${createHmac("sha256", SECRET).update(Buffer.from(raw, "latin1")).digest("hex")}`;
    await refused(await handle(delivery(null, { raw, signature: wrong })), 401, "webhook_signature_invalid");
  });
  it("lets an error from the store surface instead of acknowledging a delivery it could not record", async () => {
    const { handle, deps } = setup({ claim: async () => Promise.reject(new Error("db down")) });
    await expect(handle(delivery(member))).rejects.toThrow("db down");
    expect(deps.invalidate).not.toHaveBeenCalled();
  });
});
