import type { Failure } from "@/features/data-proxy/domain/source-proxy";
import type { ActivityItem, ActivityRequest } from "@/features/repos/domain/activity";
import type { GitProviderInterface, RepoRef } from "@/features/repos/domain/git-provider";
import { log } from "@/lib/logger";

export type ActivityData = { ok: true; items: ActivityItem[]; fetchedAt: Date; stale: boolean } | { ok: false; errors: readonly Failure[] };

export const ACTIVITY_TTL_MS = 60_000;
export const MAX_CACHED = 500;

/** Stable code, never renamed or reused. */
export const GITHUB_UNAVAILABLE: Failure = {
  code: "github_unavailable",
  message: "GitHub did not answer for this widget",
  fix: "Check that the GitHub App is installed on this repository with read access to issues, pull requests, actions and releases, then try again.",
};

type Entry = { etag: string; items: ActivityItem[]; at: number };

/**
 * Reads the GitHub lists the widgets show. One request per list however many viewers: answers are kept for a minute,
 * then asked again with the ETag (a 304 costs no rate limit), concurrent askers share one request, and when GitHub
 * fails the last answer is shown as stale. Nothing here ever writes to GitHub.
 */
export function createActivity({ git, now = Date.now }: { git: Pick<GitProviderInterface, "getActivity">; now?: () => number }) {
  const cache = new Map<string, Entry>();
  const inflight = new Map<string, Promise<ActivityData>>();

  async function refresh(key: string, repo: RepoRef, request: ActivityRequest): Promise<ActivityData> {
    const known = cache.get(key);
    try {
      const result = await git.getActivity(repo, request, known?.etag || undefined);
      if (result.kind === "unchanged" && !known) throw new Error("GitHub reported an unchanged list we never had");
      const entry: Entry = result.kind === "found" ? { etag: result.etag, items: result.items, at: now() } : { ...(known as Entry), at: now() };
      cache.delete(key);
      cache.set(key, entry);
      if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
      return { ok: true, items: entry.items, fetchedAt: new Date(entry.at), stale: false };
    } catch (error) {
      log("warn", "github activity failed", { kind: request.kind, error: error instanceof Error ? error.message : "unknown error" });
      return known ? { ok: true, items: known.items, fetchedAt: new Date(known.at), stale: true } : { ok: false, errors: [GITHUB_UNAVAILABLE] };
    }
  }

  return {
    load(repo: RepoRef, request: ActivityRequest): Promise<ActivityData> {
      const key = JSON.stringify([repo.owner.toLowerCase(), repo.name.toLowerCase(), request]);
      const known = cache.get(key);
      if (known && now() - known.at < ACTIVITY_TTL_MS) return Promise.resolve({ ok: true, items: known.items, fetchedAt: new Date(known.at), stale: false });
      let pending = inflight.get(key);
      if (!pending) {
        pending = refresh(key, repo, request).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      return pending;
    },
  };
}
export type ActivityService = ReturnType<typeof createActivity>;
