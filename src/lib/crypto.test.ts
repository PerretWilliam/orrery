import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CryptoError, decrypt, encrypt, keyIdOf, keyringFromEnv, needsRotation, parseKeyring, reencrypt } from "./crypto";

const key = () => randomBytes(32).toString("base64");
const ring = (spec = `k1:${key()}`) => parseKeyring(spec);
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof CryptoError ? error.code : "other";
  }
  return "none";
};

describe("CryptoError", () => {
  it.each([
    ["crypto_no_key", "is not set"],
    ["crypto_bad_key", "32-byte keys"],
    ["crypto_unknown_key", "not configured"],
    ["crypto_malformed", "known format"],
    ["crypto_tampered", "integrity check"],
  ] as const)("%s has a readable message", (code, words) => {
    const error = new CryptoError(code);
    expect(error).toMatchObject({ code, name: "CryptoError" });
    expect(error.message).toContain(words);
  });
});

describe("parseKeyring", () => {
  it("reads one key and makes it the active one", () => {
    const k = ring();
    expect(k.activeId).toBe("k1");
    expect(k.keys.get("k1")).toHaveLength(32);
  });
  it("makes the first key active and keeps the others for decryption", () => {
    const k = ring(` new-2:${key()} , old_1:${key()}`);
    expect(k.activeId).toBe("new-2");
    expect([...k.keys.keys()]).toEqual(["new-2", "old_1"]);
  });
  it.each([undefined, "", "   "])("refuses a missing key (%j)", (value) => {
    expect(codeOf(() => parseKeyring(value))).toBe("crypto_no_key");
  });
  it.each([
    ["no separator", "justakey"],
    ["too short", `k1:${randomBytes(16).toString("base64")}`],
    ["too long", `k1:${randomBytes(33).toString("base64")}`],
    ["not base64", `k1:${"!".repeat(43)}=`],
    ["base64url alphabet", `k1:${"-".repeat(43)}=`],
    ["bad id", `K1:${key()}`],
    ["empty id", `:${key()}`],
    ["id too long", `${"a".repeat(33)}:${key()}`],
    ["extra part", `k1:${key()}:x`],
    ["junk before the key", `k1:A${key()}`],
    ["junk after the key", `k1:${key()}A`],
    ["empty entry", `k1:${key()},`],
  ])("refuses a bad key: %s", (_name, spec) => {
    expect(codeOf(() => parseKeyring(spec))).toBe("crypto_bad_key");
  });
  it("refuses the same id twice", () => {
    expect(codeOf(() => parseKeyring(`k1:${key()},k1:${key()}`))).toBe("crypto_bad_key");
  });
  it("accepts an id of 32 characters", () => {
    expect(ring(`${"a".repeat(32)}:${key()}`).activeId).toHaveLength(32);
  });
  it("never puts key material in its errors", () => {
    const secret = key();
    expect(() => parseKeyring(`K:${secret}`)).toThrow(expect.objectContaining({ message: expect.not.stringContaining(secret) }));
  });
  it("reads ORRERY_ENCRYPTION_KEYS from the environment", () => {
    expect(keyringFromEnv({ ORRERY_ENCRYPTION_KEYS: `k9:${key()}` }).activeId).toBe("k9");
    expect(codeOf(() => keyringFromEnv({}))).toBe("crypto_no_key");
  });
});

