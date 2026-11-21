/** What the webhook endpoint needs from the database. The Drizzle implementation is tested against Postgres. */
export type WebhookStore = {
  /** Ciphertext of the App's webhook secret; `null` until the first-run wizard has finished. */
  secretCiphertext(): Promise<string | null>;
  /** Records the delivery id. `false` when it was already there (a replay). Ids older than a week are forgotten. */
  claimDelivery(deliveryId: string, event: string, now: Date): Promise<boolean>;
};
