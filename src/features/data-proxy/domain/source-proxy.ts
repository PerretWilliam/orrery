import { createHash } from "node:crypto";
import {
  resolveSecrets,
  type SecretLookup,
} from "@/features/secrets/domain/resolve";
import { log } from "@/lib/logger";
import { SsrfError, type SsrfPolicy } from "@/lib/ssrf-guard";
import { SourceError } from "./source-error";

/**
 * The data proxy: what a widget gets for a source. One cache entry per (project, request), shared by every viewer.
 *
 * - Fresh entry: returned as is.
 * - Expired entry: returned at once as `stale` while one background request refreshes it (stale-while-revalidate).
 * - No entry: one request is made, and every viewer asking meanwhile waits for that same request (coalescing).
 * - A failed request is never cached and never replaces good data. The cache is an optimisation: if it breaks, requests
 *   still work, and if anything needed to build or allow the request breaks, nothing is sent (fail closed).
 * Secrets are resolved just before sending and never reach the cache key, the cache or the logs.
 */

export const UNUSED_ENTRY_DAYS = 7;
/** `last_accessed_at` is only written when it is older than this, so reading does not mean writing. */
export const TOUCH_INTERVAL_MS = 60 * 60_000;

export type SourceSpec = {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
  /** Static JSON body, POST only. */
  readonly body?: unknown;
  readonly ttlSeconds: number;
};
export type ProxyRequest = {
  readonly repositoryId: string;
  readonly source: SourceSpec;
};

export type Failure = {
  readonly code: string;
  readonly message: string;
  readonly fix: string;
  readonly path?: string;
};
export type ProxyResult =
  | {
      ok: true;
      state: "fresh" | "stale" | "miss";
      data: unknown;
      fetchedAt: Date;
      expiresAt: Date;
    }
  | { ok: false; errors: readonly Failure[] };

export type CacheEntry = {
  body: unknown;
  fetchedAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
};
export interface CacheStore {
  get(key: string): Promise<CacheEntry | null>;
  put(
    key: string,
    repositoryId: string,
    entry: { body: unknown; fetchedAt: Date; expiresAt: Date },
  ): Promise<void>;
  touch(key: string, at: Date): Promise<void>;
  /** Deletes the entries last read before `cutoff` and returns how many. */
  purgeUnusedSince(cutoff: Date): Promise<number>;
}

export type ProxyDeps = {
  store: CacheStore;
  /** `fetchSource` bound to the real DNS and transport. */
  fetch: (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
    policy: SsrfPolicy,
  ) => Promise<{ data: unknown }>;
  /** Admin hosts, and the project's own list: read again for every request, so a change applies at once. */
  loadPolicy: (repositoryId: string) => Promise<SsrfPolicy>;
  loadSecrets: (repositoryId: string) => Promise<SecretLookup>;
  now?: () => number;
};

/**
 * Identifies a request without ever containing a secret value: it hashes the request as written in `.hub.yml`
 * (references like `${TOKEN}` included, not their values), scoped to the project.
 */
export function cacheKey({ repositoryId, source }: ProxyRequest): string {
  const headers = Object.entries(source.headers ?? {})
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return createHash("sha256")
    .update(
      JSON.stringify([
        repositoryId,
        source.method,
        source.url,
        headers,
        source.body ?? null,
      ]),
    )
    .digest("hex");
}

const failure = (error: {
  code: string;
  message: string;
  fix: string;
}): Failure => ({ code: error.code, message: error.message, fix: error.fix });
const toFailures = (error: unknown): Failure[] =>
  error instanceof SourceError || error instanceof SsrfError
    ? [failure(error)]
    : [failure(new SourceError("source_internal"))];

/** Daily job: forget what nobody has read for 7 days. Returns how many entries went. */
export async function purgeUnused(
  store: CacheStore,
  now: () => number = Date.now,
): Promise<number> {
  const removed = await store.purgeUnusedSince(
    new Date(now() - UNUSED_ENTRY_DAYS * 24 * 3600_000),
  );
  log("info", "purged unused source cache entries", { removed });
  return removed;
}

