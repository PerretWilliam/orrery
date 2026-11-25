// @vitest-environment node
/// <reference types="vite/client" />
import { createHmac, generateKeyPairSync, randomBytes } from "node:crypto";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRule } from "@/features/access/domain/policy";
import { createPermissionService } from "@/features/access/server/permissions";
import { createAccessPolicy } from "@/features/access/server/policy";
import { hashToken } from "@/features/agents/domain/tokens";
import { createTokens } from "@/features/agents/server/service";
import { createRateLimiter } from "@/features/api/domain/rate-limit";
import { createApi } from "@/features/api/server/handlers";
import { createAuth } from "@/features/auth/server/better-auth";
import { createMcp } from "@/features/mcp/server/mcp";
import { createGitHubProvider, GITHUB_API } from "@/features/repos/server/github";
import { createProjects, type ProjectRow } from "@/features/repos/server/projects";
import { createSecrets } from "@/features/secrets/server/service";
import { setCookie } from "@/features/setup/domain/http";
import { manifestState, signSession } from "@/features/setup/domain/token";
import { createSetupService, SESSION_TTL_MS } from "@/features/setup/server/service";
import { createWebhookHandler } from "@/features/webhooks/server/handler";
import { parseKeyring } from "@/lib/crypto";

/**
 * Who may do what (docs/scope.md, threat table). The real GitHub adapter, permission cache, access policy, project list,
 * REST API, MCP server and secret service are wired together; only GitHub's answers and the database rows are made up.
 */

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const keyring = parseKeyring(`k1:${randomBytes(32).toString("base64")}`);

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const REPOS = ["open", "private", "hidden"] as const;
const row = (name: string): ProjectRow => ({
  id: `id-${name}`,
  owner: "acme",
  name,
  isPrivate: name !== "open",
  archived: false,
  config: { version: 1, project: { name: `Title of ${name}` }, sources: {}, pages: [{ id: "main", title: "Main", widgets: [{ type: "markdown", content: "x" }] }] },
  issues: null,
});
/** repo -> login -> GitHub role. Nobody else is a collaborator; `open` is a public repository. */
const COLLABORATORS: Record<string, Record<string, string>> = {
  open: { alice: "admin" },
  private: { alice: "admin", carol: "read" },
  hidden: { alice: "admin" },
};
const RULES: Record<string, ProjectRule[]> = { hidden: [{ effect: "hide" }] };

