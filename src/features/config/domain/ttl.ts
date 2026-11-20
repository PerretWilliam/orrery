import { LIMITS } from "./limits";

/** A source TTL: a whole number followed by `s`, `m` or `h`, for example `60s`, `5m`, `1h`. */
export const TTL_PATTERN = /^([1-9]\d{0,5})([smh])$/;

const SECONDS = { s: 1, m: 60, h: 3600 } as const;

/** Seconds for a valid TTL within the allowed range, `null` otherwise. */
export function parseTtl(value: string): number | null {
  const match = TTL_PATTERN.exec(value);
  if (!match) return null;
  const seconds = Number(match[1]) * SECONDS[match[2] as keyof typeof SECONDS];
  return seconds >= LIMITS.ttlMinSeconds && seconds <= LIMITS.ttlMaxSeconds ? seconds : null;
}
