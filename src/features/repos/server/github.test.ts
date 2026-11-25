// @vitest-environment node
import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createGitHubProvider, GITHUB_API, MAX_PAGES } from "./github";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKey = pair.publicKey;

const NOW = Date.parse("2026-06-01T00:00:00Z");
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init });
const status = (code: number, init: ResponseInit = {}) => new Response(null, { status: code, ...init });
type Seen = { method: string; url: string; headers: Headers; signal: AbortSignal | null | undefined };

/** A GitHub that answers by "METHOD /path"; anything it does not know is a 500, so a stray call fails the test. */
function setup(routes: Record<string, (seen: Seen) => Response | Promise<Response>>, now = { value: NOW }) {
  const seen: Seen[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const entry = { method: init?.method ?? "GET", url, headers: new Headers(init?.headers), signal: init?.signal };
    seen.push(entry);
    const route = routes[`${entry.method} ${url.replace(GITHUB_API, "")}`];
    return route ? route(entry) : status(500);
  });
  const credentials = vi.fn(async () => ({ appId: "123", privateKey }));
  const provider = createGitHubProvider({ credentials, fetch: fetch as unknown as typeof globalThis.fetch, now: () => now.value });
  return { provider, seen, credentials, now };
}

const token = (value = "ghs_install", expires = "2026-06-01T01:00:00Z") => () => json({ token: value, expires_at: expires }, { status: 201 });
const tokenFor = (id: number, value = `ghs_${id}`, expires?: string) => ({ [`POST /app/installations/${id}/access_tokens`]: token(value, expires) });
const repo = { owner: "acme", name: "web" };
const installationOfRepo = { "GET /repos/acme/web/installation": () => json({ id: 7 }) };

