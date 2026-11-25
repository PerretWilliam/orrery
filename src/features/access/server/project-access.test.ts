// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RepoRef } from "@/features/repos/domain/git-provider";
import { createGitHubProvider, GITHUB_API } from "@/features/repos/server/github";
import { createProjects, type ProjectRow } from "@/features/repos/server/projects";
import type { ProjectRule } from "../domain/policy";
import { createPermissionService } from "./permissions";
import { createAccessPolicy } from "./policy";
import type { AccessStore } from "./store";

/**
 * Who sees what, end to end: the real GitHub adapter (against a fake GitHub), the real permission cache, the real
 * policy and the real project list. Only GitHub's answers and the database rows are made up.
 */

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const row = (name: string, isPrivate: boolean): ProjectRow => ({
  id: `id-${name}`,
  owner: "acme",
  name,
  isPrivate,
  archived: false,
  config: { version: 1, project: { name: name.toUpperCase() }, sources: {}, pages: [{ id: "overview", title: "Overview", widgets: [] }] },
  issues: null,
});
const ROWS = [row("web", false), row("api", true), row("secret", true), row("team-only", true)];

const RULES: Record<string, ProjectRule[]> = {
  secret: [{ effect: "hide" }],
  "team-only": [{ effect: "restrict_to", subject: { kind: "user", value: "alice" } }],
};

type World = {
  /** repo name -> login -> role GitHub reports for a collaborator. A login that is not listed is not a collaborator. */
  collaborators: Record<string, Record<string, string>>;
  /** HTTP status GitHub answers for every collaborator question, when it misbehaves. */
  broken?: number;
};

function setup(world: World) {
  const clock = { now: 1_000_000 };
  const fetchGitHub = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace(GITHUB_API, "");
    const method = init?.method ?? "GET";
    const status = (code: number) => new Response(null, { status: code });
    const json = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code });
    if (method === "POST" && path === "/app/installations/7/access_tokens") return json({ token: "ghs_x", expires_at: "2099-01-01T00:00:00Z" }, 201);
    if (/^\/repos\/acme\/[^/]+\/installation$/.test(path)) return json({ id: 7 });
    const match = /^\/repos\/acme\/([^/]+)\/collaborators\/([^/]+)(\/permission)?$/.exec(path);
    if (!match) return status(500);
    const [, name, login, permission] = match;
    if (world.broken) return status(world.broken);
    const role = Reflect.get(Reflect.get(world.collaborators, name) ?? {}, login) as string | undefined;
    if (!permission) return status(role === undefined ? 404 : 204);
    return json({ role_name: role });
  });
  const provider = createGitHubProvider({
    credentials: async () => ({ appId: "1", privateKey }),
    fetch: fetchGitHub as unknown as typeof fetch,
    now: () => clock.now,
  });
  const rules = vi.fn(async (repo: RepoRef) => RULES[repo.name] ?? []);
  const store = {
    allowlist: async () => [],
    rulesFor: rules,
    seedAllowlist: async () => 0,
    grantAdmins: async () => {},
  } satisfies AccessStore;
  const policy = createAccessPolicy({
    store,
    git: provider,
    permissions: createPermissionService({ provider, now: () => clock.now }),
    cache: { now: () => clock.now },
  });
  const projects = createProjects({
    store: {
      listConfigured: async () => ROWS,
      view: async (repo) => ROWS.find((r) => r.owner === repo.owner && r.name === repo.name) ?? null,
    },
    canView: (repo, login) => policy.can(repo, login, "view"),
  });
  const tabs = async (login: string) => (await projects.visibleTo(login)).map((p) => p.name);
  return { policy, projects, tabs, rules, advance: (ms: number) => (clock.now += ms), fetchGitHub };
}

