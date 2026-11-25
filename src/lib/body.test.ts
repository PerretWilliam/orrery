// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, MAX_FORM_BYTES, readCapped, readForm } from "./body";

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

describe("readForm", () => {
  const form = (body: string, type = "application/x-www-form-urlencoded") => post(body, { "content-type": type });
  it("allows forms of up to 256 KB", () => {
    expect(MAX_FORM_BYTES).toBe(262_144);
  });
  it("reads urlencoded and multipart forms", async () => {
    expect((await readForm(form("name=A&value=b+c")))?.get("value")).toBe("b c");
    const data = new FormData();
    data.set("name", "A");
    expect((await readForm(new Request("http://hub.test/", { method: "POST", body: data })))?.get("name")).toBe("A");
  });
  it("accepts a form of exactly the limit and refuses one byte more, declared or streamed", async () => {
    const full = `a=${"x".repeat(MAX_FORM_BYTES - 2)}`;
    expect(await readForm(form(full))).not.toBeNull();
    expect(await readForm(form(`${full}x`))).toBeNull();
    const streamed = new Request("http://hub.test/", { method: "POST", body: streamOf(full, "x"), headers: { "content-type": "application/x-www-form-urlencoded" }, duplex: "half" } as RequestInit);
    expect(await readForm(streamed)).toBeNull();
  });
  it("is null for what is not a form, with or without a content type", async () => {
    expect(await readForm(form("{}", "application/json"))).toBeNull();
    expect(await readForm(post(null))).toBeNull();
  });
});
