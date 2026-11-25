// Preloaded into the e2e instance server (NODE_OPTIONS=--require): answers api.github.com from a fixture, so the real
// GitHub adapter, discovery and permission checks run end to end without the network. Anything else goes out as usual.
const realFetch = globalThis.fetch;
const API = "https://api.github.com";

const HUB_YML = `version: 1
project:
  name: Starfall
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
`;
const ETAG = '"hub-v1"';
// Who GitHub says is a collaborator of acme/web, and with which role. Everybody else is a stranger.
const COLLABORATORS = { alice: "write" };

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
    return json({
      repositories: [
        {
          id: 1,
          name: "web",
          owner: { login: "acme" },
          default_branch: "main",
          private: true,
          archived: false,
        },
      ],
    });
  }
  if (method === "GET" && path === "/repos/acme/web/installation")
    return json({ id: 7 });
  if (method === "GET" && path === "/repos/acme/web/contents/.hub.yml") {
    if (headers.get("if-none-match") === ETAG) return empty(304);
    return json(
      {
        type: "file",
        sha: "abc123",
        encoding: "base64",
        content: Buffer.from(HUB_YML).toString("base64"),
      },
      200,
      { etag: ETAG },
    );
  }
  const list =
    /^\/repos\/acme\/web(\/issues|\/pulls|\/actions\/runs|\/releases)\?/.exec(
      path,
    );
  if (method === "GET" && list)
    return json(LISTS[list[1]](), 200, { etag: `"list-${list[1]}"` });
  const collaborator =
    /^\/repos\/acme\/web\/collaborators\/([^/]+)(\/permission)?$/.exec(path);
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
