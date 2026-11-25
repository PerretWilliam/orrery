import { z } from "zod";
import type { ActivityItem, ActivityRequest } from "../domain/activity";
import type { RepoRef } from "../domain/git-provider";

const enc = encodeURIComponent;
const MAX_TEXT = 200;
const text = z.string().transform((value) => value.slice(0, MAX_TEXT));
const user = z.object({ login: text }).nullish();
const link = z.string().transform((url) => (url.startsWith("https://github.com/") ? url : ""));
const date = z.string().nullish();

const Issue = z.object({ number: z.number().int(), title: text, state: text, user, html_url: link, updated_at: date, pull_request: z.unknown().optional() });
const Pull = z.object({ number: z.number().int(), title: text, state: text, draft: z.boolean().nullish(), merged_at: z.string().nullish(), user, html_url: link, updated_at: date });
const Run = z.object({ name: text.nullish(), display_title: text.nullish(), status: text.nullish(), conclusion: text.nullish(), actor: user, html_url: link, updated_at: date });
const Release = z.object({ tag_name: text, name: text.nullish(), draft: z.boolean().nullish(), prerelease: z.boolean().nullish(), author: user, html_url: link, published_at: date, created_at: date });
const Runs = z.object({ workflow_runs: z.array(z.unknown()) });

/** The API path of a request: sorted by last change where the host allows it, and only what the widget shows. */
export function activityPath(repo: RepoRef, { kind, state = "open", branch, limit }: ActivityRequest): string {
  const base = `/repos/${enc(repo.owner)}/${enc(repo.name)}`;
  switch (kind) {
    // The issues endpoint mixes in pull requests: ask for a full page, and keep `limit` real issues after the filter.
    case "issues":
      return `${base}/issues?state=${state}&sort=updated&direction=desc&per_page=100`;
    case "pull_requests":
      return `${base}/pulls?state=${state}&sort=updated&direction=desc&per_page=${limit}`;
    case "workflow_runs":
      return `${base}/actions/runs?per_page=${limit}${branch ? `&branch=${enc(branch)}` : ""}`;
    case "releases":
      return `${base}/releases?per_page=${limit}`;
  }
}

function each<T>(rows: unknown[], schema: z.ZodType<T>, map: (row: T) => ActivityItem | null, limit: number): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    const item = parsed.success ? map(parsed.data) : null;
    if (item) out.push(item);
    if (out.length === limit) break;
  }
  return out;
}

/** Items of the host's answer. A wrong overall shape throws; a single odd row is skipped, never shown half-read. */
export function parseActivity({ kind, limit }: ActivityRequest, body: unknown): ActivityItem[] {
  switch (kind) {
    case "issues":
      return each(z.array(z.unknown()).parse(body), Issue, (i) => (i.pull_request === undefined ? { key: `#${i.number}`, title: i.title, state: i.state, by: i.user?.login ?? null, url: i.html_url, at: i.updated_at ?? null } : null), limit);
    case "pull_requests":
      return each(z.array(z.unknown()).parse(body), Pull, (p) => ({ key: `#${p.number}`, title: p.title, state: p.merged_at ? "merged" : p.draft ? "draft" : p.state, by: p.user?.login ?? null, url: p.html_url, at: p.updated_at ?? null }), limit);
    case "workflow_runs":
      return each(Runs.parse(body).workflow_runs, Run, (r) => ({ key: r.name ?? "", title: r.display_title ?? r.name ?? "", state: r.conclusion ?? r.status ?? "unknown", by: r.actor?.login ?? null, url: r.html_url, at: r.updated_at ?? null }), limit);
    case "releases":
      return each(z.array(z.unknown()).parse(body), Release, (r) => ({ key: r.tag_name, title: r.name || r.tag_name, state: r.draft ? "draft" : r.prerelease ? "prerelease" : "released", by: r.author?.login ?? null, url: r.html_url, at: r.published_at ?? r.created_at ?? null }), limit);
  }
}
