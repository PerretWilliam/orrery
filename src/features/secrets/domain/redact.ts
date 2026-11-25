/** Shorter values are left alone: replacing them would shred ordinary data, and real tokens are longer. */
export const MIN_REDACTED_LENGTH = 8;

/**
 * A source that echoes its request (a debug endpoint) would hand a secret to every viewer: the values that went out
 * are cut from what comes back, keys included, before it is cached or shown.
 * ponytail: matches the value as sent or percent-encoded; a source that transforms it (base64, split) is not caught.
 */
export function redactSecrets(data: unknown, values: readonly string[]): unknown {
  const needles = values
    .filter((value) => value.length >= MIN_REDACTED_LENGTH)
    .flatMap((value) => [value, encodeURIComponent(value)])
    .map((value) => JSON.stringify(value).slice(1, -1)); // as it reads inside serialized JSON
  if (needles.length === 0) return data;
  let text = JSON.stringify(data);
  for (const needle of needles) text = text.replaceAll(needle, "[redacted]");
  // A match that breaks the JSON (inside a number, say) throws: the answer is dropped rather than shown.
  return JSON.parse(text);
}
