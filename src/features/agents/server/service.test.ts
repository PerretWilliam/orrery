// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { hashToken } from "../domain/tokens";
import { createTokens } from "./service";
import type { TokenOwner, TokensStore } from "./store";

const actor = { userId: "u1", login: "octo" };
const DAY = 86_400_000;
const NOW = new Date("2026-06-10T12:00:00Z");
const ID = "0b9f4c1e-5d2a-4e8b-9c3d-1a2b3c4d5e6f";

function setup(over: Partial<TokenOwner> = {}, { allowed = true as boolean | Error, now = NOW } = {}) {
  const row: TokenOwner = { id: ID, name: "Claude", createdAt: new Date(0), expiresAt: new Date(+NOW + DAY), lastUsedAt: null, revokedAt: null, userId: "u1", login: "octo", suspendedAt: null, ...over };
  const store: TokensStore = {
    create: vi.fn(async () => {}),
    list: vi.fn(async () => []),
    revoke: vi.fn(async () => "Claude"),
    find: vi.fn(async () => row),
    touch: vi.fn(async () => {}),
  };
  const canUse = vi.fn(async () => {
    if (allowed instanceof Error) throw allowed;
    return allowed;
  });
  const audit = vi.fn(async () => {});
  return { store, canUse, audit, tokens: createTokens({ store, canUse, now: () => now, audit }) };
}
const TOKEN = `orr_${"a".repeat(43)}`;

describe("creating a token", () => {
  it("returns the token once, stores only its hash and the expiry, and audits the label", async () => {
    const { tokens, store, audit } = setup();
    const result = await tokens.create(actor, { name: "Claude", days: "30" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.expiresAt).toEqual(new Date(+NOW + 30 * DAY));
    expect(store.create).toHaveBeenCalledWith({ userId: "u1", name: "Claude", tokenHash: hashToken(result.token) }, NOW, result.expiresAt);
    expect(JSON.stringify(vi.mocked(store.create).mock.calls)).not.toContain(result.token);
    expect(audit).toHaveBeenCalledWith({ event: "token_created", actor: "octo", detail: { name: "Claude", expires: result.expiresAt.toISOString() } });
    expect(JSON.stringify(audit.mock.calls)).not.toContain(result.token);
  });
  it("stores nothing for invalid input", async () => {
    const { tokens, store, audit } = setup();
    expect((await tokens.create(actor, { name: "", days: "" })).ok).toBe(false);
    expect(store.create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
  it("works without an audit log", async () => {
    const { store, canUse } = setup();
    const tokens = createTokens({ store, canUse, now: () => NOW });
    expect((await tokens.create(actor, { name: "x", days: "" })).ok).toBe(true);
    expect(await tokens.revoke(actor, ID)).toBe(true);
  });
});

describe("listing and revoking", () => {
  it("lists the tokens of the user", async () => {
    const { tokens, store } = setup();
    await tokens.list(actor);
    expect(store.list).toHaveBeenCalledWith("u1");
  });
  it("revokes one of the user's tokens and audits its label", async () => {
    const { tokens, store, audit } = setup();
    expect(await tokens.revoke(actor, ID)).toBe(true);
    expect(store.revoke).toHaveBeenCalledWith("u1", ID, NOW);
    expect(audit).toHaveBeenCalledWith({ event: "token_revoked", actor: "octo", detail: { name: "Claude" } });
  });
  it("says no, without auditing, when the token is not theirs or already revoked", async () => {
    const { tokens, store, audit } = setup();
    vi.mocked(store.revoke).mockResolvedValue(null);
    expect(await tokens.revoke(actor, ID)).toBe(false);
    expect(audit).not.toHaveBeenCalled();
  });
  it("never sends an id that is not an id to the database", async () => {
    const { tokens, store } = setup();
    expect(await tokens.revoke(actor, "nope")).toBe(false);
    expect(store.revoke).not.toHaveBeenCalled();
  });
});

describe("authenticating a token", () => {
  it("returns the owner and records the first use of the day", async () => {
    const { tokens, store, audit, canUse } = setup();
    expect(await tokens.authenticate(TOKEN)).toEqual({ tokenId: ID, userId: "u1", login: "octo" });
    expect(store.find).toHaveBeenCalledWith(hashToken(TOKEN));
    expect(canUse).toHaveBeenCalledWith("octo");
    expect(store.touch).toHaveBeenCalledWith(ID, NOW);
    expect(audit).toHaveBeenCalledWith({ event: "token_used", actor: "octo", detail: { name: "Claude" } });
  });
  it("records the first use of a new day, but not the next ones the same day", async () => {
    const earlier = setup({ lastUsedAt: new Date(+NOW - DAY) });
    await earlier.tokens.authenticate(TOKEN);
    expect(earlier.audit).toHaveBeenCalledTimes(1);
    const today = setup({ lastUsedAt: new Date(NOW.getTime() - 1000) });
    expect(await today.tokens.authenticate(TOKEN)).not.toBeNull();
    expect(today.store.touch).not.toHaveBeenCalled();
    expect(today.audit).not.toHaveBeenCalled();
  });
  it("works without an audit log", async () => {
    const { store, canUse } = setup();
    expect(await createTokens({ store, canUse, now: () => NOW }).authenticate(TOKEN)).not.toBeNull();
  });
  it("refuses what is not shaped like a token without asking the database", async () => {
    const { tokens, store } = setup();
    expect(await tokens.authenticate("Bearer nope")).toBeNull();
    expect(store.find).not.toHaveBeenCalled();
  });
  it.each([
    ["an unknown token", null],
    ["a revoked token", { revokedAt: new Date(1) }],
    ["an expired token", { expiresAt: NOW }],
    ["an owner who must sign in again", { suspendedAt: new Date(1) }],
    ["an owner without a login", { login: null }],
  ])("refuses %s, and records nothing", async (_name, over) => {
    const { tokens, store, audit, canUse } = setup(over ?? {});
    if (over === null) vi.mocked(store.find).mockResolvedValue(null);
    expect(await tokens.authenticate(TOKEN)).toBeNull();
    expect(canUse).not.toHaveBeenCalled();
    expect(store.touch).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
  it("refuses an owner the access policy no longer lets in, and fails closed when the check fails", async () => {
    for (const allowed of [false, new Error("GitHub is down")]) {
      const { tokens, store, audit } = setup({}, { allowed });
      expect(await tokens.authenticate(TOKEN)).toBeNull();
      expect(store.touch).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    }
  });
});
