// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, readCapped } from "./body";

const post = (body: BodyInit | null, headers: Record<string, string> = {}) => new Request("http://hub.test/", { method: "POST", body, headers });
const text = (bytes: Uint8Array | null) => (bytes === null ? null : Buffer.from(bytes).toString());
const streamOf = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });

describe("readCapped", () => {
  it("limits webhook payloads to 5 MB", () => {
    expect(MAX_BODY_BYTES).toBe(5_242_880);
  });
  it("returns the whole body, chunks joined in order", async () => {
    const request = new Request("http://hub.test/", { method: "POST", body: streamOf("ab", "cd", "ef"), duplex: "half" } as RequestInit);
    expect(text(await readCapped(request, 10))).toBe("abcdef");
  });
  it("accepts a body of exactly the limit and refuses one byte more", async () => {
    expect(text(await readCapped(post("abcde"), 5))).toBe("abcde");
    expect(await readCapped(post("abcdef"), 5)).toBeNull();
  });
  it("refuses on the declared length without reading the body", async () => {
    expect(await readCapped(post("a", { "content-length": "6" }), 5)).toBeNull();
    expect(text(await readCapped(post("a", { "content-length": "5" }), 5))).toBe("a");
  });
  it("refuses a streamed body that outgrows the limit whatever it declared", async () => {
    const request = new Request("http://hub.test/", { method: "POST", body: streamOf("abc", "def"), duplex: "half" } as RequestInit);
    expect(await readCapped(request, 5)).toBeNull();
  });
  it("treats a request without a body as empty", async () => {
    expect(text(await readCapped(post(null), 5))).toBe("");
  });
  it("ignores a content-length that is not a number", async () => {
    expect(text(await readCapped(post("ab", { "content-length": "many" }), 5))).toBe("ab");
  });
  it("uses the default limit when none is given", async () => {
    expect(text(await readCapped(post("ok")))).toBe("ok");
    expect(await readCapped(post("x", { "content-length": String(MAX_BODY_BYTES + 1) }))).toBeNull();
  });
});