export function createSourceProxy({
  store,
  fetch,
  loadPolicy,
  loadSecrets,
  now = Date.now,
}: ProxyDeps) {
  const running = new Map<string, Promise<ProxyResult>>();

  async function request({
    repositoryId,
    source,
  }: ProxyRequest): Promise<ProxyResult> {
    const policy = await loadPolicy(repositoryId);
    const resolved = resolveSecrets(
      { url: source.url, headers: source.headers, body: source.body },
      await loadSecrets(repositoryId),
    );
    if (!resolved.ok)
      return {
        ok: false,
        errors: resolved.issues.map((issue) => ({
          code: issue.code,
          message: issue.message,
          fix: issue.fix,
          path: issue.path,
        })),
      };
    // Header names are case-insensitive: lowercase them all so the defaults can be overridden and never doubled.
    const given = Object.entries(resolved.request.headers).map(
      ([name, value]) => [name.toLowerCase(), value] as const,
    );
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": "Orrery",
      ...Object.fromEntries(given),
    };
    if (source.body !== undefined)
      headers["content-type"] ??= "application/json";
    const { data } = await fetch(
      resolved.request.url,
      {
        method: source.method,
        headers,
        body:
          source.body === undefined ? undefined : JSON.stringify(source.body),
      },
      policy,
    );
    const fetchedAt = now();
    return {
      ok: true,
      state: "miss",
      data,
      fetchedAt: new Date(fetchedAt),
      expiresAt: new Date(fetchedAt + source.ttlSeconds * 1000),
    };
  }

  /** One request per key at a time. Never rejects. */
  function refresh(key: string, req: ProxyRequest): Promise<ProxyResult> {
    const joined = running.get(key);
    if (joined) return joined;
    const flight = request(req)
      .catch((error: unknown): ProxyResult => {
        const errors = toFailures(error);
        log("warn", "source request failed", {
          repositoryId: req.repositoryId,
          key,
          code: errors[0]?.code,
        });
        return { ok: false, errors };
      })
      .then(async (result) => {
        if (result.ok) {
          await store
            .put(key, req.repositoryId, {
              body: result.data,
              fetchedAt: result.fetchedAt,
              expiresAt: result.expiresAt,
            })
            .catch((error: unknown) => {
              log("warn", "could not write the source cache", {
                key,
                error: error instanceof Error ? error.message : "unknown error",
              });
            });
        }
        return result;
      })
      .finally(() => running.delete(key));
    running.set(key, flight);
    return flight;
  }

  return {
    async get(req: ProxyRequest): Promise<ProxyResult> {
      const key = cacheKey(req);
      const entry = await store.get(key).catch((error: unknown) => {
        log("warn", "could not read the source cache", {
          key,
          error: error instanceof Error ? error.message : "unknown error",
        });
        return null;
      });
      if (!entry) return refresh(key, req);
      if (now() - entry.lastAccessedAt.getTime() > TOUCH_INTERVAL_MS) {
        store.touch(key, new Date(now())).catch((error: unknown) =>
          log("warn", "could not touch the source cache", {
            key,
            error: error instanceof Error ? error.message : "unknown error",
          }),
        );
      }
      const fresh = now() < entry.expiresAt.getTime();
      if (!fresh) void refresh(key, req);
      return {
        ok: true,
        state: fresh ? "fresh" : "stale",
        data: entry.body,
        fetchedAt: entry.fetchedAt,
        expiresAt: entry.expiresAt,
      };
    },

    /** A dry run: asks the source now, through the same policy and secret binding, and neither reads nor writes the cache. Never rejects. */
    preview: (req: ProxyRequest): Promise<ProxyResult> =>
      request(req).catch((error: unknown): ProxyResult => ({
        ok: false,
        errors: toFailures(error),
      })),

    purge: () => purgeUnused(store, now),
  };
}
