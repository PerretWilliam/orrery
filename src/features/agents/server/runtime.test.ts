// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const canSignIn = vi.fn(async () => false);
const isAdmin = vi.fn(async () => false);
const record = vi.fn();
const store = { find: vi.fn(), create: vi.fn(), list: vi.fn(async () => []), revoke: vi.fn(), touch: vi.fn() };
vi.mock("@/features/access/server/runtime", () => ({ getAccessPolicy: () => ({ canSignIn }) }));
vi.mock("@/features/audit/server/runtime", () => ({ getAudit: () => ({ record }) }));
vi.mock("@/features/auth/server/drizzle-store", () => ({ createAuthStore: () => ({ isAdmin }) }));
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db" }));
vi.mock("./drizzle-store", () => ({ createTokensStore: (db: unknown) => (db === "db" ? store : undefined) }));

import { getTokens } from "./runtime";

const token = `orr_${"a".repeat(43)}`;
const row = { id: "i", name: "n", createdAt: new Date(0), expiresAt: new Date(Date.now() + 1e9), lastUsedAt: new Date(), revokedAt: null, userId: "u", login: "Octo", suspendedAt: null };
afterEach(() => vi.clearAllMocks());

describe("getTokens", () => {
  it("is one service per process, letting in instance admins (lowercased) or whoever the policy lets sign in", async () => {
    const tokens = getTokens();
    expect(getTokens()).toBe(tokens);
    store.find.mockResolvedValue(row);
    expect(await tokens.authenticate(token)).toBeNull();
    expect(isAdmin).toHaveBeenCalledWith("octo");
    expect(canSignIn).toHaveBeenCalledWith("Octo");
    isAdmin.mockResolvedValueOnce(true);
    expect(await tokens.authenticate(token)).toEqual({ tokenId: "i", userId: "u", login: "Octo" });
    canSignIn.mockResolvedValueOnce(true);
    expect(await tokens.authenticate(token)).not.toBeNull();
  });
  it("audits through the audit log", async () => {
    store.find.mockResolvedValue({ ...row, lastUsedAt: null });
    isAdmin.mockResolvedValueOnce(true);
    await getTokens().authenticate(token);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ event: "token_used" }));
  });
});
