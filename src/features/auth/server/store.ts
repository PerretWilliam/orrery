/** What sign-in and sessions need from the database. The Drizzle implementation is tested against Postgres. */

export type UserState = { login: string | null; suspendedAt: Date | null };
export type GithubAppCredentials = { clientId: string; clientSecretCiphertext: string };

export type AuthStore = {
  /** `login` is lowercased. */
  isAdmin(login: string): Promise<boolean>;
  userState(userId: string): Promise<UserState | null>;
  suspend(userId: string, at: Date): Promise<void>;
  resume(userId: string): Promise<void>;
  /** Better Auth's id of the user's GitHub account row. */
  githubAccountId(userId: string): Promise<string | null>;
  deleteSession(sessionId: string): Promise<void>;
  /** `null` until the first-run wizard has created the App. */
  githubApp(): Promise<GithubAppCredentials | null>;
  authSecret(): Promise<string | null>;
  /** Stores the ciphertext only if none is stored yet. `false` when another process won, or when setup is not done. */
  setAuthSecretIfAbsent(ciphertext: string): Promise<boolean>;
};
