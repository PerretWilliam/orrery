import { request as httpRequest } from "node:http";
import { type RequestOptions, request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { type Send, pinnedLookup } from "@/lib/ssrf-guard";

const NO_BODY_STATUSES = new Set([101, 204, 205, 304]);

/**
 * The real `Send` for the SSRF guard: one request to the validated address, over http or https, with the name
 * kept for the Host header, the SNI and the certificate check. `lookup` is pinned, so nothing is resolved again;
 * `agent: false` means no pooled socket that could have been opened for another address. No `Accept-Encoding` is sent
 * and nothing is decompressed, so a compression bomb cannot expand. Redirects are returned, never followed.
 * `tls` carries extra TLS options (tests use it to trust a throwaway certificate).
 */
export const createNodeSend =
  (tls: RequestOptions = {}): Send =>
  ({ url, address, family, method, headers, body, signal }) =>
    new Promise((resolve, reject) => {
      const secure = url.protocol === "https:";
      const options: RequestOptions = {
        method,
        headers,
        signal,
        agent: false,
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port, // empty means the default port of the scheme
        path: `${url.pathname}${url.search}`,
        lookup: pinnedLookup(address, family) as RequestOptions["lookup"],
        ...(secure ? tls : {}),
      };
      const req = (secure ? httpsRequest : httpRequest)(options, (res) => {
        const responseHeaders = new Headers();
        for (const [name, values] of Object.entries(res.headersDistinct))
          for (const value of values as string[])
            responseHeaders.append(name, value);
        const status = res.statusCode as number;
        resolve(
          new Response(
            NO_BODY_STATUSES.has(status)
              ? null
              : (Readable.toWeb(res) as ReadableStream),
            { status, headers: responseHeaders },
          ),
        );
        if (NO_BODY_STATUSES.has(status)) res.resume();
      });
      req.on("error", reject);
      req.end(body);
    });
