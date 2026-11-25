import type { AuditEvent } from "@/features/audit/domain/events";
import { hashToken, isTokenId, looksLikeToken, newToken, validateTokenInput, type TokenIssue } from "../domain/tokens";
import type { TokenSummary, TokensStore } from "./store";

export type TokensDeps = {
  store: TokensStore;
  /** May this GitHub login use the hub at all (admin, or let in by the access policy)? Fails closed. */
  canUse: (login: string) => Promise<boolean>;
  now: () => Date;
  audit?: (event: AuditEvent) => Promise<void>;
};

export type Actor = { userId: string; login: string };
export type CreateResult = { ok: true; token: string; expiresAt: Date } | { ok: false; issues: TokenIssue[] };

const DAY = 86_400_000;
const sameDay = (a: Date, b: Date) => Math.floor(+a / DAY) === Math.floor(+b / DAY);

/**
 * Agent tokens act as their owner and never for more: `authenticate` re-checks the owner on every call, so a token
 * stops working when its owner loses access, is excluded by the policy, or has to sign in again. Everything it
 * refuses looks the same (`null`).
 */
export function createTokens({ store, canUse, now, audit }: TokensDeps) {
  return {
    list: (actor: Actor): Promise<TokenSummary[]> => store.list(actor.userId),

    /** The token is returned here and nowhere else: only its hash is kept. */
    async create(actor: Actor, input: { name: string; days: string }): Promise<CreateResult> {
      const checked = validateTokenInput(input);
      if (!checked.ok) return checked;
      const token = newToken();
      const at = now();
      const expiresAt = new Date(+at + checked.days * DAY);
      await store.create({ userId: actor.userId, name: checked.name, tokenHash: hashToken(token) }, at, expiresAt);
      await audit?.({ event: "token_created", actor: actor.login, detail: { name: checked.name, expires: expiresAt.toISOString() } });
      return { ok: true, token, expiresAt };
    },

    /** `false` when the token is not this user's, or was already revoked. */
    async revoke(actor: Actor, id: string): Promise<boolean> {
      const name = isTokenId(id) ? await store.revoke(actor.userId, id, now()) : null;
      if (name === null) return false;
      await audit?.({ event: "token_revoked", actor: actor.login, detail: { name } });
      return true;
    },

    /** The owner behind a token, or `null`: unknown, revoked, expired, suspended or no longer allowed. */
    async authenticate(token: string): Promise<{ tokenId: string; userId: string; login: string } | null> {
      if (!looksLikeToken(token)) return null;
      const found = await store.find(hashToken(token));
      const at = now();
      if (!found?.login || found.revokedAt || found.suspendedAt || found.expiresAt <= at) return null;
      if (!(await canUse(found.login).catch(() => false))) return null;
      // "Last used" and the audit entry are written on the first use of each day, not on every request.
      if (!found.lastUsedAt || !sameDay(found.lastUsedAt, at)) {
        await store.touch(found.id, at);
        await audit?.({ event: "token_used", actor: found.login, detail: { name: found.name } });
      }
      return { tokenId: found.id, userId: found.userId, login: found.login };
    },
  };
}
export type Tokens = ReturnType<typeof createTokens>;
