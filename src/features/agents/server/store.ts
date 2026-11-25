/** What is shown about a token: never the token, nor its hash. */
export type TokenSummary = { id: string; name: string; createdAt: Date; expiresAt: Date; lastUsedAt: Date | null; revokedAt: Date | null };

/** A token found by its hash, with the state of its owner. */
export type TokenOwner = TokenSummary & { userId: string; login: string | null; suspendedAt: Date | null };

/** What the tokens service needs from the database. The Drizzle implementation is tested against Postgres. */
export type TokensStore = {
  create(entry: { userId: string; name: string; tokenHash: string }, now: Date, expiresAt: Date): Promise<void>;
  /** Newest first, revoked ones included. */
  list(userId: string): Promise<TokenSummary[]>;
  /** The label of the token revoked, or `null` when it is not this user's or already revoked. */
  revoke(userId: string, id: string, now: Date): Promise<string | null>;
  find(tokenHash: string): Promise<TokenOwner | null>;
  touch(id: string, now: Date): Promise<void>;
};
