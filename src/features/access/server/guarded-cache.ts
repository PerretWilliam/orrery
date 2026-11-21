import { log } from "@/lib/logger";

export const CACHE_TTL_MS = 5 * 60_000;
export const CACHE_TIMEOUT_MS = 5_000;

export type GuardedCacheOptions<V> = {
  /** What a failed lookup answers. Never cached. */
  deny: V;
  /** Words for the log line of a failed lookup. */
  what: string;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
};

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer from the Git host within ${ms} ms`)), ms);
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

/**
 * Answers about GitHub that are kept for 5 minutes and fail closed: an error, a timeout or a lookup that throws gives
 * `deny`, is logged, and is never cached, so the next request asks again. Concurrent requests for a key share one
 * lookup. In memory on purpose: V1 runs one replica, and the cache only grows with users x repositories (or teams).
 */
export function createGuardedCache<V>({ deny, what, now = Date.now, ttlMs = CACHE_TTL_MS, timeoutMs = CACHE_TIMEOUT_MS }: GuardedCacheOptions<V>) {
  const cache = new Map<string, { value: V; expiresAt: number }>();
  const running = new Map<string, Promise<V>>();
  // Bumped by every invalidation: an answer that was already in flight may predate the change and must not be stored.
  let generation = 0;

  return {
    /** `load` throws for anything it cannot trust. `context` goes to the log of a failure. */
    get(key: string, load: () => Promise<V>, context: Record<string, unknown>): Promise<V> {
      const hit = cache.get(key);
      if (hit && now() < hit.expiresAt) return Promise.resolve(hit.value);
      const joined = running.get(key);
      if (joined) return joined;
      const startedIn = generation;
      const flight = withTimeout((async () => load())(), timeoutMs)
        .then(
          (value) => {
            if (startedIn === generation) cache.set(key, { value, expiresAt: now() + ttlMs });
            return value;
          },
          (error: unknown) => {
            log("warn", `${what} failed, access denied`, { ...context, error: error instanceof Error ? error.message : "unknown error" });
            return deny;
          },
        )
        .finally(() => {
          if (running.get(key) === flight) running.delete(key);
        });
      running.set(key, flight);
      return flight;
    },

    /** Forgets the keys `matches` accepts (all of them without an argument), and every lookup still in flight. */
    invalidate(matches: (key: string) => boolean = () => true) {
      generation += 1;
      running.clear();
      for (const key of [...cache.keys()]) if (matches(key)) cache.delete(key);
    },
  };
}
