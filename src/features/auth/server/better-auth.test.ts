// @vitest-environment node
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth, githubAccessToken } from "./better-auth";
import { createAuthService } from "./service";
import type { AuthStore } from "./store";

type Rows = { user: Record<string, unknown>[]; session: Record<string, unknown>[]; account: Record<string, unknown>[]; verification: Record<string, unknown>[] };

const BASE = "http://localhost:3000";
const NOW = new Date("2026-06-01T00:00:00Z");
const PROFILE = { id: 42, login: "Octo", name: null, avatar_url: "https://avatars.example/42" };

let rows: Rows;
let admins: Set<string>;
let claims: Set<string>;
let tokenMode: "ok" | "bad";
let refreshCalls: URLSearchParams[];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  rows = { user: [], session: [], account: [], verification: [] };
  admins = new Set();
  claims = new Set(["good-claim"]);
  tokenMode = "ok";
  refreshCalls = [];
  vi.stubGlobal("fetch", async (input: string | Request | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://github.com/login/oauth/access_token") {
      const body = new URLSearchParams(String(init?.body));
      if (body.get("grant_type") === "refresh_token") {
        refreshCalls.push(body);
        if (tokenMode === "bad") return json({ error: "bad_refresh_token" });
        return json({ access_token: "ghu_new", expires_in: 28800, refresh_token: "ghr_new", refresh_token_expires_in: 15811200, token_type: "bearer" });
      }
      return json({ access_token: "ghu_first", expires_in: 1, refresh_token: "ghr_first", refresh_token_expires_in: 15811200, token_type: "bearer" });
    }
    if (url === "https://api.github.com/user") return json({ ...PROFILE, email: null });
    if (url === "https://api.github.com/user/emails") return json({ message: "Resource not accessible by integration" }, 403);
    throw new Error(`unexpected fetch ${url}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

/** The hub's store over Better Auth's in-memory tables, so the real service and the real hooks run. */
function store(): AuthStore {
  const suspended = new Map<string, Date | null>();
  return {
    isAdmin: async (login) => admins.has(login),
    userState: async (id) => {
      const user = rows.user.find((u) => u.id === id);
      return user ? { login: (user.login as string) ?? null, suspendedAt: suspended.get(id) ?? null } : null;
    },
    suspend: async (id, at) => void suspended.set(id, at),
    resume: async (id) => void suspended.set(id, null),
    deleteSession: async (id) => void (rows.session = rows.session.filter((s) => s.id !== id)),
    githubAccountId: async (id) => (rows.account.find((a) => a.userId === id)?.id as string | undefined) ?? null,
    githubApp: async () => null,
    authSecret: async () => null,
    setAuthSecretIfAbsent: async () => false,
  };
}

function setup() {
  const service = createAuthService({
    store: store(),
    claimAdmin: async (secret, login) => {
      if (!secret || !claims.delete(secret)) return false;
      admins.add(login);
      return true;
    },
    canSignIn: async () => false,
    fetchAccessToken: async () => "unused",
    now: () => NOW,
  });
  const auth = createAuth({
    database: memoryAdapter(rows),
    clientId: "Iv1.test",
    clientSecret: "client-secret",
    secret: "s".repeat(32),
    baseURL: BASE,
    service,
  });
  return { auth, service };
}

async function signIn(auth: ReturnType<typeof setup>["auth"], extraCookie = "") {
  const start = await auth.api.signInSocial({ body: { provider: "github", callbackURL: "/" }, asResponse: true });
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state");
  const cookies = [...start.headers.getSetCookie().map((c) => c.split(";")[0]), extraCookie].filter(Boolean).join("; ");
  return auth.handler(new Request(`${BASE}/api/auth/callback/github?code=abc&state=${state}`, { headers: { cookie: cookies } }));
}

describe("sign-in gate", () => {
  it("lets the browser holding the setup claim in, makes it admin, and stores a hub user without a real e-mail", async () => {
    const { auth } = setup();
    const response = await signIn(auth, "orrery_admin_claim=good-claim");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).not.toContain("error");
    expect(admins.has("octo")).toBe(true);
    expect(rows.user[0]).toMatchObject({ githubId: 42, login: "Octo", email: "42+octo@users.noreply.github.com", name: "Octo" });
    expect(rows.session).toHaveLength(1);
  });

  it("lets a known admin back in without a claim", async () => {
    const { auth } = setup();
    await signIn(auth, "orrery_admin_claim=good-claim");
    rows.session.length = 0;
    const again = await signIn(auth);
    expect(again.headers.get("location")).not.toContain("error");
    expect(rows.session).toHaveLength(1);
  });

  it("refuses everyone else and leaves no user, account or session behind", async () => {
    const { auth } = setup();
    const response = await signIn(auth, "orrery_admin_claim=wrong-claim");
    expect(response.headers.get("location")).toContain("error");
    expect(rows.user).toHaveLength(0);
    expect(rows.account).toHaveLength(0);
    expect(rows.session).toHaveLength(0);
  });

  it("refuses without any claim cookie", async () => {
    const { auth } = setup();
    expect((await signIn(auth)).headers.get("location")).toContain("error");
    expect(rows.user).toHaveLength(0);
  });

  it("refuses a returning user who is no longer an admin", async () => {
    const { auth } = setup();
    await signIn(auth, "orrery_admin_claim=good-claim");
    admins.clear();
    rows.session.length = 0;
    expect((await signIn(auth)).headers.get("location")).toContain("error");
    expect(rows.session).toHaveLength(0);
  });

  it("refuses a user row without a login", async () => {
    const { auth } = setup();
    await signIn(auth, "orrery_admin_claim=good-claim");
    rows.user[0].login = null;
    rows.session.length = 0;
    expect((await signIn(auth)).headers.get("location")).toContain("error");
  });
});

describe("sessions created without a browser request", () => {
  it("go through the same gate, with no claim to present", async () => {
    const { auth } = setup();
    rows.user.push({ id: "u1", login: "Octo", name: "Octo", email: "u1@x.test", emailVerified: false, createdAt: NOW, updatedAt: NOW });
    const internal = (await auth.$context).internalAdapter;
    expect(await internal.createSession("u1")).toBeNull();
    admins.add("octo");
    expect(await internal.createSession("u1")).toMatchObject({ userId: "u1" });
  });
});

describe("cookies and tokens", () => {
  it("sets an HttpOnly, SameSite=Lax session cookie with the hub prefix, not Secure over plain HTTP", async () => {
    const { auth } = setup();
    const cookie = (await signIn(auth, "orrery_admin_claim=good-claim")).headers.getSetCookie().find((c) => c.includes("session_token"));
    expect(cookie).toMatch(/^orrery\.session_token=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });

  it("marks cookies Secure when the public URL is HTTPS", async () => {
    const service = createAuthService({ store: store(), claimAdmin: async () => true, canSignIn: async () => false, fetchAccessToken: async () => "", now: () => NOW });
    const secure = createAuth({ database: memoryAdapter(rows), clientId: "i", clientSecret: "s", secret: "s".repeat(32), baseURL: "https://hub.example.com", service });
    const start = await secure.api.signInSocial({ body: { provider: "github", callbackURL: "/" }, asResponse: true });
    expect(start.headers.getSetCookie().every((c) => c.includes("Secure") && c.includes("HttpOnly"))).toBe(true);
  });

  it("stores the OAuth tokens encrypted and refreshes them through GitHub on demand", async () => {
    const { auth } = setup();
    await signIn(auth, "orrery_admin_claim=good-claim");
    const stored = rows.account[0];
    expect(stored.accessToken).not.toBe("ghu_first");
    expect(stored.refreshToken).not.toBe("ghr_first");
    expect(await githubAccessToken(auth, store(), String(rows.user[0].id))).toBe("ghu_new");
    expect(refreshCalls[0].get("grant_type")).toBe("refresh_token");
  });

  it("surfaces a refusal from GitHub as an error the service turns into a suspension", async () => {
    const { auth } = setup();
    await signIn(auth, "orrery_admin_claim=good-claim");
    tokenMode = "bad";
    await expect(githubAccessToken(auth, store(), String(rows.user[0].id))).rejects.toMatchObject({ body: { code: "FAILED_TO_GET_ACCESS_TOKEN" } });
  });

  it("has no token to give a user without a GitHub account", async () => {
    const { auth } = setup();
    await expect(githubAccessToken(auth, store(), "nobody")).rejects.toThrow("no GitHub account");
  });
});