describe("encrypt and decrypt", () => {
  it("round-trips, including unicode and the empty string", () => {
    const k = ring();
    for (const text of ["", "ghp_abc123", "clé privée ✓ 🔑", "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"]) {
      expect(decrypt(encrypt(text, k, "ctx"), k, "ctx")).toBe(text);
    }
  });
  it("tags the value with the version and the key id, and never contains the plaintext", () => {
    const text = "super-secret-value";
    const out = encrypt(text, ring(), "ctx");
    expect(out.startsWith("v1.k1.")).toBe(true);
    expect(out.split(".")).toHaveLength(4);
    expect(out).not.toContain(text);
    expect(Buffer.from(out.split(".")[3], "base64url").includes(Buffer.from(text))).toBe(false);
  });
  it("uses a fresh 12-byte IV every time", () => {
    const k = ring();
    const a = encrypt("same", k, "ctx");
    const b = encrypt("same", k, "ctx");
    expect(a).not.toBe(b);
    expect(Buffer.from(a.split(".")[2], "base64url")).toHaveLength(12);
  });
  it("appends a 16-byte tag", () => {
    const out = encrypt("abcd", ring(), "ctx");
    expect(Buffer.from(out.split(".")[3], "base64url")).toHaveLength(4 + 16);
  });
  it("detects any change to the data, the tag or the IV", () => {
    const k = ring();
    const [v, id, iv, data] = encrypt("hello world", k, "ctx").split(".");
    const flip = (b64: string, at: number) => {
      const bytes = Buffer.from(b64, "base64url");
      bytes.writeUInt8(bytes.readUInt8(at) ^ 1, at);
      return bytes.toString("base64url");
    };
    const length = Buffer.from(data, "base64url").length;
    for (const bad of [
      [v, id, iv, flip(data, 0)],
      [v, id, iv, flip(data, length - 1)],
      [v, id, flip(iv, 0), data],
    ]) {
      expect(codeOf(() => decrypt(bad.join("."), k, "ctx"))).toBe("crypto_tampered");
    }
  });
  it("refuses a value copied to another context", () => {
    const k = ring();
    expect(codeOf(() => decrypt(encrypt("v", k, "table.a"), k, "table.b"))).toBe("crypto_tampered");
  });
  it("refuses a value under the wrong key", () => {
    expect(codeOf(() => decrypt(encrypt("v", ring(), "c"), ring(), "c"))).toBe("crypto_tampered");
  });
  it("refuses a key id that is not configured", () => {
    expect(codeOf(() => decrypt(encrypt("v", ring(), "c"), ring(`other:${key()}`), "c"))).toBe("crypto_unknown_key");
  });
  it.each([
    ["empty", ""],
    ["no dots", "garbage"],
    ["wrong version", "v2.k1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
    ["missing data", "v1.k1.AAAAAAAAAAAAAAAA"],
    ["empty data", "v1.k1.AAAAAAAAAAAAAAAA."],
    ["extra part", "v1.k1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.x"],
  ])("refuses a malformed value: %s", (_name, value) => {
    const k = ring();
    expect(codeOf(() => decrypt(value, k, "c"))).toBe("crypto_malformed");
  });
  it("refuses a short IV or data shorter than the tag", () => {
    const k = ring();
    expect(codeOf(() => decrypt("v1.k1.AAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", k, "c"))).toBe("crypto_malformed");
    expect(codeOf(() => decrypt(`v1.k1.${"A".repeat(16)}.AAAA`, k, "c"))).toBe("crypto_malformed");
  });
  it("decrypts with a key at the 16-byte tag boundary (empty plaintext)", () => {
    const k = ring();
    expect(decrypt(encrypt("", k, "c"), k, "c")).toBe("");
  });
});

describe("rotation", () => {
  it("finds values on an old key and re-encrypts them with the active one", () => {
    const oldKey = key();
    const before = encrypt("token", ring(`old:${oldKey}`), "ctx");
    const rotated = ring(`new:${key()},old:${oldKey}`);
    expect(keyIdOf(before)).toBe("old");
    expect(needsRotation(before, rotated)).toBe(true);
    const after = reencrypt(before, rotated, "ctx");
    expect(keyIdOf(after)).toBe("new");
    expect(needsRotation(after, rotated)).toBe(false);
    expect(decrypt(after, rotated, "ctx")).toBe("token");
  });
  it("cannot re-encrypt once the old key has been removed", () => {
    const before = encrypt("token", ring(`old:${key()}`), "ctx");
    expect(codeOf(() => reencrypt(before, ring(`new:${key()}`), "ctx"))).toBe("crypto_unknown_key");
  });
});
