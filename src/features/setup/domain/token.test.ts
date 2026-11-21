import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSetupToken, manifestState, MIN_TOKEN_LENGTH, resolveSetupToken, signSession, stateMatches, tokensMatch, verifySession } from "./token";

const NOW = new Date("2026-01-01T00:00:00Z");
const TTL = 30 * 60 * 1000;
const TOKEN = "t".repeat(43);

describe("generateSetupToken", () => {
  it("returns 43 URL-safe characters (256 bits) and never repeats", () => {
    const a = generateSetupToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateSetupToken()).not.toBe(a);
  });
});

describe("resolveSetupToken", () => {
  const generate = () => "generated-token";
  it("generates a token when nothing is configured", () => {
    expect(resolveSetupToken({}, generate)).toEqual({ token: "generated-token", source: "generated" });
    expect(resolveSetupToken({ ORRERY_SETUP_TOKEN: "   " }, generate)).toEqual({ token: "generated-token", source: "generated" });
  });
  it("uses ORRERY_SETUP_TOKEN, trimmed", () => {
    const value = "x".repeat(MIN_TOKEN_LENGTH);
    expect(resolveSetupToken({ ORRERY_SETUP_TOKEN: ` ${value}\n` }, generate)).toEqual({ token: value, source: "env" });
  });
  it("ignores a weak ORRERY_SETUP_TOKEN, says so, and generates one instead", () => {
    const result = resolveSetupToken({ ORRERY_SETUP_TOKEN: "x".repeat(MIN_TOKEN_LENGTH - 1) }, generate);
    expect(result).toMatchObject({ token: "generated-token", source: "generated" });
    expect(result.warning).toContain(String(MIN_TOKEN_LENGTH));
    expect(JSON.stringify(result)).not.toContain("xxxx");
  });
  it("generates a real token by default", () => {
    expect(resolveSetupToken({}).token).toHaveLength(43);
  });
});

describe("tokensMatch", () => {
  it("accepts the exact token only", () => {
    expect(tokensMatch(TOKEN, TOKEN)).toBe(true);
    for (const bad of [TOKEN + "x", TOKEN.slice(1), TOKEN.toUpperCase(), ` ${TOKEN}`, "", "other"]) expect(tokensMatch(bad, TOKEN)).toBe(false);
  });
  it.each([undefined, null, 42, {}, [TOKEN], true])("refuses a non-string (%j)", (value) => expect(tokensMatch(value, TOKEN)).toBe(false));
});

describe("session cookie", () => {
  const cookie = () => signSession(TOKEN, NOW, TTL, "nonce");
  it("is valid until it expires", () => {
    expect(verifySession(TOKEN, cookie(), new Date(NOW.getTime() + TTL - 1))).toBe(true);
    expect(verifySession(TOKEN, cookie(), new Date(NOW.getTime() + TTL))).toBe(false);
    expect(verifySession(TOKEN, cookie(), new Date(NOW.getTime() + TTL + 1))).toBe(false);
  });
  it("has the shape expires.nonce.mac, with a random nonce by default", () => {
    const parts = signSession(TOKEN, NOW, TTL).split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(String(NOW.getTime() + TTL));
    expect(signSession(TOKEN, NOW, TTL)).not.toBe(signSession(TOKEN, NOW, TTL));
  });
  it("is refused under another token (a restart regenerates the token)", () => {
    expect(verifySession("u".repeat(43), cookie(), NOW)).toBe(false);
  });
  it("is refused when any part is changed", () => {
    const [expires, nonce, signature] = cookie().split(".");
    const later = String(Number(expires) + 1000);
    for (const forged of [`${later}.${nonce}.${signature}`, `${expires}.other.${signature}`, `${expires}.${nonce}.${signature.slice(1)}A`, `${expires}.${nonce}.${signature}x`]) {
      expect(verifySession(TOKEN, forged, NOW)).toBe(false);
    }
  });
  it.each([undefined, "", "a.b", "1.2.3.4", "abc.nonce.sig", ".nonce.sig", "1..sig", "1.nonce.", "12345678901234567.n.s", "-1.n.s", "1.n.s ", " 1.n.s", "1.n.s\n", "x1.n.s", "1.n!.s", "1.n.s!"])(
    "refuses a malformed cookie (%j)",
    (value) => expect(verifySession(TOKEN, value, NOW)).toBe(false),
  );
  it("never validates a cookie signed for another purpose", () => {
    const session = cookie();
    expect(verifySession(TOKEN, manifestState(TOKEN, session), NOW)).toBe(false);
  });
});

describe("how the signatures are built", () => {
  const hmac = (purpose: string, payload: string) => createHmac("sha256", TOKEN).update(`${purpose}.${payload}`).digest("base64url");
  it("signs the session as HMAC-SHA256 over `session.expires.nonce`, keyed by the token", () => {
    expect(signSession(TOKEN, NOW, TTL, "nonce")).toBe(`${NOW.getTime() + TTL}.nonce.${hmac("session", `${NOW.getTime() + TTL}.nonce`)}`);
  });
  it("derives the state as HMAC-SHA256 over `state.<session>`, keyed by the token", () => {
    const session = signSession(TOKEN, NOW, TTL, "nonce");
    expect(manifestState(TOKEN, session)).toBe(hmac("state", session));
  });
});

describe("manifest state", () => {
  const session = signSession(TOKEN, NOW, TTL, "n1");
  it("is stable for a session and differs between sessions and tokens", () => {
    expect(manifestState(TOKEN, session)).toBe(manifestState(TOKEN, session));
    expect(manifestState(TOKEN, session)).not.toBe(manifestState(TOKEN, signSession(TOKEN, NOW, TTL, "n2")));
    expect(manifestState("u".repeat(43), session)).not.toBe(manifestState(TOKEN, session));
  });
  it("matches only its own session", () => {
    const state = manifestState(TOKEN, session);
    expect(stateMatches(TOKEN, session, state)).toBe(true);
    expect(stateMatches(TOKEN, signSession(TOKEN, NOW, TTL, "n2"), state)).toBe(false);
    for (const bad of [undefined, null, "", "x", state + "x", 1]) expect(stateMatches(TOKEN, session, bad)).toBe(false);
  });
});
