/**
 * The path language of `.hub.yml` (`data.retention.d7`, `items[0].name`) and its extractor.
 * Pure data walking: no `eval`, no wildcards, no expressions, no prototype access.
 */

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const START = /^[A-Za-z_]/;
const KEY = /^[\w-]+$/;
const INDEX = /^\d{1,6}\]$/;
const MAX_LENGTH = 256;

/** Segments of a path (array indexes are their digits), or `null` when the path is not valid. */
export function parsePath(path: string): string[] | null {
  if (path.length > MAX_LENGTH || !START.test(path)) return null;
  const segments: string[] = [];
  for (const part of path.split(".")) {
    const [key, ...indexes] = part.split("[");
    if (!KEY.test(key) || UNSAFE_KEYS.has(key) || !indexes.every((index) => INDEX.test(index))) return null;
    segments.push(key, ...indexes.map((index) => index.slice(0, -1)));
  }
  return segments;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads `path` in `data`. Returns `undefined` when the path is invalid or leads nowhere.
 * Only own properties are read, so `toString`, `constructor` and the like are never reachable.
 */
export function extractPath(data: unknown, path: string): unknown {
  const segments = parsePath(path);
  if (!segments) return undefined;
  let current: unknown = data;
  for (const key of segments) {
    // The only own non-index property of an array is `length`.
    const container = Array.isArray(current) ? key !== "length" : isRecord(current);
    if (!container || !Object.hasOwn(current as object, key)) return undefined;
    current = Reflect.get(current as object, key);
  }
  return current;
}
