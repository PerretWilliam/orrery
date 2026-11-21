import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The setup token keeps a stranger from claiming a fresh instance. It lives in memory (or in ORRERY_SETUP_TOKEN),
 * is printed in the logs, and stops working once setup is complete. Everything derived from it (the setup session
 * cookie, the manifest `state`) is an HMAC keyed by the token, so nothing needs to be stored.
 */

export const MIN_TOKEN_LENGTH = 24;

export const generateSetupToken = (): string => randomBytes(32).toString("base64url");

export type ResolvedToken = { token: string; source: "env" | "generated"; warning?: string };

/** ORRERY_SETUP_TOKEN when it is long enough, otherwise a fresh random token. A weak value is never used. */
export function resolveSetupToken(env: Record<string, string | undefined>, generate = generateSetupToken): ResolvedToken {
  const configured = env.ORRERY_SETUP_TOKEN?.trim();
  if (configured && configured.length >= MIN_TOKEN_LENGTH) return { token: configured, source: "env" };
  const warning = configured ? `ORRERY_SETUP_TOKEN is shorter than ${MIN_TOKEN_LENGTH} characters and was ignored` : undefined;
  return { token: generate(), source: "generated", ...(warning ? { warning } : {}) };
}

const sha256 = (value: string): Buffer => createHash("sha256").update(value).digest();

/** Constant-time comparison (both sides hashed first, so lengths never leak). */
export const tokensMatch = (provided: unknown, expected: string): boolean =>
  typeof provided === "string" && timingSafeEqual(sha256(provided), sha256(expected));

const mac = (token: string, purpose: string, payload: string): string =>
  createHmac("sha256", token).update(`${purpose}.${payload}`).digest("base64url");

const SESSION_SHAPE = /^(\d{1,16})\.([\w-]+)\.([\w-]+)$/;

/** `expiresAtMs.nonce.mac`: proves the browser that sent the token, for a limited time. */
export function signSession(token: string, now: Date, ttlMs: number, nonce = randomBytes(16).toString("base64url")): string {
  const payload = `${now.getTime() + ttlMs}.${nonce}`;
  return `${payload}.${mac(token, "session", payload)}`;
}

export function verifySession(token: string, value: string | undefined, now: Date): boolean {
  const parts = SESSION_SHAPE.exec(String(value));
  if (!parts) return false;
  const [, expires, nonce, signature] = parts;
  const expected = mac(token, "session", `${expires}.${nonce}`);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) && Number(expires) > now.getTime();
}

/** `state` of the manifest flow, tied to the session cookie it was issued for. */
export const manifestState = (token: string, session: string): string => mac(token, "state", session);

export const stateMatches = (token: string, session: string, state: unknown): boolean =>
  tokensMatch(state, manifestState(token, session));
