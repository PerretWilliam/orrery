/** What the wizard needs from the database. The Drizzle implementation is tested against Postgres. */

export type CompletedSetup = {
  githubAppId: string;
  githubAppSlug: string;
  githubClientId: string;
  clientSecretCiphertext: string;
  privateKeyCiphertext: string;
  /** `null` when the App has no webhook: the endpoint then answers as if it did not exist. */
  webhookSecretCiphertext: string | null;
  encryptionKeyId: string;
  adminClaimHash: string;
  adminClaimExpiresAt: Date;
  completedAt: Date;
};

export type SetupStore = {
  isCompleted(): Promise<boolean>;
  /** Records the App and ends setup. `false` when setup was already completed (nothing is written). */
  complete(data: CompletedSetup): Promise<boolean>;
  /** Makes `login` an admin if `hash` is the live claim, and consumes the claim. One statement, so it works once. */
  consumeAdminClaim(hash: string, now: Date, login: string): Promise<boolean>;
};
