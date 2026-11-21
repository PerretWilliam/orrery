// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt, parseKeyring } from "@/lib/crypto";
import { hashClaim } from "../domain/admin-claim";
import { manifestState, signSession } from "../domain/token";
import { createSetupService, SESSION_TTL_MS, SETTINGS_CONTEXT } from "./service";
import type { CompletedSetup, SetupStore } from "./store";

const TOKEN = "setup-token-".padEnd(43, "x");
const NOW = new Date("2026-03-01T10:00:00Z");
const KEYS = parseKeyring(`k1:${randomBytes(32).toString("base64")}`);
const CONVERSION = { id: 4242, slug: "orrery-abc", client_id: "Iv1.client", client_secret: "CLIENT-SECRET-VALUE", webhook_secret: "WEBHOOK-SECRET-VALUE", pem: "PRIVATE-KEY-VALUE" };

function memoryStore(completed = false) {
  const state = { completed, saved: undefined as CompletedSetup | undefined, admins: [] as string[], claim: undefined as { hash: string; expiresAt: Date } | undefined };
  const store: SetupStore = {
    isCompleted: async () => state.completed,
    complete: vi.fn(async (data) => {
      if (state.completed) return false;
      state.completed = true;
      state.saved = data;
      state.claim = { hash: data.adminClaimHash, expiresAt: data.adminClaimExpiresAt };
      return true;
    }),
    consumeAdminClaim: vi.fn(async (hash, now, login) => {
      if (!state.claim || state.claim.hash !== hash || state.claim.expiresAt <= now) return false;
      state.claim = undefined;
      state.admins.push(login);
      return true;
    }),
  };
  return { state, store };
}

const github = (response: { status?: number; body?: unknown } | Error = { status: 201, body: CONVERSION }) =>
  vi.fn(async (...[]: Parameters<typeof fetch>) => {
    if (response instanceof Error) throw response;
    return { status: response.status ?? 201, json: async () => response.body } as Response;
  });

