import { randomBytes } from "node:crypto";
import { decrypt, encrypt, type Keyring } from "@/lib/crypto";
import { SETTINGS_CONTEXT } from "@/features/setup/server/service";
import type { AuthStore } from "./store";

/**
 * The secret Better Auth uses for cookies and for encrypting OAuth tokens. It is random, generated on first use and
 * stored encrypted with the instance keyring, so rotating the keyring re-encrypts it without logging anybody out.
 */
export async function loadAuthSecret(store: AuthStore, keyring: Keyring): Promise<string> {
  const stored = await store.authSecret();
  if (stored) return decrypt(stored, keyring, SETTINGS_CONTEXT.authSecret);

  const secret = randomBytes(32).toString("base64url");
  if (await store.setAuthSecretIfAbsent(encrypt(secret, keyring, SETTINGS_CONTEXT.authSecret))) return secret;

  // Another process stored its own first: use that one.
  const winner = await store.authSecret();
  if (!winner) throw new Error("The authentication secret cannot be stored: the first-run setup is not finished");
  return decrypt(winner, keyring, SETTINGS_CONTEXT.authSecret);
}