const WORLD: World = {
  collaborators: {
    web: { alice: "write", dan: "admin" },
    api: { alice: "read", carol: "read", dan: "admin" },
    secret: { alice: "admin", dan: "admin" },
    "team-only": { alice: "maintain", carol: "write" },
  },
};
const fresh = (): World => structuredClone(WORLD);

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("what each person sees", () => {
  it("shows a collaborator the projects they have access to, minus the ones the admin's rules take away", async () => {
    const { tabs } = setup(fresh());
    expect(await tabs("alice")).toEqual(["api", "team-only", "web"]);
    expect(await tabs("carol")).toEqual(["api"]);
    // dan is admin on GitHub; the policy still hides "secret" from him and keeps "team-only" for alice alone.
    expect(await tabs("dan")).toEqual(["api", "web"]);
  });

  it("shows nothing to somebody GitHub gives no explicit access, public repository or not", async () => {
    const { tabs, projects } = setup(fresh());
    expect(await tabs("mallory")).toEqual([]);
    for (const name of ["web", "api", "secret", "team-only"]) expect(await projects.open({ owner: "acme", name }, "mallory")).toBeNull();
  });

  it("does not let the implicit read of a public repository open its tab or its data", async () => {
    const { tabs, projects, fetchGitHub } = setup(fresh());
    expect(ROWS[0].isPrivate).toBe(false);
    expect(await projects.open({ owner: "acme", name: "web" }, "bob")).toBeNull();
    expect(await tabs("bob")).toEqual([]);
    // Only the collaborator question was asked: the role endpoint, which says "read" for anybody on a public repo, never was.
    expect(fetchGitHub.mock.calls.some(([url]) => String(url).endsWith("/permission"))).toBe(false);
  });

  it("gives a user the policy excludes the same answer as a project that does not exist", async () => {
    const { projects } = setup(fresh());
    const hidden = await projects.open({ owner: "acme", name: "secret" }, "dan");
    const missing = await projects.open({ owner: "acme", name: "nothing-here" }, "dan");
    expect(hidden).toBeNull();
    expect(hidden).toEqual(missing);
  });

  it("restricts a project to the person the rule names, even when others have write access", async () => {
    const { projects } = setup(fresh());
    expect((await projects.open({ owner: "acme", name: "team-only" }, "alice"))?.name).toBe("team-only");
    expect(await projects.open({ owner: "acme", name: "team-only" }, "carol")).toBeNull();
  });

  it("does not take a similar login for a listed one", async () => {
    const world = fresh();
    world.collaborators["team-only"].alice2 = "admin";
    const { projects } = setup(world);
    expect(await projects.open({ owner: "acme", name: "team-only" }, "alice2")).toBeNull();
  });
});

describe("when GitHub cannot say", () => {
  it.each([401, 403, 429, 500, 502])("shows nothing while GitHub answers %i, and recovers by itself", async (code) => {
    const world = fresh();
    const { tabs, projects } = setup(world);
    world.broken = code;
    expect(await tabs("alice")).toEqual([]);
    expect(await projects.open({ owner: "acme", name: "web" }, "alice")).toBeNull();
    delete world.broken;
    // A failure is never remembered, so the next request asks again.
    expect(await tabs("alice")).toEqual(["api", "team-only", "web"]);
  });

  it("shows nothing when GitHub reports a role it does not know", async () => {
    const world = fresh();
    world.collaborators.web.alice = "superuser";
    const { projects } = setup(world);
    expect(await projects.open({ owner: "acme", name: "web" }, "alice")).toBeNull();
  });

  it("shows nothing when the network is down", async () => {
    const { projects, fetchGitHub } = setup(fresh());
    fetchGitHub.mockRejectedValue(new Error("offline"));
    expect(await projects.visibleTo("alice")).toEqual([]);
  });

  it("does not show a list when the policy's own rules cannot be read", async () => {
    const world = fresh();
    const { projects, rules } = setup(world);
    rules.mockRejectedValue(new Error("db down"));
    await expect(projects.visibleTo("alice")).rejects.toThrow("db down");
  });
});

describe("when access is taken away", () => {
  it("keeps what GitHub said for 5 minutes, then follows GitHub", async () => {
    const world = fresh();
    const { tabs, advance } = setup(world);
    expect(await tabs("carol")).toEqual(["api"]);
    delete world.collaborators.api.carol;
    expect(await tabs("carol")).toEqual(["api"]);
    advance(5 * 60_000);
    expect(await tabs("carol")).toEqual([]);
  });

  it("follows GitHub at once when the webhook says the member was removed", async () => {
    const world = fresh();
    const { tabs, policy } = setup(world);
    expect(await tabs("carol")).toEqual(["api"]);
    delete world.collaborators.api.carol;
    policy.invalidate({ repo: { owner: "acme", name: "api" }, username: "carol" });
    expect(await tabs("carol")).toEqual([]);
  });
});
