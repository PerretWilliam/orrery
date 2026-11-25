import type { Project, ProjectsDeps } from "@/features/repos/server/projects";
import type { RepoRef } from "@/features/repos/domain/git-provider";
import type { WidgetData } from "@/features/widgets/server/widget-data";
import type { Widget, WidgetProject } from "@/features/widgets/domain/types";
import { parseConfig } from "@/features/config/domain/parse-config";
import { LIMITS } from "@/features/config/domain/limits";
import type {
  ProxyRequest,
  ProxyResult,
} from "@/features/data-proxy/domain/source-proxy";
import { apiError } from "../domain/errors";
import type { RateLimiter } from "../domain/rate-limit";

export type ApiDeps = {
  authenticate: (
    token: string,
  ) => Promise<{ tokenId: string; login: string } | null>;
  projects: {
    visibleTo: (login: string) => Promise<Project[]>;
    open: (repo: RepoRef, login: string) => Promise<Project | null>;
  };
  widgetData: {
    load: (project: WidgetProject, widget: Widget) => Promise<WidgetData>;
  };
  limiter: RateLimiter;
  /** May this user manage the project (maintain or admin)? Fails closed. */
  canManage: (repo: RepoRef, login: string) => Promise<boolean>;
  proxy: { preview: (request: ProxyRequest) => Promise<ProxyResult> };
};
export type { ProjectsDeps };

const UNTRUSTED = "untrusted" as const;
const json = (body: object) =>
  Response.json(
    { trust: UNTRUSTED, ...body },
    { headers: { "cache-control": "no-store" } },
  );
const summary = (p: Project) => ({
  owner: p.owner,
  name: p.name,
  title: p.title,
  archived: p.archived,
  valid: p.config !== null,
});

const answer = (result: WidgetData) =>
  json(
    result.ok
      ? {
          data: result.data,
          fetchedAt: result.fetchedAt?.toISOString() ?? null,
          stale: result.stale,
        }
      : {
          errors: result.errors.map((e) => ({
            code: e.code,
            path: e.path ?? "",
            message: e.message,
            fix: e.fix,
          })),
        },
  );

type PreviewBody = {
  yaml: string;
  source?: string;
  page?: string;
  index?: number;
};
/** The JSON body of a preview, or `null` when it is too big, not JSON, or not shaped as documented. */
async function readBody(request: Request): Promise<PreviewBody | null> {
  const raw = await request.text();
  if (raw.length > 2 * LIMITS.maxBytes) return null;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  const { yaml, source, page, index } = body ?? {};
  const optional = (v: unknown) => v === undefined || typeof v === "string";
  if (
    typeof yaml !== "string" ||
    !optional(source) ||
    !optional(page) ||
    (index !== undefined && !Number.isInteger(index))
  )
    return null;
  return {
    yaml,
    source: source as string | undefined,
    page: page as string | undefined,
    index: index as number | undefined,
  };
}

/**
 * The read API. Every call acts as the token's owner: the same access policy as the UI, and anything the owner may not see is a 404
 * indistinguishable from a missing project. Content that comes from repositories and sources is marked untrusted.
 */
export function createApi({
  authenticate,
  projects,
  widgetData,
  limiter,
  canManage,
  proxy,
}: ApiDeps) {
  async function guard(
    request: Request,
    run: (login: string) => Promise<Response>,
  ): Promise<Response> {
    const match = /^Bearer (\S+)$/.exec(
      request.headers.get("authorization") ?? "",
    );
    const who = match ? await authenticate(match[1]).catch(() => null) : null;
    if (!who)
      return apiError("api_unauthorized", { "www-authenticate": "Bearer" });
    const taken = limiter.take(who.tokenId);
    return taken.ok
      ? run(who.login)
      : apiError("api_rate_limited", {
          "retry-after": String(taken.retryAfter),
        });
  }

  return {
    /** Authentication and rate limit for one request, then `run` as the token's owner. Shared with the MCP server. */
    guard,

    listProjects: (request: Request) =>
      guard(request, async (login) =>
        json({ projects: (await projects.visibleTo(login)).map(summary) }),
      ),

    getProject: (request: Request, repo: RepoRef) =>
      guard(request, async (login) => {
        const project = await projects.open(repo, login);
        if (!project) return apiError("api_not_found");
        const pages = (project.config?.pages ?? []).map((page) => ({
          id: page.id,
          title: page.title,
          widgets: page.widgets.map((widget, index) => ({
            index,
            type: widget.type,
            ...("title" in widget && widget.title
              ? { title: widget.title }
              : {}),
          })),
        }));
        return json({
          project: summary(project),
          issues: project.issues,
          pages,
        });
      }),

    getWidgetData: (
      request: Request,
      repo: RepoRef,
      pageId: string,
      index: string,
    ) =>
      guard(request, async (login) => {
        const project = await projects.open(repo, login);
        const widget = project?.config?.pages.find((page) => page.id === pageId)
          ?.widgets[/^\d{1,4}$/.test(index) ? Number(index) : -1];
        if (!project?.config || !widget) return apiError("api_not_found");
        return answer(
          await widgetData.load(
            { ...repo, id: project.id, config: project.config },
            widget,
          ),
        );
      }),

    /**
     * Fetches one source of a config the caller sends, now and without the cache: the way to try a `.hub.yml` before committing it. Needs the
     * `manage` right, since it makes the hub call out with the project's secrets (still only to their bound hosts, and only to allowed hosts).
     */
    previewSource: (request: Request, repo: RepoRef) =>
      guard(request, async (login) => {
        const project = await projects.open(repo, login);
        if (!project) return apiError("api_not_found");
        if (!(await canManage(repo, login))) return apiError("api_forbidden");
        const body = await readBody(request);
        if (!body) return apiError("api_invalid_request", {}, "yaml");
        const parsed = parseConfig(body.yaml);
        if (!parsed.ok)
          return Response.json(
            { errors: parsed.issues },
            { status: 400, headers: { "cache-control": "no-store" } },
          );
        const widget =
          body.page === undefined
            ? undefined
            : parsed.config.pages.find((page) => page.id === body.page)
                ?.widgets[body.index ?? -1];
        const id =
          body.page === undefined
            ? body.source
            : widget && "source" in widget
              ? widget.source
              : undefined;
        const source =
          id !== undefined && Object.hasOwn(parsed.config.sources, id)
            ? Reflect.get(parsed.config.sources, id)
            : undefined;
        if (!source)
          return apiError(
            "api_invalid_request",
            {},
            body.page === undefined ? "source" : "page",
          );
        const result = await proxy.preview({
          repositoryId: project.id,
          source: {
            url: source.url,
            method: source.method,
            headers: source.headers,
            body: source.body,
            ttlSeconds: 0, // a dry run is never cached
          },
        });
        return answer(
          result.ok
            ? {
                ok: true,
                data: result.data,
                fetchedAt: result.fetchedAt,
                stale: false,
              }
            : result,
        );
      }),
  };
}
