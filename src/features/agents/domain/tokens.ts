import { createHash, randomBytes } from "node:crypto";

/** Agent tokens: `orr_` plus 256 random bits. Shown once, stored as a SHA-256 hash, always with an expiry. */
export const TOKEN_PREFIX = "orr_";
export const DEFAULT_DAYS = 90;
export const MAX_DAYS = 365;
export const MAX_NAME = 64;
export const TOKENS_PATH = "/account/tokens";
export const NEW_TOKEN_COOKIE = "orrery_new_token";

/** Same shape as the other error catalogs: stable code, JSON path, message, fix. Codes are never renamed or reused. */
export const TOKEN_ERRORS = {
  token_invalid_name: { fix: `Give the token a label of 1 to ${MAX_NAME} characters, such as the name of the agent that will use it.` },
  token_invalid_expiry: { fix: `Give a whole number of days from 1 to ${MAX_DAYS}, or leave it empty for ${DEFAULT_DAYS}.` },
} as const;
export type TokenIssueCode = keyof typeof TOKEN_ERRORS;
export type TokenIssue = { code: TokenIssueCode; path: string; message: string; fix: string };
const issue = (code: TokenIssueCode, path: string, message: string): TokenIssue => ({ code, path, message, fix: Reflect.get(TOKEN_ERRORS, code).fix });

export const newToken = (): string => TOKEN_PREFIX + randomBytes(32).toString("base64url");
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
/** Cheap shape check, so a wrong string never reaches the database. */
export const looksLikeToken = (value: string): boolean => /^orr_[A-Za-z0-9_-]{43}$/.test(value);

/** A token id as the database makes them; anything else never reaches a query. */
export const isTokenId = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function validateTokenInput(input: { name: string; days: string }): { ok: true; name: string; days: number } | { ok: false; issues: TokenIssue[] } {
  const name = input.name.trim();
  const days = input.days.trim() === "" ? DEFAULT_DAYS : /^\d{1,4}$/.test(input.days.trim()) ? Number(input.days.trim()) : 0;
  const issues: TokenIssue[] = [];
  if (name === "" || name.length > MAX_NAME || /[\x00-\x1f\x7f]/.test(name)) issues.push(issue("token_invalid_name", "name", "The label is empty, too long or has control characters"));
  if (days < 1 || days > MAX_DAYS) issues.push(issue("token_invalid_expiry", "days", "The lifetime must be between 1 and 365 days"));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, name, days };
}
