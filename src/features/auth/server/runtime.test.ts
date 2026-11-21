// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt, parseKeyring } from "@/lib/crypto";

const KEY = `k1:${Buffer.alloc(32, 7).toString("base64")}`;
const store = {
  githubApp: vi.fn(),
  isAdmin: vi.fn(),
  userState: vi.fn(),
  suspend: vi.fn(),
  resume: vi.fn(),
  deleteSession: vi.fn(),
};
const setup = { claimAdmin: vi.fn() };
const access = { canSignIn: vi.fn() };
const auth = { api: { getSession: vi.fn() } };
const createAuth = vi.fn((...[]: [unknown]) => auth);
const githubAccessToken = vi.fn();
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db-handle" }));
vi.mock("./drizzle-store", () => ({ createAuthStore: (db: unknown) => (db === "db-handle" ? store : null) }));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: (db: unknown, options: unknown) => ({ adapter: { db, options } }) }));
vi.mock("@/features/setup/server/runtime", () => ({ getSetupService: () => setup }));
vi.mock("@/features/access/server/runtime", () => ({ getAccessPolicy: () => access }));
vi.mock("./auth-secret", () => ({ loadAuthSecret: async () => "stored-secret" }));
vi.mock("./better-auth", () => ({ createAuth: (config: unknown) => createAuth(config), githubAccessToken: (...args: unknown[]) => githubAccessToken(...args) }));

import { currentUser, getAuthContext } from "./runtime";

const app = () => ({ clientId: "Iv1.abc", clientSecretCiphertext: encrypt("the-client-secret", parseKeyring(KEY), "instance_settings.client_secret") });
const headers = (host = "hub.test", proto: string | null = null) => new Headers({ host, ...(proto ? { "x-forwarded-proto": proto } : {}) });

beforeEach(() => {
  vi.stubEnv("ORRERY_ENCRYPTION_KEYS", KEY);
  vi.stubEnv("ORRERY_PUBLIC_URL", "");
  store.githubApp.mockResolvedValue(app());
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("getAuthContext", () => {
  it("is null without a usable origin", async () => {
    expect(await getAuthContext(new Headers())).toBeNull();
    expect(store.githubApp).not.toHaveBeenCalled();
  });

  it("is null until the GitHub App exists, and builds as soon as it does", async () => {
    store.githubApp.mockResolvedValueOnce(null);
    expect(await getAuthContext(headers("fresh.test"))).toBeNull();
    expect(createAuth).not.toHaveBeenCalled();
    expect(await getAuthContext(headers("fresh.test"))).not.toBeNull();
  });

  it("builds Better Auth from the stored App, the stored secret and the origin the browser used", async () => {
    await getAuthContext(headers("hub.example.com", "https"));
    expect(createAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "Iv1.abc",
        clientSecret: "the-client-secret",
        secret: "stored-secret",
        baseURL: "https://hub.example.com",
        database: { adapter: { db: "db-handle", options: expect.objectContaining({ provider: "pg" }) } },
      }),
    );
  });

  it("builds once per origin", async () => {
    const first = await getAuthContext(headers("one.test"));
    expect(await getAuthContext(headers("one.test"))).toBe(first);
    await getAuthContext(headers("two.test"));
    expect(createAuth).toHaveBeenCalledTimes(2);
  });

  it("gives the sign-in gate the admin list and the setup claim", async () => {
    await getAuthContext(headers("gate.test"));
    const { service } = createAuth.mock.calls[0][0] as { service: { authorize: (login: string, claim: string) => Promise<boolean> } };
    store.isAdmin.mockResolvedValue(false);
    setup.claimAdmin.mockResolvedValue(true);
    expect(await service.authorize("Octo", "secret")).toBe(true);
    expect(setup.claimAdmin).toHaveBeenCalledWith("secret", "octo");
  });

  it("asks the access policy about everybody else", async () => {
    await getAuthContext(headers("allowlist.test"));
    const { service } = createAuth.mock.calls[0][0] as { service: { authorize: (login: string, claim?: string) => Promise<boolean> } };
    store.isAdmin.mockResolvedValue(false);
    setup.claimAdmin.mockResolvedValue(false);
    access.canSignIn.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await service.authorize("Alice")).toBe(true);
    expect(access.canSignIn).toHaveBeenCalledWith("alice");
    expect(await service.authorize("mallory")).toBe(false);
  });

  it("renews GitHub tokens through Better Auth, and suspends when it fails", async () => {
    const context = await getAuthContext(headers("tokens.test"));
    store.userState.mockResolvedValue({ login: "octo", suspendedAt: null });
    githubAccessToken.mockResolvedValueOnce("ghu_1").mockRejectedValueOnce(new Error("refused"));
    expect(await context?.service.accessToken("u1")).toEqual({ ok: true, token: "ghu_1" });
    expect(githubAccessToken).toHaveBeenCalledWith(auth, store, "u1");
    expect(await context?.service.accessToken("u1")).toMatchObject({ ok: false });
    expect(store.suspend).toHaveBeenCalledWith("u1", expect.any(Date));
  });
});

describe("currentUser", () => {
  const session = { id: "s1", userId: "u1", createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000), token: "never-used" };

  it("is null when the instance is not set up", async () => {
    store.githubApp.mockResolvedValue(null);
    expect(await currentUser(headers("nosetup.test"))).toBeNull();
  });
  it("is null without a session", async () => {
    auth.api.getSession.mockResolvedValue(null);
    expect(await currentUser(headers("anon.test"))).toBeNull();
  });
  it("applies the session rules to the session of the request", async () => {
    const requestHeaders = headers("rules.test");
    auth.api.getSession.mockResolvedValue({ session, user: { id: "u1" } });
    store.userState.mockResolvedValue({ login: "octo", suspendedAt: null });
    expect(await currentUser(requestHeaders)).toEqual({ ok: true, userId: "u1" });
    expect(auth.api.getSession).toHaveBeenCalledWith({ headers: requestHeaders });
    store.userState.mockResolvedValue({ login: "octo", suspendedAt: new Date() });
    expect(await currentUser(requestHeaders)).toMatchObject({ ok: false, issue: { code: "auth_refresh_failed" } });
  });
});
