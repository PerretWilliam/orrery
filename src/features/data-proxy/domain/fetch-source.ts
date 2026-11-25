import {
  type FetchInit,
  type Resolver,
  type Send,
  type SsrfPolicy,
  SsrfError,
  guardedFetch,
} from "@/lib/ssrf-guard";
import {
  MAX_RESPONSE_BYTES,
  SOURCE_TIMEOUT_MS,
  discardBody,
  isJsonContentType,
  readJsonLimited,
} from "./limits";
import { SourceError } from "./source-error";

export type SourceDeps = {
  resolve: Resolver;
  send: Send;
  timeoutMs?: number;
  maxBytes?: number;
};

/**
 * Fetches a source through the SSRF guard and returns its parsed JSON. One 3-second deadline covers DNS, redirects,
 * headers and the whole body, so a slow server cannot hold a connection open. The answer must be a 2xx with a JSON
 * content type and at most 5 MB. Throws `SourceError` (or `SsrfError` when the guard refuses the URL).
 */
export async function fetchSource(
  raw: string,
  init: Omit<FetchInit, "signal">,
  policy: SsrfPolicy,
  deps: SourceDeps,
): Promise<{ data: unknown; url: URL }> {
  const deadline = AbortSignal.timeout(deps.timeoutMs ?? SOURCE_TIMEOUT_MS);
  // DNS and the guard cannot be aborted, so the deadline is also raced against the whole job.
  const expired = new Promise<never>((_, reject) =>
    deadline.addEventListener(
      "abort",
      () => reject(new SourceError("source_timeout")),
      { once: true },
    ),
  );
  expired.catch(() => undefined);
  const job = async () => {
    const { response, url } = await guardedFetch(
      raw,
      { ...init, signal: deadline },
      policy,
      deps,
    );
    if (!response.ok) {
      await discardBody(response);
      throw new SourceError("source_bad_status");
    }
    if (!isJsonContentType(response.headers.get("content-type"))) {
      await discardBody(response);
      throw new SourceError("source_content_type");
    }
    return {
      data: await readJsonLimited(
        response,
        deps.maxBytes ?? MAX_RESPONSE_BYTES,
      ),
      url,
    };
  };
  try {
    return await Promise.race([job(), expired]);
  } catch (error) {
    if (error instanceof SourceError || error instanceof SsrfError) throw error;
    throw new SourceError("source_unreachable");
  }
}
