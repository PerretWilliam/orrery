import { describe, expect, it, vi } from "vitest";
import {
  MAX_RESPONSE_BYTES,
  SOURCE_TIMEOUT_MS,
  discardBody,
  isJsonContentType,
  readJsonLimited,
} from "./limits";
import { SourceError } from "./source-error";

const bytes = (text: string) => new TextEncoder().encode(text);
const streamOf = (...chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof SourceError ? error.code : "other";
  }
  return "none";
};

describe("limits", () => {
  it("allows 5 MB and 3 seconds", () => {
    expect(MAX_RESPONSE_BYTES).toBe(5 * 1024 * 1024);
    expect(SOURCE_TIMEOUT_MS).toBe(3000);
  });
});

describe("isJsonContentType", () => {
  it.each([
    "application/json",
    "Application/JSON",
    "application/json; charset=utf-8",
    "application/json;charset=UTF-8",
    "  application/json ; q=1",
    "application/vnd.github+json",
    "application/vnd.api+json; charset=utf-8",
    "application/ld+json",
    "application/problem+json",
  ])("accepts %j", (value) => {
    expect(isJsonContentType(value)).toBe(true);
  });
  it.each([
    null,
    "",
    "text/html",
    "text/plain",
    "text/json",
    "application/xml",
    "application/jsonp",
    "application/x-ndjson",
    "application/javascript",
    "application/octet-stream",
    "application/json5",
    "application/+json",
    "application/foo+json+bar",
    "application/json/extra",
    "xapplication/json",
    "application/jsonx",
    "multipart/form-data; boundary=application/json",
    "text/html; type=application/json",
    "json",
    "abcdefghijkljson",
    "application/a!b+json",
    "application/ab!+json",
    "application/a b+json",
    "text/json; application/json",
  ])("rejects %j", (value) => {
    expect(isJsonContentType(value)).toBe(false);
  });
});

describe("discardBody", () => {
  it("cancels the stream, and tolerates a missing body or a cancel that fails", async () => {
    const cancel = vi.fn();
    await discardBody(new Response(new ReadableStream({ cancel })));
    expect(cancel).toHaveBeenCalledTimes(1);
    await expect(discardBody(new Response(null))).resolves.toBeUndefined();
    const failing = new Response(
      new ReadableStream({ cancel: () => Promise.reject(new Error("boom")) }),
    );
    await expect(discardBody(failing)).resolves.toBeUndefined();
  });
});

describe("readJsonLimited", () => {
  it("parses a JSON document of any type, from one or several chunks", async () => {
    expect(
      await readJsonLimited(new Response('{"a":[1,2,{"b":null}]}')),
    ).toEqual({ a: [1, 2, { b: null }] });
    expect(await readJsonLimited(new Response("42"))).toBe(42);
    expect(await readJsonLimited(new Response("null"))).toBeNull();
    expect(
      await readJsonLimited(
        new Response(streamOf(bytes('{"a"'), bytes(":"), bytes('"é"}'))),
      ),
    ).toEqual({ a: "é" });
  });
  it("accepts a body of exactly the limit and refuses one byte more", async () => {
    const body = (size: number) => `"${"a".repeat(size - 2)}"`;
    expect(await readJsonLimited(new Response(body(100)), 100)).toHaveLength(
      98,
    );
    expect(await codeOf(readJsonLimited(new Response(body(101)), 100))).toBe(
      "source_too_large",
    );
  });
  it("counts bytes, not characters", async () => {
    expect(
      await codeOf(readJsonLimited(new Response(`"${"é".repeat(60)}"`), 100)),
    ).toBe("source_too_large");
  });
  it("counts across chunks and stops reading as soon as the limit is crossed", async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(40));
      },
      cancel,
    });
    expect(await codeOf(readJsonLimited(new Response(body), 100))).toBe(
      "source_too_large",
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pulls).toBeLessThan(10);
  });
  it("refuses a declared length over the limit without reading anything", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const response = new Response(body, {
      headers: { "content-length": "101" },
    });
    expect(await codeOf(readJsonLimited(response, 100))).toBe(
      "source_too_large",
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("accepts a declared length at the limit, and ignores a missing or unreadable one", async () => {
    expect(
      await readJsonLimited(
        new Response('"ok"', { headers: { "content-length": "4" } }),
        4,
      ),
    ).toBe("ok");
    expect(
      await readJsonLimited(
        new Response('"ok"', { headers: { "content-length": "nope" } }),
        4,
      ),
    ).toBe("ok");
    expect(await readJsonLimited(new Response('"ok"'), 4)).toBe("ok");
  });
  it("does not trust a lying declared length", async () => {
    const response = new Response("x".repeat(300), {
      headers: { "content-length": "3" },
    });
    expect(await codeOf(readJsonLimited(response, 100))).toBe(
      "source_too_large",
    );
  });
  it("defaults to 5 MB", async () => {
    const big = `"${"a".repeat(MAX_RESPONSE_BYTES)}"`;
    expect(await codeOf(readJsonLimited(new Response(big)))).toBe(
      "source_too_large",
    );
    expect(
      await readJsonLimited(
        new Response(`"${"a".repeat(MAX_RESPONSE_BYTES - 2)}"`),
      ),
    ).toHaveLength(MAX_RESPONSE_BYTES - 2);
  });
  it("tolerates a stream whose cancel fails once over the limit", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(200));
      },
      cancel: () => Promise.reject(new Error("boom")),
    });
    expect(await codeOf(readJsonLimited(new Response(body), 100))).toBe(
      "source_too_large",
    );
  });
  it.each([
    "",
    "   ",
    "{",
    "{'a':1}",
    "undefined",
    "<html>",
    '{"a":1}{"b":2}',
    "NaN",
  ])("refuses %j as invalid JSON", async (text) => {
    expect(await codeOf(readJsonLimited(new Response(text)))).toBe(
      "source_invalid_json",
    );
  });
  it("treats a missing body as an empty, hence invalid, document", async () => {
    expect(await codeOf(readJsonLimited(new Response(null)))).toBe(
      "source_invalid_json",
    );
  });
  it("refuses a body that is not valid UTF-8", async () => {
    expect(
      await codeOf(
        readJsonLimited(new Response(new Uint8Array([0x22, 0xff, 0xfe, 0x22]))),
      ),
    ).toBe("source_invalid_json");
  });
  it("skips a UTF-8 byte order mark", async () => {
    expect(
      await readJsonLimited(
        new Response(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('{"a":1}')])),
      ),
    ).toEqual({ a: 1 });
  });
  it("is safe with a __proto__ key (data stays data)", async () => {
    const value = (await readJsonLimited(
      new Response('{"__proto__":{"polluted":true}}'),
    )) as Record<string, unknown>;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
