import type { Project, ProjectsDeps } from "@/features/repos/server/projects";
import type { RepoRef } from "@/features/repos/domain/git-provider";
import type { WidgetData } from "@/features/widgets/server/widget-data";
import type { Widget, WidgetProject } from "@/features/widgets/domain/types";
import { apiError } from "../domain/errors";
import type { RateLimiter } from "../domain/rate-limit";

export type ApiDeps = {
  authenticate: (token: string) => Promise<{ tokenId: string; login: string } | null>;
  projects: { visibleTo: (login: string) => Promise<Project[]>; open: (repo: RepoRef, login: string) => Promise<Project | null> };
  widgetData: { load: (project: WidgetProject, widget: Widget) => Promise<WidgetData> };
  limiter: RateLimiter;
};
export type { ProjectsDeps };

const UNTRUSTED = "untrusted" as const;
const json = (body: object) => Response.json({ trust: UNTRUSTED, ...body }, { headers: { "cache-control": "no-store" } });
const summary = (p: Project) => ({ owner: p.owner, name: p.name, title: p.title, archived: p.archived, valid: p.config !== null });

/**
 * The read API. Every call acts as the token's owner: the same access policy as the UI, and anything the owner may not see is a 404
 * indistinguishable from a missing project. Content that comes from repositories and sources is marked untrusted.
 */
export function createApi({ authenticate, projects, widgetData, limiter }: ApiDeps) {
  async function guard(request: Request, run: (login: string) => Promise<Response>): Promise<Response> {
    const match = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "");
    const who = match ? await authenticate(match[1]).catch(() => null) : null;
    if (!who) return apiError("api_unauthorized", { "www-authenticate": "Bearer" });
    const taken = limiter.take(who.tokenId);
    return taken.ok ? run(who.login) : apiError("api_rate_limited", { "retry-after": String(taken.retryAfter) });
  }

  return {
    listProjects: (request: Request) => guard(request, async (login) => json({ projects: (await projects.visibleTo(login)).map(summary) })),

    getProject: (request: Request, repo: RepoRef) =>
      guard(request, async (login) => {
        const project = await projects.open(repo, login);
        if (!project) return apiError("api_not_found");
        const pages = (project.config?.pages ?? []).map((page) => ({
          id: page.id,
          title: page.title,
          widgets: page.widgets.map((widget, index) => ({ index, type: widget.type, ...("title" in widget && widget.title ? { title: widget.title } : {}) })),
        }));
        return json({ project: summary(project), issues: project.issues, pages });
      }),

    getWidgetData: (request: Request, repo: RepoRef, pageId: string, index: string) =>
      guard(request, async (login) => {
        const project = await projects.open(repo, login);
        const widget = project?.config?.pages.find((page) => page.id === pageId)?.widgets[/^\d{1,4}$/.test(index) ? Number(index) : -1];
        if (!project?.config || !widget) return apiError("api_not_found");
        const result = await widgetData.load({ ...repo, id: project.id, config: project.config }, widget);
        return json(
          result.ok
            ? { data: result.data, fetchedAt: result.fetchedAt?.toISOString() ?? null, stale: result.stale }
            : { errors: result.errors.map((e) => ({ code: e.code, path: e.path ?? "", message: e.message, fix: e.fix })) },
        );
      }),
  };
}