function setup(options: { completed?: boolean; keyring?: () => typeof KEYS; fetch?: ReturnType<typeof github> } = {}) {
  const { state, store } = memoryStore(options.completed);
  const fetcher = options.fetch ?? github();
  const service = createSetupService({ store, token: TOKEN, keyring: options.keyring ?? (() => KEYS), fetch: fetcher as unknown as typeof fetch, now: () => NOW });
  const session = signSession(TOKEN, NOW, SESSION_TTL_MS);
  return { service, state, store, fetcher, session };
}

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("login", () => {
  it("trades the token for a 30-minute session", async () => {
    const { service } = setup();
    const result = await service.login(TOKEN);
    expect(result).toMatchObject({ ok: true, maxAgeSeconds: 1800 });
    expect(await service.hasSession(result.ok ? result.session : undefined)).toBe(true);
  });
  it.each([undefined, null, "", "wrong", TOKEN + "x", TOKEN.slice(1), 123])("refuses the token %j, naming nothing", async (attempt) => {
    const result = await setup().service.login(attempt);
    expect(result).toMatchObject({ ok: false, issue: { code: "setup_token_invalid", message: "The setup token is not correct" } });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
  it("refuses even the right token once setup is complete", async () => {
    expect(await setup({ completed: true }).service.login(TOKEN)).toMatchObject({
      ok: false,
      issue: { code: "setup_already_completed", message: "This instance is already set up" },
    });
  });
});

describe("hasSession", () => {
  it("is false without a session, with a forged one, or after expiry", async () => {
    const { service, session } = setup();
    expect(await service.hasSession(undefined)).toBe(false);
    expect(await service.hasSession("1.2.3")).toBe(false);
    expect(await service.hasSession(signSession("other-token", NOW, SESSION_TTL_MS))).toBe(false);
    expect(await service.hasSession(signSession(TOKEN, new Date(NOW.getTime() - SESSION_TTL_MS), SESSION_TTL_MS))).toBe(false);
    expect(await service.hasSession(session)).toBe(true);
  });
  it("is false once setup is complete, even with a valid session: the token is unusable after setup", async () => {
    const { service, session } = setup({ completed: true });
    expect(await service.hasSession(session)).toBe(false);
  });
});

describe("begin", () => {
  it("returns the manifest and a state tied to the session", async () => {
    const { service, session } = setup();
    const result = await service.begin(session, "https://orrery.example.com", true);
    expect(result).toMatchObject({ ok: true, manifest: { redirect_url: "https://orrery.example.com/setup/github/callback" }, state: manifestState(TOKEN, session) });
  });
  it("is refused without the token's session", async () => {
    expect(await setup().service.begin(undefined, "http://x", false)).toMatchObject({
      ok: false,
      issue: { code: "setup_session_required", message: "Enter the setup token first" },
    });
  });
  it("is refused after setup", async () => {
    const { service, session } = setup({ completed: true });
    expect(await service.begin(session, "http://x", false)).toMatchObject({ ok: false, issue: { code: "setup_already_completed" } });
  });
  it("is refused up front when there is no encryption key, before anything is created at GitHub", async () => {
    const { service, session } = setup({ keyring: () => { throw new Error("no key"); } });
    expect(await service.begin(session, "http://x", false)).toMatchObject({
      ok: false,
      issue: { code: "setup_key_missing", message: "ORRERY_ENCRYPTION_KEYS is missing or invalid" },
    });
  });
});

describe("complete", () => {
  it("exchanges the code, stores the App encrypted, and returns a one-time admin claim", async () => {
    const { service, state, store, fetcher, session } = setup();
    const result = await service.complete(session, manifestState(TOKEN, session), "abcdef1234567890");
    expect(result).toMatchObject({ ok: true, slug: "orrery-abc" });
    if (!result.ok) throw new Error("unreachable");

    const [url, init] = fetcher.mock.calls[0];
    expect(init?.headers).toEqual({ accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "orrery" });
    expect(url).toBe("https://api.github.com/app-manifests/abcdef1234567890/conversions");
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    const saved = state.saved as CompletedSetup;
    expect(saved).toMatchObject({ githubAppId: "4242", githubAppSlug: "orrery-abc", githubClientId: "Iv1.client", encryptionKeyId: "k1", completedAt: NOW });
    expect(decrypt(saved.clientSecretCiphertext, KEYS, SETTINGS_CONTEXT.clientSecret)).toBe("CLIENT-SECRET-VALUE");
    expect(decrypt(saved.privateKeyCiphertext, KEYS, SETTINGS_CONTEXT.privateKey)).toBe("PRIVATE-KEY-VALUE");
    expect(decrypt(saved.webhookSecretCiphertext, KEYS, SETTINGS_CONTEXT.webhookSecret)).toBe("WEBHOOK-SECRET-VALUE");
    expect(saved.adminClaimHash).toBe(hashClaim(result.claimSecret));
    expect(saved.adminClaimHash).not.toBe(result.claimSecret);
    expect(store.complete).toHaveBeenCalledTimes(1);
  });
  it("never writes a credential in clear text, nor in the logs", async () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { service, state, session } = setup();
    await service.complete(session, manifestState(TOKEN, session), "abcdef1234567890");
    const everything = JSON.stringify(state.saved) + out.mock.calls.join("");
    for (const secret of ["CLIENT-SECRET-VALUE", "WEBHOOK-SECRET-VALUE", "PRIVATE-KEY-VALUE", TOKEN]) expect(everything).not.toContain(secret);
    expect(out.mock.calls.join("")).toContain("orrery-abc");
    const logged = out.mock.calls.map(([line]) => JSON.parse(String(line)) as { level: string; msg: string });
    expect(logged).toEqual([expect.objectContaining({ level: "info", msg: "setup completed: GitHub App created" })]);
  });
  it("makes the token unusable afterwards", async () => {
    const { service, session } = setup();
    await service.complete(session, manifestState(TOKEN, session), "abcdef1234567890");
    expect(await service.login(TOKEN)).toMatchObject({ ok: false, issue: { code: "setup_already_completed" } });
    expect(await service.begin(session, "http://x", false)).toMatchObject({ ok: false, issue: { code: "setup_already_completed" } });
    expect(await service.complete(session, manifestState(TOKEN, session), "abcdef1234567890")).toMatchObject({ ok: false, issue: { code: "setup_already_completed" } });
  });
  it("refuses without a session, before calling GitHub", async () => {
    const { service, fetcher } = setup();
    expect(await service.complete(undefined, "state", "abcdef1234567890")).toMatchObject({ ok: false, issue: { code: "setup_session_required" } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses a state that belongs to another session, before calling GitHub", async () => {
    const { service, fetcher, session } = setup();
    const other = signSession(TOKEN, NOW, SESSION_TTL_MS, "another-browser");
    for (const state of [manifestState(TOKEN, other), "", undefined, null, 5]) {
      expect(await service.complete(session, state, "abcdef1234567890")).toMatchObject({
        ok: false,
        issue: { code: "setup_state_invalid", message: "The state does not match this session" },
      });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([undefined, null, 42, "", "short", "has space 12345", "../../etc/passwd", "a".repeat(129), "abc/def/ghi/jkl"])("refuses the code %j without calling GitHub", async (code) => {
    const { service, fetcher, session } = setup();
    expect(await service.complete(session, manifestState(TOKEN, session), code)).toMatchObject({
      ok: false,
      issue: { code: "setup_github_failed", message: "GitHub did not return a valid code" },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses when there is no encryption key, before calling GitHub", async () => {
    const { service, fetcher, session } = setup({ keyring: () => { throw new Error("no key"); } });
    expect(await service.complete(session, manifestState(TOKEN, session), "abcdef1234567890")).toMatchObject({ ok: false, issue: { code: "setup_key_missing" } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    ["a non-201 status", { status: 404, body: CONVERSION }],
    ["a body that is not an App", { status: 201, body: { id: 1 } }],
    ["a network error", new Error("ECONNRESET")],
    ["an unreadable body", { status: 201, body: undefined }],
  ])("fails cleanly on %s, storing nothing", async (_name, response) => {
    const failing = vi.fn(async () => {
      if (response instanceof Error) throw response;
      return { status: response.status, json: async () => { if (response.body === undefined) throw new SyntaxError("bad json"); return response.body; } } as Response;
    });
    const { service, state, session } = setup({ fetch: failing as never });
    expect(await service.complete(session, manifestState(TOKEN, session), "abcdef1234567890")).toMatchObject({
      ok: false,
      issue: { code: "setup_github_failed", message: "GitHub did not create the App" },
    });
    expect(state.saved).toBeUndefined();
    expect(state.completed).toBe(false);
  });
  it("tells the operator when another browser finished first, and does not claim success", async () => {
    const err = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { service, state, store, session } = setup();
    vi.mocked(store.complete).mockImplementationOnce(async () => {
      state.completed = true;
      return false;
    });
    expect(await service.complete(session, manifestState(TOKEN, session), "abcdef1234567890")).toMatchObject({ ok: false, issue: { code: "setup_already_completed" } });
    const warned = JSON.parse(String(err.mock.calls[0][0])) as { level: string; msg: string; slug: string };
    expect(warned).toMatchObject({ level: "warn", slug: "orrery-abc" });
    expect(warned.msg).toContain("completed concurrently");
  });
});

describe("claimAdmin", () => {
  async function finished() {
    const ctx = setup();
    const done = await ctx.service.complete(ctx.session, manifestState(TOKEN, ctx.session), "abcdef1234567890");
    if (!done.ok) throw new Error("setup failed");
    return { ...ctx, secret: done.claimSecret };
  }
  it("makes the first sign-in that presents the claim an admin, lowercased, once", async () => {
    const { service, state, secret } = await finished();
    expect(await service.claimAdmin(secret, "Octo-Cat")).toBe(true);
    expect(state.admins).toEqual(["octo-cat"]);
    expect(await service.claimAdmin(secret, "someone-else")).toBe(false);
    expect(state.admins).toEqual(["octo-cat"]);
  });
  it.each([undefined, "", "wrong-secret"])("refuses the presented claim %j", async (claim) => {
    const { service, state } = await finished();
    expect(await service.claimAdmin(claim, "intruder")).toBe(false);
    expect(state.admins).toEqual([]);
  });
  it("refuses a claim after its 24 hours", async () => {
    const { state, store, secret } = await finished();
    const later = createSetupService({ store, token: TOKEN, keyring: () => KEYS, fetch: fetch, now: () => new Date(NOW.getTime() + 24 * 3600 * 1000) });
    expect(await later.claimAdmin(secret, "late")).toBe(false);
    expect(state.admins).toEqual([]);
  });
  it("never lets a stranger who signs in first become admin without the cookie", async () => {
    const { service, state } = await finished();
    expect(await service.claimAdmin(undefined, "stranger")).toBe(false);
    expect(state.admins).toEqual([]);
  });
});

describe("isCompleted", () => {
  it("reflects the store", async () => {
    expect(await setup().service.isCompleted()).toBe(false);
    expect(await setup({ completed: true }).service.isCompleted()).toBe(true);
  });
});
