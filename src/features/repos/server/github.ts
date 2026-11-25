import { createPrivateKey, createSign, type KeyObject } from "node:crypto";
import { z } from "zod";
import { activityPath, parseActivity } from "./github-activity";
import type { ActivityResult } from "../domain/activity";
import type { FileResult, GitProviderInterface, InstallationSummary, RepoPermission, RepoRef, RepoSummary } from "../domain/git-provider";

export const GITHUB_API = "https://api.github.com";
export const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_PAGES = 50;
const TOKEN_SKEW_MS = 60_000;
const MOVED = new Set([301, 307, 308]);
const MAX_FILE_BYTES = 1024 * 1024;

export type GitHubOptions = {
  /** The App's id and PEM private key, in clear, or `null` before the first-run setup. Asked until it answers. */
  credentials: () => Promise<{ appId: string; privateKey: string } | null>;
  fetch: typeof fetch;
  now?: () => number;
};

const Installation = z.object({ id: z.number().int(), account: z.object({ login: z.string().min(1), type: z.string() }), suspended_at: z.string().nullable() });
const Repository = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  owner: z.object({ login: z.string().min(1) }),
  default_branch: z.string().min(1),
  private: z.boolean(),
  archived: z.boolean(),
});
const Token = z.object({ token: z.string().min(1), expires_at: z.string() });
const Role = z.object({ role_name: z.enum(["none", "read", "triage", "write", "maintain", "admin"]).catch("none") });
const Membership = z.object({ state: z.string() });
const File = z.object({ type: z.string(), sha: z.string(), encoding: z.string().optional(), content: z.string().optional() });
const Id = z.object({ id: z.number().int() });

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");
const enc = encodeURIComponent;
const repoKey = (repo: RepoRef) => `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`;

type Auth = { app: true } | { installation: number };
type Call = { auth: Auth; accept?: string; etag?: string; method?: string };

/**
 * `GitProviderInterface` over the GitHub REST API: `fetch` and `node:crypto`, no SDK. The App authenticates with a
 * short-lived JWT, then acts through installation tokens (cached until a minute before they expire).
 * Everything GitHub answers is untrusted: shapes are checked, and anything unexpected throws. A throw is a denial for
 * the access checks and an aborted run for discovery, so a failure never grants or forgets anything.
 */