function hub({ githubStatus, limit }: { githubStatus?: number; limit?: number } = {}) {
  const provider = createGitHubProvider({
    credentials: async () => ({ appId: "1", privateKey }),
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input).replace(GITHUB_API, "");
      if (init?.method === "POST") return Response.json({ token: "t", expires_at: "2099-01-01T00:00:00Z" }, { status: 201 });
      if (path.endsWith("/installation")) return Response.json({ id: 7 });
      const [, repo = "", login = "", permission] = /^\/repos\/acme\/([^/]+)\/collaborators\/([^/]+)(\/permission)?$/.exec(path) ?? [];
      if (githubStatus) return new Response(null, { status: githubStatus });
      const role = COLLABORATORS[repo]?.[login];
      if (!permission) return new Response(null, { status: role ? 204 : 404 });
      // As GitHub does: on a public repository the role endpoint says "read" for anybody.
      return Response.json({ role_name: role ?? "read" });
    }) as typeof fetch,
  });
  const policy = createAccessPolicy({
    store: { allowlist: async () => [], rulesFor: async (repo) => RULES[repo.name] ?? [], seedAllowlist: async () => 0, grantAdmins: async () => {} },
    git: provider,
    permissions: createPermissionService({ provider }),
  });
  const rows = REPOS.map(row);
  const projects = createProjects({
    store: { listConfigured: async () => rows, view: async (repo) => rows.find((r) => r.owner === repo.owner && r.name === repo.name) ?? null },
    canView: (repo, login) => policy.can(repo, login, "view"),
    canManage: (repo, login) => policy.can(repo, login, "manage_hosts"),
  });
  const load = vi.fn(async (project: { name: string }) => ({ ok: true as const, data: `DATA of ${project.name}`, fetchedAt: null, stale: false }));
  const preview = vi.fn();
  const authenticate = vi.fn(async (token: string) => ({ tokenId: token, login: token }));
  const api = createApi({
    authenticate, // the token is the login: token checks are tested below
    projects,
    widgetData: { load },
    limiter: createRateLimiter({ limit }),
    canManage: (repo, login) => policy.can(repo, login, "manage_secrets"),
    proxy: { preview },
  });
  const mcp = createMcp(api);
  const store = { repositoryId: vi.fn(async (repo: { name: string }) => `id-${repo.name}`), list: vi.fn(async () => []), save: vi.fn(), remove: vi.fn() };
  const secrets = createSecrets({ store, keyring: () => keyring, canManage: (repo, login) => policy.can(repo, login, "manage_secrets"), now: () => new Date() });

  const get = (login: string) => new Request("http://hub.test/api/v1/projects", { headers: { authorization: `Bearer ${login}` } });
  const rpc = (login: string, method: string, params?: object, body?: string) =>
    mcp.handle(
      new Request("http://hub.test/api/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${login}` },
        body: body ?? JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
  const tool = async (login: string, name: string, args: object) => (await (await rpc(login, "tools/call", { name, arguments: args })).json()).result;
  return { api, projects, secrets, store, load, preview, authenticate, get, rpc, tool };
}

describe("threat: Broken access control", () => {
  it("lets a collaborator read their project on every surface (the control for the refusals below)", async () => {
    const { api, get, tool, projects } = hub();
    const repo = { owner: "acme", name: "private" };
    expect(await projects.open(repo, "alice")).not.toBeNull();
    expect((await (await api.getWidgetData(get("alice"), repo, "main", "0")).json()).data).toBe("DATA of private");
    expect((await tool("alice", "read_widget", { owner: "acme", repo: "private", page: "main", index: 0 })).content[0].text).toContain("DATA of private");
  });

  it.each([
    ["a stranger", "mallory", "private"],
    ["somebody with only the implicit read of a public repository", "mallory", "open"],
    ["an admin of a repository the policy hides", "alice", "hidden"],
    ["a collaborator of another repository", "carol", "open"],
    ["any user, for a project that does not exist", "alice", "nothing"],
  ])("gives %s no tab, data or secret", async (_, login, name) => {
    const { api, projects, secrets, store, load, preview, get, tool } = hub();
    const repo = { owner: "acme", name };
    const actor = { userId: "u", login };

    expect(await projects.open(repo, login)).toBeNull();
    expect((await projects.visibleTo(login)).map((p) => p.name)).not.toContain(name);

    const answers = [await api.getProject(get(login), repo), await api.getWidgetData(get(login), repo, "main", "0"), await api.previewSource(get(login), repo)];
    for (const answer of answers) {
      expect(answer.status).toBe(404);
      expect((await answer.json()).errors[0].code).toBe("api_not_found");
    }
    expect(await (await api.listProjects(get(login))).text()).not.toContain(`Title of ${name}`);

    const args = { owner: "acme", repo: name, page: "main", index: 0 };
    for (const called of ["get_project", "read_widget"]) {
      const result = await tool(login, called, args);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("api_not_found");
    }

    expect(await secrets.list(repo, actor)).toBeNull();
    expect(await secrets.save(repo, actor, { name: "A", value: "value-123", hosts: ["a.test"] })).toEqual({ ok: false, reason: "forbidden" });
    expect(await secrets.remove(repo, actor, "A")).toEqual({ ok: false, reason: "forbidden" });
    for (const touched of [store.list, store.save, store.remove, load, preview]) expect(touched).not.toHaveBeenCalled();
  });

  it("lets a reader view but neither manage secrets nor make the hub call out", async () => {
    const { api, secrets, store, preview, get } = hub();
    const repo = { owner: "acme", name: "private" };
    expect(await secrets.list(repo, { userId: "u", login: "carol" })).toBeNull();
    expect((await api.previewSource(get("carol"), repo)).status).toBe(403);
    expect(store.list).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
  });

  it.each([500, 401, 403, 429])("fails closed when GitHub answers %i", async (githubStatus) => {
    const { projects } = hub({ githubStatus });
    expect(await projects.visibleTo("alice")).toEqual([]);
  });
});

describe("threat: Instance takeover at setup", () => {
  const TOKEN = randomBytes(32).toString("base64url");
  const APP = { id: 1, slug: "orrery", client_id: "Iv1.x", client_secret: "c", webhook_secret: "w", pem: "p" };
  function wizard() {
    let completed = false;
    const fetcher = vi.fn(async () => Response.json(APP, { status: 201 }));
    const complete = vi.fn(async () => (completed ? false : (completed = true)));
    const service = createSetupService({
      store: { isCompleted: async () => completed, complete, consumeAdminClaim: async () => false },
      token: TOKEN,
      keyring: () => keyring,
      fetch: fetcher,
      now: () => new Date(),
    });
    return { service, fetcher, complete };
  }
  const forged = () => signSession("another-token", new Date(), SESSION_TTL_MS);
  const expired = () => signSession(TOKEN, new Date(Date.now() - 2 * SESSION_TTL_MS), SESSION_TTL_MS);

  it("opens the wizard to the token only", async () => {
    const { service } = wizard();
    for (const guess of [undefined, null, "", "wrong", TOKEN.slice(1), `${TOKEN}x`]) {
      expect(await service.login(guess)).toMatchObject({ ok: false, issue: { code: "setup_token_invalid" } });
    }
    expect((await service.login(TOKEN)).ok).toBe(true);
  });

  it.each([
    ["no session", () => undefined],
    ["a forged session", forged],
    ["an expired session", expired],
  ])("refuses every step with %s", async (_, session) => {
    const { service, fetcher, complete } = wizard();
    expect(await service.begin(session(), "https://hub.test", true)).toMatchObject({ ok: false, issue: { code: "setup_session_required" } });
    expect(await service.complete(session(), "state", "code-12345678")).toMatchObject({ ok: false, issue: { code: "setup_session_required" } });
    expect(fetcher).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("refuses a return from GitHub that this session did not start", async () => {
    const { service, fetcher } = wizard();
    const session = signSession(TOKEN, new Date(), SESSION_TTL_MS);
    expect(await service.complete(session, "someone-elses-state", "code-12345678")).toMatchObject({ ok: false, issue: { code: "setup_state_invalid" } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("is dead once setup is done: token and sessions open nothing", async () => {
    const { service, complete } = wizard();
    const session = signSession(TOKEN, new Date(), SESSION_TTL_MS);
    expect((await service.complete(session, manifestState(TOKEN, session), "code-12345678")).ok).toBe(true);
    for (const step of [service.login(TOKEN), service.begin(session, "https://hub.test", true), service.complete(session, manifestState(TOKEN, session), "code-12345678")]) {
      expect(await step).toMatchObject({ ok: false, issue: { code: "setup_already_completed" } });
    }
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

describe("threat: Webhook forgery", () => {
  const SECRET = randomBytes(32).toString("hex");
  const body = JSON.stringify({ action: "removed", repository: { name: "web", owner: { login: "acme" } }, member: { login: "bob" } });
  const sign = (text: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(text).digest("hex")}`;
  function receiver() {
    const seen = new Set<string>();
    const deps = {
      secret: async () => SECRET,
      claim: vi.fn(async (id: string) => (seen.has(id) ? false : (seen.add(id), true))),
      invalidate: vi.fn(),
      discover: vi.fn(),
      now: () => new Date(),
    };
    const handle = createWebhookHandler(deps);
    const deliver = (signature: string | null, text = body, id = "d-1") =>
      handle(
        new Request("http://hub.test/api/webhooks/github", {
          method: "POST",
          body: text,
          headers: { "x-github-event": "member", "x-github-delivery": id, ...(signature === null ? {} : { "x-hub-signature-256": signature }) },
        }),
      );
    return { deps, deliver };
  }

  it.each([
    ["no signature", null, body],
    ["another secret", sign(body, "guess"), body],
    ["a SHA-1 signature", `sha1=${createHmac("sha1", SECRET).update(body).digest("hex")}`, body],
    ["a truncated signature", sign(body).slice(0, -2), body],
    ["an altered payload", sign(body), body.replace("bob", "eve")],
  ])("refuses %s and does nothing", async (_, signature, text) => {
    const { deps, deliver } = receiver();
    const response = await deliver(signature, text);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("webhook_signature_invalid");
    for (const touched of [deps.claim, deps.invalidate, deps.discover]) expect(touched).not.toHaveBeenCalled();
  });

  it("acts once on a replayed delivery", async () => {
    const { deps, deliver } = receiver();
    await deliver(sign(body));
    expect(await (await deliver(sign(body))).json()).toMatchObject({ duplicate: true });
    expect(deps.invalidate).toHaveBeenCalledTimes(1);
  });
});

describe("threat: Session and token theft", () => {
  const authDeps = { service: { authorize: async () => true, startSession: async () => true }, clientId: "i", clientSecret: "s", secret: randomBytes(32).toString("hex") };

  it("keeps session cookies away from scripts and other sites, and off plain HTTP when served over HTTPS", async () => {
    const auth = createAuth({ ...authDeps, database: memoryAdapter({}), baseURL: "https://hub.example.com" });
    const { authCookies } = await auth.$context;
    for (const cookie of [authCookies.sessionToken, authCookies.sessionData]) {
      expect(cookie.attributes).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
    }
    expect(setCookie("c", "v", { maxAge: 60, path: "/", secure: true })).toMatch(/HttpOnly; SameSite=Lax; Secure$/);
  });

  it("stores GitHub's tokens encrypted", async () => {
    const rows = { user: [], session: [], account: [] as Record<string, unknown>[], verification: [] };
    vi.stubGlobal("fetch", async (input: string | Request | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/access_token")) return Response.json({ access_token: "ghu_plain", refresh_token: "ghr_plain", expires_in: 60, token_type: "bearer" });
      return Response.json(url.endsWith("/user") ? { id: 1, login: "octo" } : []);
    });
    const auth = createAuth({ ...authDeps, database: memoryAdapter(rows), baseURL: "http://localhost:3000" });
    const start = await auth.api.signInSocial({ body: { provider: "github", callbackURL: "/" }, asResponse: true });
    const state = new URL(((await start.json()) as { url: string }).url).searchParams.get("state");
    const cookie = start.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    await auth.handler(new Request(`http://localhost:3000/api/auth/callback/github?code=c&state=${state}`, { headers: { cookie } }));
    expect(rows.account).toHaveLength(1);
    expect(rows.account[0].accessToken).toBeTruthy();
    expect(JSON.stringify(rows)).not.toMatch(/gh[ur]_plain/);
  });

  it("stores only the hash of an agent token, and honours it only while it and its owner are valid", async () => {
    const stored: string[] = [];
    let owner = { revokedAt: null as Date | null, expiresAt: new Date(Date.now() + 60_000), suspendedAt: null as Date | null, allowed: true };
    const tokens = createTokens({
      store: {
        create: async (token) => void stored.push(token.tokenHash),
        list: async () => [],
        revoke: async () => null,
        find: async (hash) => (stored.includes(hash) ? { id: "i", name: "n", createdAt: new Date(), lastUsedAt: null, userId: "u", login: "octo", ...owner } : null),
        touch: async () => {},
      },
      canUse: async () => owner.allowed,
      now: () => new Date(),
    });
    const created = await tokens.create({ userId: "u", login: "octo" }, { name: "agent", days: "1" });
    if (!created.ok) throw new Error("not created");
    expect(stored).toEqual([hashToken(created.token)]);
    expect(stored[0]).not.toContain(created.token.slice(4));
    expect(await tokens.authenticate(created.token)).toMatchObject({ login: "octo" });
    expect(await tokens.authenticate(stored[0])).toBeNull(); // the stolen hash is not a token
    const valid = owner;
    for (const spoiled of [{ revokedAt: new Date() }, { expiresAt: new Date(0) }, { suspendedAt: new Date() }, { allowed: false }]) {
      owner = { ...valid, ...spoiled };
      expect(await tokens.authenticate(created.token)).toBeNull();
    }
  });

  // Every route of the app that accepts a POST. Adding one without a CSRF check, or a reason here, fails the suite.
  const routes = import.meta.glob<{ POST?: (request: Request, context: object) => Promise<Response> }>("../../src/app/**/route.ts", { eager: true });
  const posts = Object.entries(routes).flatMap(([file, module]) => (module.POST ? [[file.replace(/^.*src\/app|\/route\.ts$/g, ""), module.POST] as const] : []));
  /** No cookie is read there, so another site cannot ride on the visitor's session. */
  const NO_COOKIE = ["/api/mcp", "/api/v1/projects/[owner]/[repo]/preview", "/api/webhooks/github"];

  it("knows every POST route", () => {
    expect(posts.map(([path]) => path).filter((path) => NO_COOKIE.includes(path)).sort()).toEqual(NO_COOKIE);
    expect(posts.length - NO_COOKIE.length).toBeGreaterThanOrEqual(11); // the glob really found the routes
  });

  it.each(posts.filter(([path]) => !NO_COOKIE.includes(path)))("%s refuses a POST from another site, or with no origin", async (_, post) => {
    for (const origin of ["https://evil.example", "null", null]) {
      const request = new Request("http://hub.test/x", {
        method: "POST",
        headers: { host: "hub.test", cookie: "orrery.session_token=stolen; orrery_setup=stolen", ...(origin ? { origin } : {}) },
        body: new URLSearchParams({ token: "x", name: "x" }),
      });
      const response = await post(request, { params: Promise.resolve({ owner: "acme", repo: "web" }) });
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toMatch(/_origin_invalid$/);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  });

  it("gives a session cookie nothing on the token APIs", async () => {
    const { api, rpc, authenticate } = hub();
    const withCookie = new Request("http://hub.test/api/v1/projects", { headers: { cookie: "orrery.session_token=stolen" } });
    expect((await api.listProjects(withCookie)).status).toBe(401);
    expect((await rpc("", "tools/list")).status).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
  });
});

describe("threat: API abuse", () => {
  it("answers a structured 429 past the limit, shared by REST and MCP, per token", async () => {
    const { api, get, rpc } = hub({ limit: 2 });
    expect((await api.listProjects(get("alice"))).status).toBe(200);
    expect((await rpc("alice", "ping")).status).toBe(200);
    for (const limited of [await api.listProjects(get("alice")), await rpc("alice", "ping")]) {
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await limited.json()).errors[0]).toMatchObject({ code: "api_rate_limited", message: expect.any(String), fix: expect.any(String) });
    }
    expect((await api.listProjects(get("carol"))).status).toBe(200);
  });

  it("lets the preview send nothing but a read: an agent token is read-only, a maintainer's too", async () => {
    const { api, preview } = hub();
    preview.mockResolvedValue({ ok: false, errors: [] });
    const send = (extra: string) => {
      const yaml = `version: 1\nproject: {name: A}\nsources:\n  s:\n    url: https://x.test/a\n    ${extra}\npages: [{id: main, title: Main, widgets: []}]\n`;
      const request = new Request("http://hub.test/x", { method: "POST", headers: { authorization: "Bearer alice" }, body: JSON.stringify({ yaml, source: "s" }) });
      return api.previewSource(request, { owner: "acme", name: "private" });
    };
    for (const write of ["method: POST", "headers: { X-HTTP-Method-Override: DELETE }"]) {
      const response = await send(write);
      expect(response.status).toBe(400);
      expect((await response.json()).errors[0].code).toBe("api_preview_get_only");
    }
    expect(preview).not.toHaveBeenCalled();
    await send("method: GET");
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it("stops reading an oversized body: before the token check on MCP, on the preview too", async () => {
    const { api, rpc, authenticate, preview } = hub();
    const huge = "x".repeat(2 * 1024 * 1024);
    expect((await (await rpc("alice", "ping", undefined, huge)).json()).error.code).toBe(-32600);
    expect(authenticate).not.toHaveBeenCalled();
    const request = new Request("http://hub.test/x", { method: "POST", headers: { authorization: "Bearer alice" }, body: JSON.stringify({ yaml: huge }) });
    expect((await api.previewSource(request, { owner: "acme", name: "private" })).status).toBe(400);
    expect(preview).not.toHaveBeenCalled();
  });
});
