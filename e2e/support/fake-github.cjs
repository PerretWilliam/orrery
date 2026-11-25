// Preloaded into the e2e instance server (NODE_OPTIONS=--require): answers api.github.com from a fixture, so the real
// GitHub adapter, discovery and permission checks run end to end without the network. Anything else goes out as usual.
const { readFileSync } = process.getBuiltinModule("node:fs");
const { join } = process.getBuiltinModule("node:path");

const realFetch = globalThis.fetch;
const API = "https://api.github.com";

const HUB_YML = `version: 1
project:
  name: Starfall
sources:
  # A source that is down: the host never resolves.
  gone: { url: "https://gone.invalid/data.json" }
pages:
  - id: overview
    title: Overview
    widgets: []
  - id: ops
    title: Operations
    widgets: []
  # Ten GitHub widgets, for the performance journey (e2e/instance.spec.ts).
  - id: perf
    title: Performance
    widgets:
      - { type: github.issues, title: P1, state: open }
      - { type: github.issues, title: P2, state: closed }
      - { type: github.issues, title: P3, state: all }
      - { type: github.pull_requests, title: P4, state: open }
      - { type: github.pull_requests, title: P5, state: closed }
      - { type: github.pull_requests, title: P6, state: all }
      - { type: github.workflow_runs, title: P7 }
      - { type: github.workflow_runs, title: P8, branch: main }
      - { type: github.releases, title: P9 }
      - { type: github.releases, title: P10, limit: 5 }
  - id: down
    title: Down
    widgets:
      - { type: kpi, title: Gone, source: gone, label: Users, path: total }
      - { type: github.releases, title: Still here }
`;
const ETAG = '"hub-v1"';
// The second repository, whose file is invalid.
const BROKEN_YML = readFileSync(join(__dirname, "broken.hub.yml"), "utf8");
// Who GitHub says is a collaborator of the repositories, and with which role. Everybody else is a stranger.
const COLLABORATORS = { alice: "write" };
// With no allowlist, the members of the organization are who may use the hub: bob may, and sees no repository.
const MEMBERS = ["alice", "bob"];

const ITEM_URL = "https://github.com/acme/web/x";
const ten = (make) => Array.from({ length: 10 }, (_, i) => make(i + 1));
const stamp = "2026-01-01T00:00:00Z";
const LISTS = {
  "/issues": () =>
    ten((n) => ({
      number: n,
      title: `Issue ${n}`,
      state: "open",
      user: { login: "alice" },
      html_url: ITEM_URL,
      updated_at: stamp,
    })),
  "/pulls": () =>
    ten((n) => ({
      number: n,
      title: `Pull ${n}`,
      state: "open",
      draft: false,
      merged_at: null,
      user: { login: "alice" },
      html_url: ITEM_URL,
      updated_at: stamp,
    })),
  "/actions/runs": () => ({
    workflow_runs: ten((n) => ({
      name: "CI",
      display_title: `Run ${n}`,
      status: "completed",
      conclusion: "success",
      actor: { login: "alice" },
      html_url: ITEM_URL,
      updated_at: stamp,
    })),
  }),
  "/releases": () =>
    ten((n) => ({
      tag_name: `v0.${n}.0`,
      name: `Release ${n}`,
      draft: false,
      prerelease: false,
      author: { login: "alice" },
      html_url: ITEM_URL,
      published_at: stamp,
      created_at: stamp,
    })),
};

const repository = (id, name) => ({
  id,
  name,
  owner: { login: "acme" },
  default_branch: "main",
  private: true,
  archived: false,
});
const file = (text, etag, headers) =>
  headers.get("if-none-match") === etag
    ? empty(304)
    : json({ type: "file", sha: "abc123", encoding: "base64", content: Buffer.from(text).toString("base64") }, 200, { etag });

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const empty = (status) => new Response(null, { status });

function answer(method, path, headers) {
  if (method === "GET" && path.startsWith("/app/installations?")) {
    return json([
      {
        id: 7,
        account: { login: "acme", type: "Organization" },
        suspended_at: null,
      },
    ]);
  }
  if (method === "POST" && path === "/app/installations/7/access_tokens")
    return json({ token: "ghs_e2e", expires_at: "2099-01-01T00:00:00Z" }, 201);
  if (method === "GET" && path.startsWith("/installation/repositories?")) {
    return json({ repositories: [repository(1, "web"), repository(2, "zeta")] });
  }
  if (method === "GET" && /^\/repos\/acme\/(web|zeta)\/installation$/.test(path))
    return json({ id: 7 });
  if (method === "GET" && path === "/repos/acme/web/contents/.hub.yml")
    return file(HUB_YML, ETAG, headers);
  if (method === "GET" && path === "/repos/acme/zeta/contents/.hub.yml")
    return file(BROKEN_YML, '"broken-v1"', headers);
  const list =
    /^\/repos\/acme\/web(\/issues|\/pulls|\/actions\/runs|\/releases)\?/.exec(
      path,
    );
  if (method === "GET" && list)
    return json(LISTS[list[1]](), 200, { etag: `"list-${list[1]}"` });
  const member = /^\/orgs\/acme\/members\/([^/]+)$/.exec(path);
  if (method === "GET" && member)
    return empty(MEMBERS.includes(member[1]) ? 204 : 404);
  const collaborator =
    /^\/repos\/acme\/(?:web|zeta)\/collaborators\/([^/]+)(\/permission)?$/.exec(path);
  if (method === "GET" && collaborator) {
    const role = COLLABORATORS[collaborator[1]];
    if (!collaborator[2]) return empty(role ? 204 : 404);
    return role ? json({ role_name: role }) : empty(404);
  }
  return empty(404);
}

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (!request.url.startsWith(`${API}/`)) return realFetch(input, init);
  const path = request.url.slice(API.length);
  const response = answer(request.method, path, request.headers);
  console.log(`[fake-github] ${request.method} ${path} -> ${response.status}`);
  return response;
};
