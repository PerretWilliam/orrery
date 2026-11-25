import { SourceError } from "./source-error";

export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
export const SOURCE_TIMEOUT_MS = 3000;

/** `application/json` and `application/<anything>+json`, with or without parameters such as `charset`. */
export function isJsonContentType(header: string | null): boolean {
  const type = (header ?? "").split(";", 1).join("").trim().toLowerCase();
  const subtype = type.startsWith("application/")
    ? type.slice("application/".length)
    : "";
  return (
    subtype === "json" ||
    (subtype.endsWith("+json") &&
      /^[a-z0-9.-]+$/.test(subtype.slice(0, -"+json".length)))
  );
}

export const discardBody = async (response: Response): Promise<void> => {
  await response.body?.cancel().catch(() => undefined);
};

/**
 * Reads a JSON body without ever holding more than `maxBytes`. A declared length over the limit is refused before
 * reading; otherwise the stream is cancelled (which closes the connection) as soon as the limit is crossed.
 */
export async function readJsonLimited(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) {
    await discardBody(response);
    throw new SourceError("source_too_large");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new SourceError("source_too_large");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw new SourceError("source_invalid_json");
  }
}