describe("the App's identity", () => {
  it("signs a short-lived RS256 token with the App's key and asks for the credentials once", async () => {
    const { provider, seen, credentials } = setup({ "GET /app/installations?per_page=100": () => json([]) });
    await provider.listInstallations();
    await provider.listInstallations();
    expect(credentials).toHaveBeenCalledTimes(1);
    const [header, claims, signature] = seen[0].headers.get("authorization")!.replace("Bearer ", "").split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const iat = Math.floor(NOW / 1000);
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iat: iat - 60, exp: iat + 540, iss: "123" });
    expect(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("refuses to talk to GitHub before the App exists, and asks again later", async () => {
    const seen: string[] = [];
    let ready = false;
    const provider = createGitHubProvider({
      credentials: async () => (ready ? { appId: "1", privateKey } : null),
      fetch: (async (url: string) => (seen.push(url), json([]))) as unknown as typeof fetch,
    });
    await expect(provider.listInstallations()).rejects.toThrow("not set up");
    expect(seen).toEqual([]);
    ready = true;
    expect(await provider.listInstallations()).toEqual([]);
  });

  it("sends the headers GitHub asks of an API client, with a timeout, and never follows a redirect on its own", async () => {
    const { provider, seen } = setup({ "GET /app/installations?per_page=100": () => json([]) });
    await provider.listInstallations();
    const [call] = seen;
    expect(call.headers.get("accept")).toBe("application/vnd.github+json");
    expect(call.headers.get("x-github-api-version")).toBe("2022-11-28");
    expect(call.headers.get("user-agent")).toBe("orrery");
    expect(call.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("listInstallations", () => {
  const raw = (id: number, type: string, suspended: string | null = null) => ({ id, account: { login: `acct${id}`, type }, suspended_at: suspended });

  it("maps installations, flags the suspended ones and follows the pages", async () => {
    const { provider } = setup({
      "GET /app/installations?per_page=100": () => json([raw(1, "Organization")], { headers: { link: `<${GITHUB_API}/app/installations?page=2>; rel="next", <${GITHUB_API}/x>; rel="last"` } }),
      "GET /app/installations?page=2": () => json([raw(2, "User", "2026-01-01T00:00:00Z")]),
    });
    expect(await provider.listInstallations()).toEqual([
      { id: 1, accountLogin: "acct1", accountType: "Organization", suspended: false },
      { id: 2, accountLogin: "acct2", accountType: "User", suspended: true },
    ]);
  });
  it("rejects an answer of the wrong shape", async () => {
    const { provider } = setup({ "GET /app/installations?per_page=100": () => json([{ id: "one" }]) });
    await expect(provider.listInstallations()).rejects.toThrow();
  });
  it("does not follow a next page on another host", async () => {
    const { provider } = setup({ "GET /app/installations?per_page=100": () => json([], { headers: { link: '<https://evil.test/p2>; rel="next"' } }) });
    await expect(provider.listInstallations()).rejects.toThrow("foreign host");
  });
  it("stops after the page limit", async () => {
    const { provider, seen } = setup({ "GET /app/installations?per_page=100": () => json([], { headers: { link: `<${GITHUB_API}/app/installations?per_page=100>; rel="next"` } }) });
    await expect(provider.listInstallations()).rejects.toThrow("more pages");
    expect(seen).toHaveLength(MAX_PAGES);
  });
  it("fails on an HTTP error, naming the call but not the query", async () => {
    const { provider } = setup({ "GET /app/installations?per_page=100": () => status(401) });
    await expect(provider.listInstallations()).rejects.toThrow("GitHub answered 401 to GET /app/installations");
  });
});

describe("listRepositories", () => {
  const row = (id: number, over = {}) => ({ id, name: `r${id}`, owner: { login: "acme" }, default_branch: "main", private: true, archived: false, ...over });
  const installations = [
    { id: 1, account: { login: "acme", type: "Organization" }, suspended_at: null },
    { id: 2, account: { login: "old", type: "User" }, suspended_at: "2026-01-01T00:00:00Z" },
  ];

  it("lists the repositories of active installations, skipping malformed rows and suspended installations", async () => {
    const { provider, seen } = setup({
      "GET /app/installations?per_page=100": () => json(installations),
      ...tokenFor(1),
      "GET /installation/repositories?per_page=100": () => json({ repositories: [row(10), { id: "bad" }, row(11, { archived: true, private: false, default_branch: "trunk" })] }),
    });
    expect(await provider.listRepositories()).toEqual([
      { githubId: 10, installationId: 1, owner: "acme", name: "r10", defaultBranch: "main", isPrivate: true, archived: false },
      { githubId: 11, installationId: 1, owner: "acme", name: "r11", defaultBranch: "trunk", isPrivate: false, archived: true },
    ]);
    expect(seen.find((s) => s.url.endsWith("/installation/repositories?per_page=100"))!.headers.get("authorization")).toBe("Bearer ghs_1");
  });
  it("throws, rather than return a partial list, when one installation cannot be listed", async () => {
    const { provider } = setup({
      "GET /app/installations?per_page=100": () => json([installations[0], { ...installations[0], id: 3 }]),
      ...tokenFor(1),
      ...tokenFor(3),
      "GET /installation/repositories?per_page=100": (s) => (s.headers.get("authorization") === "Bearer ghs_1" ? json({ repositories: [row(10)] }) : status(403)),
    });
    await expect(provider.listRepositories()).rejects.toThrow("403");
  });
  it("rejects a page without a repository list", async () => {
    const { provider } = setup({ "GET /app/installations?per_page=100": () => json(installations), ...tokenFor(1), "GET /installation/repositories?per_page=100": () => json([]) });
    await expect(provider.listRepositories()).rejects.toThrow();
  });
  it("reuses an installation token until a minute before it expires", async () => {
    const mint = vi.fn(token("ghs_1", "2026-06-01T01:00:00Z"));
    const { provider, now } = setup({
      "GET /app/installations?per_page=100": () => json([installations[0]]),
      "POST /app/installations/1/access_tokens": mint,
      "GET /installation/repositories?per_page=100": () => json({ repositories: [] }),
    });
    await provider.listRepositories();
    now.value = NOW + 58 * 60_000;
    await provider.listRepositories();
    expect(mint).toHaveBeenCalledTimes(1);
    now.value = NOW + 59 * 60_000 + 1;
    await provider.listRepositories();
    expect(mint).toHaveBeenCalledTimes(2);
  });
  it("rejects a token answer of the wrong shape", async () => {
    const { provider } = setup({ "GET /app/installations?per_page=100": () => json([installations[0]]), "POST /app/installations/1/access_tokens": () => json({}) });
    await expect(provider.listRepositories()).rejects.toThrow();
  });
});

describe("getUserPermission (explicit access only)", () => {
  const base = "/repos/acme/web/collaborators/octo";
  const routes = (collaborator: () => Response, permission?: () => Response) => ({
    ...installationOfRepo,
    ...tokenFor(7),
    [`GET ${base}`]: collaborator,
    ...(permission ? { [`GET ${base}/permission`]: permission } : {}),
  });

  it("is none for somebody who is not a collaborator, without asking for a role: public read does not count", async () => {
    const { provider, seen } = setup(routes(() => status(404)));
    expect(await provider.getUserPermission(repo, "octo")).toBe("none");
    expect(seen.some((s) => s.url.endsWith("/permission"))).toBe(false);
  });
  it.each(["read", "triage", "write", "maintain", "admin"])("returns the role %s of a collaborator", async (role) => {
    const { provider } = setup(routes(() => status(204), () => json({ role_name: role })));
    expect(await provider.getUserPermission(repo, "octo")).toBe(role);
  });
  it("treats a custom role as none", async () => {
    const { provider } = setup(routes(() => status(204), () => json({ role_name: "release-manager" })));
    expect(await provider.getUserPermission(repo, "octo")).toBe("none");
  });
  it("throws on any other answer, so the access check fails closed", async () => {
    await expect(setup(routes(() => status(403))).provider.getUserPermission(repo, "octo")).rejects.toThrow("403");
    await expect(setup(routes(() => status(204), () => status(500))).provider.getUserPermission(repo, "octo")).rejects.toThrow("500");
  });
  it("encodes the names it puts in the path", async () => {
    const { provider, seen } = setup({
      "GET /repos/a%2Fb/c%20d/installation": () => json({ id: 7 }),
      ...tokenFor(7),
      "GET /repos/a%2Fb/c%20d/collaborators/..%2Fx": () => status(404),
    });
    expect(await provider.getUserPermission({ owner: "a/b", name: "c d" }, "../x")).toBe("none");
    expect(seen.at(-1)!.url).toBe(`${GITHUB_API}/repos/a%2Fb/c%20d/collaborators/..%2Fx`);
  });
  it("remembers which installation a repository belongs to", async () => {
    const lookup = vi.fn(() => json({ id: 7 }));
    const { provider } = setup({ ...routes(() => status(404)), "GET /repos/acme/web/installation": lookup, "GET /repos/ACME/Web/collaborators/octo": () => status(404) });
    await provider.getUserPermission(repo, "octo");
    await provider.getUserPermission({ owner: "ACME", name: "Web" }, "octo");
    expect(lookup).toHaveBeenCalledTimes(1);
  });
  it("rejects an installation answer of the wrong shape", async () => {
    const { provider } = setup({ "GET /repos/acme/web/installation": () => json({ id: "7" }) });
    await expect(provider.getUserPermission(repo, "octo")).rejects.toThrow();
  });
});

describe("membership", () => {
  const org = { "GET /orgs/acme/installation": () => json({ id: 5 }), ...tokenFor(5) };

  it("isOrgMember: 204 yes, 404 no", async () => {
    const yes = setup({ ...org, "GET /orgs/acme/members/octo": () => status(204) });
    const no = setup({ ...org, "GET /orgs/acme/members/octo": () => status(404) });
    expect(await yes.provider.isOrgMember("acme", "octo")).toBe(true);
    expect(await no.provider.isOrgMember("acme", "octo")).toBe(false);
  });
  it("isOrgMember: a redirect (the members are hidden from the App) is an error, not an answer, and is not followed", async () => {
    const { provider, seen } = setup({ ...org, "GET /orgs/acme/members/octo": () => status(302, { headers: { location: `${GITHUB_API}/orgs/acme/public_members/octo` } }) });
    await expect(provider.isOrgMember("acme", "octo")).rejects.toThrow("302");
    expect(seen.some((s) => s.url.includes("public_members"))).toBe(false);
  });
  it("isOrgMember: an organization without the App is an error", async () => {
    const { provider } = setup({ "GET /orgs/acme/installation": () => status(404) });
    await expect(provider.isOrgMember("acme", "octo")).rejects.toThrow("404");
  });
  it("isTeamMember: only an active membership counts", async () => {
    const path = "GET /orgs/acme/teams/devs/memberships/octo";
    expect(await setup({ ...org, [path]: () => json({ state: "active" }) }).provider.isTeamMember("acme", "devs", "octo")).toBe(true);
    expect(await setup({ ...org, [path]: () => json({ state: "pending" }) }).provider.isTeamMember("acme", "devs", "octo")).toBe(false);
    expect(await setup({ ...org, [path]: () => status(404) }).provider.isTeamMember("acme", "devs", "octo")).toBe(false);
    await expect(setup({ ...org, [path]: () => json({}) }).provider.isTeamMember("acme", "devs", "octo")).rejects.toThrow();
    await expect(setup({ ...org, [path]: () => status(500) }).provider.isTeamMember("acme", "devs", "octo")).rejects.toThrow("500");
  });

  describe("isInstallationMember", () => {
    const account = (id: number, login: string, type: string, suspended: string | null = null) => ({ id, account: { login, type }, suspended_at: suspended });
    const listing = (...rows: unknown[]) => ({ "GET /app/installations?per_page=100": () => json(rows) });

    it("is true for the owner of a user installation, whatever the case", async () => {
      const { provider } = setup(listing(account(1, "Octo", "User")));
      expect(await provider.isInstallationMember("octo")).toBe(true);
    });
    it("is true for a member of an organization where the App is installed", async () => {
      const { provider } = setup({ ...listing(account(1, "someone", "User"), account(2, "acme", "Organization")), ...tokenFor(2), "GET /orgs/acme/members/octo": () => status(204) });
      expect(await provider.isInstallationMember("octo")).toBe(true);
    });
    it("is false for everybody else, and ignores suspended installations", async () => {
      const { provider, seen } = setup({
        ...listing(account(1, "octo", "User", "2026-01-01T00:00:00Z"), account(2, "acme", "Organization")),
        ...tokenFor(2),
        "GET /orgs/acme/members/octo": () => status(404),
      });
      expect(await provider.isInstallationMember("octo")).toBe(false);
      expect(seen.some((s) => s.url.includes("/installations/1/"))).toBe(false);
    });
    it("fails when an organization cannot be checked", async () => {
      const { provider } = setup({ ...listing(account(2, "acme", "Organization")), ...tokenFor(2), "GET /orgs/acme/members/octo": () => status(500) });
      await expect(provider.isInstallationMember("octo")).rejects.toThrow("500");
    });
  });
});

describe("getFile", () => {
  const url = "GET /repos/acme/web/contents/.hub.yml";
  const file = (over = {}) => ({ type: "file", sha: "abc123", encoding: "base64", content: Buffer.from("version: 1\n").toString("base64"), ...over });
  const routes = (answer: (seen: Seen) => Response) => ({ ...installationOfRepo, ...tokenFor(7), [url]: answer });

  it("returns the text, the ETag and the blob sha", async () => {
    const { provider } = setup(routes(() => json(file(), { headers: { etag: 'W/"e1"' } })));
    expect(await provider.getFile(repo, ".hub.yml")).toEqual({ kind: "found", content: "version: 1\n", etag: 'W/"e1"', sha: "abc123" });
  });
  it("sends the ETag it has, and reports an unchanged file", async () => {
    const { provider, seen } = setup(routes(() => status(304)));
    expect(await provider.getFile(repo, ".hub.yml", 'W/"e1"')).toEqual({ kind: "unchanged" });
    expect(seen.at(-1)!.headers.get("if-none-match")).toBe('W/"e1"');
  });
  it("sends no condition without an ETag, and tolerates an answer without one", async () => {
    const { provider, seen } = setup(routes(() => json(file())));
    expect(await provider.getFile(repo, ".hub.yml", "")).toMatchObject({ kind: "found", etag: "" });
    expect(seen.at(-1)!.headers.has("if-none-match")).toBe(false);
  });
  it("reports a missing file, a directory, a symlink and a submodule as absent", async () => {
    expect(await setup(routes(() => status(404))).provider.getFile(repo, ".hub.yml")).toEqual({ kind: "absent" });
    expect(await setup(routes(() => json([{ type: "file" }]))).provider.getFile(repo, ".hub.yml")).toEqual({ kind: "absent" });
    expect(await setup(routes(() => json(file({ type: "symlink" })))).provider.getFile(repo, ".hub.yml")).toEqual({ kind: "absent" });
    expect(await setup(routes(() => json({ type: "submodule", sha: "x" }))).provider.getFile(repo, ".hub.yml")).toEqual({ kind: "absent" });
  });
  it("throws for a file GitHub does not inline, and for any other failure", async () => {
    await expect(setup(routes(() => json(file({ encoding: "none", content: "" })))).provider.getFile(repo, ".hub.yml")).rejects.toThrow("larger than");
    await expect(setup(routes(() => json({ type: "file", sha: "x", encoding: "base64" }))).provider.getFile(repo, ".hub.yml")).rejects.toThrow("larger than");
    await expect(setup(routes(() => status(500))).provider.getFile(repo, ".hub.yml")).rejects.toThrow("500");
  });
  it("follows a move inside the API host, once the path is known, and nothing else", async () => {
    const moved = setup({
      ...installationOfRepo,
      ...tokenFor(7),
      [url]: () => status(301, { headers: { location: `${GITHUB_API}/repositories/9/contents/.hub.yml` } }),
      "GET /repositories/9/contents/.hub.yml": () => json(file()),
    });
    expect(await moved.provider.getFile(repo, ".hub.yml")).toMatchObject({ kind: "found" });
    const foreign = setup(routes(() => status(301, { headers: { location: "https://evil.test/x" } })));
    await expect(foreign.provider.getFile(repo, ".hub.yml")).rejects.toThrow("301");
    const none = setup(routes(() => status(301)));
    await expect(none.provider.getFile(repo, ".hub.yml")).rejects.toThrow("301");
  });
  it("gives up after a few moves", async () => {
    const { provider, seen } = setup({ ...installationOfRepo, ...tokenFor(7), [url]: () => status(301, { headers: { location: `${GITHUB_API}/repos/acme/web/contents/.hub.yml` } }) });
    await expect(provider.getFile(repo, ".hub.yml")).rejects.toThrow("301");
    expect(seen.filter((s) => s.url.endsWith("/contents/.hub.yml"))).toHaveLength(4);
  });
});

describe("getActivity", () => {
  const request = { kind: "releases", limit: 5 } as const;
  const url = "GET /repos/acme/web/releases?per_page=5";
  const routes = (answer: (seen: Seen) => Response) => ({ ...installationOfRepo, ...tokenFor(7), [url]: answer });
  const release = { tag_name: "v1", name: "One", html_url: "https://github.com/acme/web/releases/v1", published_at: "2026-05-01T00:00:00Z" };

  it("returns the items and the ETag of the list", async () => {
    const { provider } = setup(routes(() => json([release], { headers: { etag: 'W/"r1"' } })));
    expect(await provider.getActivity(repo, request)).toEqual({
      kind: "found",
      etag: 'W/"r1"',
      items: [{ key: "v1", title: "One", state: "released", by: null, url: "https://github.com/acme/web/releases/v1", at: "2026-05-01T00:00:00Z" }],
    });
  });
  it("sends the ETag it has, reports an unchanged list, and tolerates an answer without ETag", async () => {
    const same = setup(routes(() => status(304)));
    expect(await same.provider.getActivity(repo, request, 'W/"r1"')).toEqual({ kind: "unchanged" });
    expect(same.seen.at(-1)!.headers.get("if-none-match")).toBe('W/"r1"');
    const bare = setup(routes(() => json([])));
    expect(await bare.provider.getActivity(repo, request)).toEqual({ kind: "found", items: [], etag: "" });
    expect(bare.seen.at(-1)!.headers.has("if-none-match")).toBe(false);
  });
  it("throws when GitHub cannot answer or sends the wrong shape", async () => {
    await expect(setup(routes(() => status(403))).provider.getActivity(repo, request)).rejects.toThrow("403");
    await expect(setup(routes(() => json({ not: "a list" }))).provider.getActivity(repo, request)).rejects.toThrow();
  });
});
