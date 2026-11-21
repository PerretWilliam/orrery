import { describe, expect, it } from "vitest";
import { CLAIM_TTL_MS, hashClaim, newAdminClaim } from "./admin-claim";

const NOW = new Date("2026-01-01T00:00:00Z");

describe("newAdminClaim", () => {
  it("stores the hash, never the secret, and expires in 24 hours", () => {
    const claim = newAdminClaim(NOW);
    expect(claim.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(claim.hash).toBe(hashClaim(claim.secret));
    expect(claim.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(claim.hash).not.toContain(claim.secret);
    expect(claim.expiresAt.getTime() - NOW.getTime()).toBe(CLAIM_TTL_MS);
    expect(CLAIM_TTL_MS).toBe(86_400_000);
  });
  it("is random every time, unless a secret is given", () => {
    expect(newAdminClaim(NOW).secret).not.toBe(newAdminClaim(NOW).secret);
    expect(newAdminClaim(NOW, "fixed").secret).toBe("fixed");
  });
});
