/** Requests per minute per token. ponytail: fixed 600 and in memory (one replica); admin setting and Redis when asked for. */
export const DEFAULT_LIMIT = 600;
const WINDOW_MS = 60_000;

/** Fixed one-minute window per key. `retryAfter` is in seconds, 0 when the request may go through. */
export function createRateLimiter({ limit = DEFAULT_LIMIT, now = Date.now }: { limit?: number; now?: () => number } = {}) {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    take(key: string): { ok: true } | { ok: false; retryAfter: number } {
      const at = now();
      const current = windows.get(key);
      const w = current && at - current.start < WINDOW_MS ? current : { start: at, count: 0 };
      windows.set(key, w);
      if (w.count >= limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((w.start + WINDOW_MS - at) / 1000)) };
      w.count += 1;
      return { ok: true };
    },
  };
}
export type RateLimiter = ReturnType<typeof createRateLimiter>;
