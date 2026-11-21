// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "./signature";

const sign = (secret: string, body: string, algo = "sha256") => `${algo}=${createHmac(algo, secret).update(body).digest("hex")}`;
const body = new TextEncoder().encode('{"action":"added"}');
const text = '{"action":"added"}';

describe("verifySignature", () => {
  it("accepts GitHub's signature of the exact body", () => {
    expect(verifySignature("s3cret", body, sign("s3cret", text))).toBe(true);
  });
  it("rejects a body that was changed by one byte", () => {
    expect(verifySignature("s3cret", new TextEncoder().encode('{"action":"added" }'), sign("s3cret", text))).toBe(false);
  });
  it("rejects a signature made with another secret", () => {
    expect(verifySignature("s3cret", body, sign("other", text))).toBe(false);
  });
  it("rejects an empty secret even when the signature was made with it", () => {
    expect(verifySignature("", body, sign("", text))).toBe(false);
  });
  it.each([
    ["missing header", null],
    ["empty header", ""],
    ["no prefix", createHmac("sha256", "s3cret").update(text).digest("hex")],
    ["legacy sha1", sign("s3cret", text, "sha1")],
    ["uppercase prefix", sign("s3cret", text).replace("sha256", "SHA256")],
    ["uppercase hex", sign("s3cret", text).toUpperCase().replace("SHA256", "sha256")],
    ["too short", sign("s3cret", text).slice(0, -2)],
    ["too long", `${sign("s3cret", text)}00`],
    ["not hex", `sha256=${"z".repeat(64)}`],
    ["trailing newline", `${sign("s3cret", text)}\n`],
    ["leading space", ` ${sign("s3cret", text)}`],
  ])("rejects %s", (_name, header) => {
    expect(verifySignature("s3cret", body, header)).toBe(false);
  });
  it("signs bytes, not characters", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x41]);
    const header = `sha256=${createHmac("sha256", "k").update(bytes).digest("hex")}`;
    expect(verifySignature("k", bytes, header)).toBe(true);
  });
});
