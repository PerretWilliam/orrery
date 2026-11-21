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
`;
const ETAG = '"hub-v1"';
// Who GitHub says is a collaborator of acme/web, and with which role. Everybody else is a stranger.
const COLLABORATORS = { alice: "write" };

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const empty = (status) => new Response(null, { status });

function answer(method, path, headers) {
  if (method === "GET" && path.startsWith("/app/installations?")) {
    return json([{ id: 7, account: { login: "acme", type: "Organization" }, suspended_at: null }]);
  }
  if (method === "POST" && path === "/app/installations/7/access_tokens") return json({ token: "ghs_e2e", expires_at: "2099-01-01T00:00:00Z" }, 201);
  if (method === "GET" && path.startsWith("/installation/repositories?")) {
    return json({ repositories: [{ id: 1, name: "web", owner: { login: "acme" }, default_branch: "main", private: true, archived: false }] });
  }
  if (method === "GET" && path === "/repos/acme/web/installation") return json({ id: 7 });
  if (method === "GET" && path === "/repos/acme/web/contents/.hub.yml") {
    if (headers.get("if-none-match") === ETAG) return empty(304);
    return json({ type: "file", sha: "abc123", encoding: "base64", content: Buffer.from(HUB_YML).toString("base64") }, 200, { etag: ETAG });
  }
  const collaborator = /^\/repos\/acme\/web\/collaborators\/([^/]+)(\/permission)?$/.exec(path);
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