export function createGitHubProvider({ credentials, fetch: send, now = Date.now }: GitHubOptions): GitProviderInterface {
  let signer: { appId: string; key: KeyObject } | undefined;
  const tokens = new Map<number, { token: string; expiresAt: number }>();
  let installationOf = new Map<string, number>();

  async function appJwt(): Promise<string> {
    if (!signer) {
      const found = await credentials();
      if (!found) throw new Error("The GitHub App is not set up yet");
      signer = { appId: found.appId, key: createPrivateKey(found.privateKey) };
    }
    const issuedAt = Math.floor(now() / 1000);
    // Backdated a minute for clock drift; GitHub accepts at most ten minutes.
    const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iat: issuedAt - 60, exp: issuedAt + 540, iss: signer.appId }))}`;
    return `${unsigned}.${b64url(createSign("RSA-SHA256").update(unsigned).sign(signer.key))}`;
  }

  async function bearer(auth: Auth): Promise<string> {
    if ("app" in auth) return appJwt();
    const cached = tokens.get(auth.installation);
    if (cached && cached.expiresAt - now() > TOKEN_SKEW_MS) return cached.token;
    const response = await request(`/app/installations/${auth.installation}/access_tokens`, { auth: { app: true }, method: "POST" });
    const made = Token.parse(await response.json());
    tokens.set(auth.installation, { token: made.token, expiresAt: Date.parse(made.expires_at) });
    return made.token;
  }

  async function request(target: string, { auth, accept = "application/vnd.github+json", etag, method = "GET" }: Call): Promise<Response> {
    return send(target.startsWith("http") ? target : `${GITHUB_API}${target}`, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${await bearer(auth)}`,
        accept,
        "x-github-api-version": "2022-11-28",
        "user-agent": "orrery",
        ...(etag ? { "if-none-match": etag } : {}),
      },
    });
  }

  /**
   * Moves are followed by hand, only inside the API host (a renamed repository answers 301). A 302 is never followed:
   * on the membership endpoints it means "you cannot see the members", and its target would answer another question.
   */
  async function call(target: string, options: Call, expected: readonly number[]): Promise<Response> {
    let response = await request(target, options);
    for (let hops = 0; MOVED.has(response.status) && hops < 3; hops++) {
      const next = response.headers.get("location") ?? "";
      if (!next.startsWith(`${GITHUB_API}/`)) break;
      response = await request(next, options);
    }
    if (!expected.includes(response.status)) throw new Error(`GitHub answered ${response.status} to ${options.method ?? "GET"} ${target.split("?")[0]}`);
    return response;
  }

  const json = async (target: string, options: Call) => (await call(target, options, [200])).json();

  async function pages<T>(target: string, auth: Auth, items: (page: unknown) => T[]): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = target;
    for (let page = 0; next; page++) {
      if (page === MAX_PAGES) throw new Error("GitHub returned more pages than the hub reads");
      const response: Response = await call(next, { auth }, [200]);
      out.push(...items(await response.json()));
      next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get("link") ?? "")?.[1];
      if (next && !next.startsWith(`${GITHUB_API}/`)) throw new Error("GitHub paginated to a foreign host");
    }
    return out;
  }

  const listInstallations = async (): Promise<InstallationSummary[]> =>
    (await pages("/app/installations?per_page=100", { app: true }, (page) => z.array(Installation).parse(page))).map((i) => ({
      id: i.id,
      accountLogin: i.account.login,
      accountType: i.account.type,
      suspended: i.suspended_at !== null,
    }));

  async function installationFor(path: string): Promise<number> {
    return Id.parse(await json(path, { auth: { app: true } })).id;
  }

  async function repoInstallation(repo: RepoRef): Promise<number> {
    const known = installationOf.get(repoKey(repo));
    if (known !== undefined) return known;
    const id = await installationFor(`/repos/${enc(repo.owner)}/${enc(repo.name)}/installation`);
    installationOf.set(repoKey(repo), id);
    return id;
  }

  /** 204 is yes and 404 is no; anything else (a redirect when the App cannot see the organization's members included) throws. */
  async function yesOrNo(target: string, auth: Auth): Promise<boolean> {
    return (await call(target, { auth }, [204, 404])).status === 204;
  }

  const orgMember = (installation: number, org: string, login: string) => yesOrNo(`/orgs/${enc(org)}/members/${enc(login)}`, { installation });

  return {
    listInstallations,

    async listRepositories() {
      const found = new Map<string, number>();
      const out: RepoSummary[] = [];
      for (const installation of (await listInstallations()).filter((i) => !i.suspended)) {
        const rows = await pages(`/installation/repositories?per_page=100`, { installation: installation.id }, (page) => {
          const list = z.object({ repositories: z.array(z.unknown()) }).parse(page).repositories;
          return list.flatMap((row) => {
            const parsed = Repository.safeParse(row);
            return parsed.success ? [parsed.data] : [];
          });
        });
        for (const r of rows) {
          const summary = { githubId: r.id, installationId: installation.id, owner: r.owner.login, name: r.name, defaultBranch: r.default_branch, isPrivate: r.private, archived: r.archived };
          found.set(repoKey(summary), installation.id);
          out.push(summary);
        }
      }
      installationOf = found;
      return out;
    },

    async getUserPermission(repo, username): Promise<RepoPermission> {
      const auth = { installation: await repoInstallation(repo) };
      const base = `/repos/${enc(repo.owner)}/${enc(repo.name)}/collaborators/${enc(username)}`;
      // Collaborator or not first: the permission endpoint also answers "read" for anybody on a public repository.
      if (!(await yesOrNo(base, auth))) return "none";
      return Role.parse(await json(`${base}/permission`, { auth })).role_name;
    },

    async isInstallationMember(login) {
      for (const installation of (await listInstallations()).filter((i) => !i.suspended)) {
        const member =
          installation.accountType === "Organization"
            ? await orgMember(installation.id, installation.accountLogin, login)
            : installation.accountLogin.toLowerCase() === login.toLowerCase();
        if (member) return true;
      }
      return false;
    },

    async isOrgMember(org, login) {
      return orgMember(await installationFor(`/orgs/${enc(org)}/installation`), org, login);
    },

    async isTeamMember(org, teamSlug, login) {
      const auth = { installation: await installationFor(`/orgs/${enc(org)}/installation`) };
      const response = await call(`/orgs/${enc(org)}/teams/${enc(teamSlug)}/memberships/${enc(login)}`, { auth }, [200, 404]);
      return response.status === 200 && Membership.parse(await response.json()).state === "active";
    },

    async getFile(repo, path, etag): Promise<FileResult> {
      const auth = { installation: await repoInstallation(repo) };
      const response = await call(`/repos/${enc(repo.owner)}/${enc(repo.name)}/contents/${enc(path)}`, { auth, etag }, [200, 304, 404]);
      if (response.status === 304) return { kind: "unchanged" };
      if (response.status === 404) return { kind: "absent" };
      const file = File.safeParse(await response.json());
      // A directory (an array), a symlink or a submodule is not a config file.
      if (!file.success || file.data.type !== "file") return { kind: "absent" };
      if (file.data.encoding !== "base64" || file.data.content === undefined) throw new Error(`the file is larger than ${MAX_FILE_BYTES} bytes`);
      return { kind: "found", content: Buffer.from(file.data.content, "base64").toString("utf8"), etag: response.headers.get("etag") ?? "", sha: file.data.sha };
    },

    async getActivity(repo, request, etag): Promise<ActivityResult> {
      const auth = { installation: await repoInstallation(repo) };
      const response = await call(activityPath(repo, request), { auth, etag }, [200, 304]);
      if (response.status === 304) return { kind: "unchanged" };
      return { kind: "found", items: parseActivity(request, await response.json()), etag: response.headers.get("etag") ?? "" };
    },
  };
}
