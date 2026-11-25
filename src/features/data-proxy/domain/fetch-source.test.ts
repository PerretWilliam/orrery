import { describe, expect, it, vi } from "vitest";
import { type Resolver, type Send, SsrfError } from "@/lib/ssrf-guard";
import { fetchSource } from "./fetch-source";
import { MAX_RESPONSE_BYTES } from "./limits";
import { SourceError } from "./source-error";

const PUBLIC = "93.184.216.34";
const resolve: Resolver = async (host) => {
  if (host === "api.example.com") return [PUBLIC];
  throw new Error("ENOTFOUND");
};
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
const sendOf = (...responses: Response[]) => {
  const queue = [...responses];
  return vi.fn<Send>(async () => queue.shift() ?? json(null));
};
const URL_OK = "https://api.example.com/data";
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof SourceError || error instanceof SsrfError
      ? error.code
      : `other:${String(error)}`;
  }
  return "none";
};
/** A response that never delivers its body, and an error once the request is aborted. */
const hangingBody = (signal: AbortSignal | undefined) =>
  new Response(
    new ReadableStream({
      start(controller) {
        signal?.addEventListener("abort", () =>
          controller.error(new Error("aborted")),
        );
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("fetchSource", () => {
  it("returns the parsed JSON and the final URL", async () => {
    const send = sendOf(json({ ok: [1, 2] }));
    const result = await fetchSource(URL_OK, {}, {}, { resolve, send });
    expect(result.data).toEqual({ ok: [1, 2] });
    expect(result.url.href).toBe(URL_OK);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ address: PUBLIC, method: "GET" }),
    );
  });
  it("forwards the method, the headers and the static body", async () => {
    const send = sendOf(json({}));
    await fetchSource(
      URL_OK,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"q":1}',
      },
      {},
      { resolve, send },
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        body: '{"q":1}',
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  it("accepts a JSON content type with parameters or a +json type", async () => {
    for (const type of [
      "application/json; charset=utf-8",
      "application/vnd.github+json",
    ]) {
      const result = await fetchSource(
        URL_OK,
        {},
        {},
        {
          resolve,
          send: sendOf(json(1, { headers: { "content-type": type } })),
        },
      );
      expect(result.data).toBe(1);
    }
  });

  describe("wrong answers", () => {
    it.each([
      [301, "source_bad_status"],
      [400, "source_bad_status"],
      [404, "source_bad_status"],
      [500, "source_bad_status"],
      [503, "source_bad_status"],
    ])("refuses a %i answer", async (status, code) => {
      const cancel = vi.fn();
      const response = new Response(new ReadableStream({ cancel }), {
        status,
        headers: { "content-type": "application/json" },
      });
      expect(
        await codeOf(
          fetchSource(URL_OK, {}, {}, { resolve, send: sendOf(response) }),
        ),
      ).toBe(code);
      expect(cancel).toHaveBeenCalled();
    });
    it.each([
      "text/html",
      "text/plain",
      "application/xml",
      "application/octet-stream",
      "image/png",
      "",
    ])("refuses the content type %j", async (type) => {
      const cancel = vi.fn();
      const headers = type ? { "content-type": type } : undefined;
      const response = new Response(new ReadableStream({ cancel }), {
        status: 200,
        headers,
      });
      expect(
        await codeOf(
          fetchSource(URL_OK, {}, {}, { resolve, send: sendOf(response) }),
        ),
      ).toBe("source_content_type");
      expect(cancel).toHaveBeenCalled();
    });
    it("refuses a JSON body that is not JSON", async () => {
      const response = new Response("<html>", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      expect(
        await codeOf(
          fetchSource(URL_OK, {}, {}, { resolve, send: sendOf(response) }),
        ),
      ).toBe("source_invalid_json");
    });
  });

  describe("size", () => {
    it("refuses a body over 5 MB, announced or not", async () => {
      const big = `"${"a".repeat(MAX_RESPONSE_BYTES)}"`;
      expect(
        await codeOf(
          fetchSource(
            URL_OK,
            {},
            {},
            {
              resolve,
              send: sendOf(
                new Response(big, {
                  status: 200,
                  headers: { "content-type": "application/json" },
                }),
              ),
            },
          ),
        ),
      ).toBe("source_too_large");
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array(1024 * 1024));
        },
      });
      const unannounced = new Response(stream, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      expect(
        await codeOf(
          fetchSource(URL_OK, {}, {}, { resolve, send: sendOf(unannounced) }),
        ),
      ).toBe("source_too_large");
    });
    it("honors a lower limit", async () => {
      const response = json({ a: "x".repeat(100) });
      expect(
        await codeOf(
          fetchSource(
            URL_OK,
            {},
            {},
            { resolve, send: sendOf(response), maxBytes: 50 },
          ),
        ),
      ).toBe("source_too_large");
    });
  });

  describe("time", () => {
    it("gives up when the server never answers", async () => {
      const send = vi.fn<Send>(
        ({ signal }) =>
          new Promise((_, reject) =>
            signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            ),
          ),
      );
      expect(
        await codeOf(
          fetchSource(URL_OK, {}, {}, { resolve, send, timeoutMs: 30 }),
        ),
      ).toBe("source_timeout");
    });
    it("gives up when DNS never answers, whatever the resolver does", async () => {
      const never: Resolver = () => new Promise(() => undefined);
      expect(
        await codeOf(
          fetchSource(
            URL_OK,
            {},
            {},
            { resolve: never, send: sendOf(json(1)), timeoutMs: 30 },
          ),
        ),
      ).toBe("source_timeout");
    });
    it("gives up when the transport ignores the signal and never answers", async () => {
      const send = vi.fn<Send>(() => new Promise(() => undefined));
      expect(
        await codeOf(
          fetchSource(URL_OK, {}, {}, { resolve, send, timeoutMs: 30 }),
        ),
      ).toBe("source_timeout");
    });
    it("gives up when the body never ends", async () => {
      const send = vi.fn<Send>(async ({ signal }) => hangingBody(signal));
      expect(
        await codeOf(
          fetchSource(URL_OK, {}, {}, { resolve, send, timeoutMs: 30 }),
        ),
      ).toBe("source_timeout");
    });
    it("gives up when DNS is slower than the deadline", async () => {
      const slow: Resolver = (host) =>
        new Promise((done) => setTimeout(() => done(resolve(host)), 100));
      expect(
        await codeOf(
          fetchSource(
            URL_OK,
            {},
            {},
            { resolve: slow, send: sendOf(json(1)), timeoutMs: 20 },
          ),
        ),
      ).toBe("source_timeout");
    });
    it("shares one deadline across redirects", async () => {
      let calls = 0;
      const send = vi.fn<Send>(async ({ signal }) => {
        calls++;
        if (calls === 1) {
          await new Promise((done) => setTimeout(done, 40));
          return new Response(null, {
            status: 302,
            headers: { location: "https://api.example.com/next" },
          });
        }
        return hangingBody(signal);
      });
      expect(
        await codeOf(
          fetchSource(URL_OK, {}, {}, { resolve, send, timeoutMs: 80 }),
        ),
      ).toBe("source_timeout");
      expect(calls).toBe(2);
    });
    it("defaults to 3 seconds: a fast answer is not cut", async () => {
      expect(
        (
          await fetchSource(
            URL_OK,
            {},
            {},
            { resolve, send: sendOf(json("fast")) },
          )
        ).data,
      ).toBe("fast");
    });
    it("applies the default deadline of 3 seconds", async () => {
      vi.useFakeTimers();
      try {
        const send = vi.fn<Send>(async ({ signal }) => hangingBody(signal));
        const pending = codeOf(fetchSource(URL_OK, {}, {}, { resolve, send }));
        await vi.advanceTimersByTimeAsync(2999);
        let settled = false;
        void pending.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await pending).toBe("source_timeout");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("guard and transport failures", () => {
    it("passes the SSRF refusals through, without sending anything", async () => {
      const send = sendOf(json(1));
      expect(
        await codeOf(
          fetchSource("http://127.0.0.1/", {}, {}, { resolve, send }),
        ),
      ).toBe("ssrf_address_blocked");
      expect(
        await codeOf(
          fetchSource("ftp://api.example.com/", {}, {}, { resolve, send }),
        ),
      ).toBe("ssrf_scheme_blocked");
      expect(send).not.toHaveBeenCalled();
    });
    it("refuses a redirect to an internal address", async () => {
      const send = sendOf(
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/" },
        }),
      );
      expect(await codeOf(fetchSource(URL_OK, {}, {}, { resolve, send }))).toBe(
        "ssrf_address_blocked",
      );
      expect(send).toHaveBeenCalledTimes(1);
    });
    it("honors the policy", async () => {
      expect(
        await codeOf(
          fetchSource(
            URL_OK,
            {},
            { projectAllow: ["other.com"] },
            { resolve, send: sendOf(json(1)) },
          ),
        ),
      ).toBe("ssrf_host_not_allowed");
    });
    it("reports any other failure as unreachable, without its details", async () => {
      const send = vi.fn<Send>(async () => {
        throw new Error("ECONNREFUSED 10.0.0.9:5432 secret-token");
      });
      const error = await fetchSource(URL_OK, {}, {}, { resolve, send }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(SourceError);
      expect(error).toMatchObject({ code: "source_unreachable" });
      expect(String((error as Error).message)).not.toContain("secret-token");
    });
  });
});
