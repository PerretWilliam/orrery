import { createHash, randomBytes } from "node:crypto";

/**
 * Who becomes admin. Setup ends when the GitHub App is created, so the token stops working at that point; the
 * browser that finished setup receives a secret claim cookie, and only its hash is stored. The first GitHub
 * sign-in that presents it is registered as admin (the database matches the hash and the expiry in one statement). Without the cookie nobody can claim:
 * ORRERY_ADMINS is the recovery path.
 */

export const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

export const hashClaim = (secret: string): string => createHash("sha256").update(secret).digest("hex");

export type AdminClaim = { secret: string; hash: string; expiresAt: Date };

export function newAdminClaim(now: Date, secret = randomBytes(32).toString("base64url")): AdminClaim {
  return { secret, hash: hashClaim(secret), expiresAt: new Date(now.getTime() + CLAIM_TTL_MS) };
}
