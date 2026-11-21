import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for data at rest (GitHub App credentials, project secrets).
 * Format: `v1.<keyId>.<iv>.<ciphertext+tag>` (base64url). The key id is stored with the data so a rotation can find
 * what still uses an old key. Every value is bound to a `context` (its table, column or owner) through the GCM
 * additional data, so a ciphertext copied to another place fails to decrypt.
 * Errors carry a code only: never a key, a plaintext or a ciphertext.
 */

export type CryptoErrorCode = "crypto_no_key" | "crypto_bad_key" | "crypto_unknown_key" | "crypto_malformed" | "crypto_tampered";

const MESSAGES: Record<CryptoErrorCode, string> = {
  crypto_no_key: "ORRERY_ENCRYPTION_KEYS is not set",
  crypto_bad_key: "ORRERY_ENCRYPTION_KEYS must be a comma-separated list of `id:base64key` with 32-byte keys and unique ids",
  crypto_unknown_key: "The value was encrypted with a key that is not configured",
  crypto_malformed: "The encrypted value is not in a known format",
  crypto_tampered: "The encrypted value failed its integrity check",
};

export class CryptoError extends Error {
  constructor(readonly code: CryptoErrorCode) {
    super(Reflect.get(MESSAGES, code));
    this.name = "CryptoError";
  }
}

export type Keyring = { readonly activeId: string; readonly keys: ReadonlyMap<string, Buffer> };

const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const KEY_B64 = /^[A-Za-z0-9+/]{43}=$/; // exactly 32 bytes
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = "aes-256-gcm";

/** `id:base64key,oldid:base64key`: the first key encrypts, all of them decrypt. */
export function parseKeyring(value: string | undefined): Keyring {
  if (!value?.trim()) throw new CryptoError("crypto_no_key");
  const keys = new Map<string, Buffer>();
  for (const entry of value.split(",")) {
    const [id, b64, ...rest] = entry.trim().split(":");
    if (rest.length > 0 || !KEY_ID.test(id) || !KEY_B64.test(b64 ?? "") || keys.has(id)) throw new CryptoError("crypto_bad_key");
    keys.set(id, Buffer.from(b64, "base64"));
  }
  return { activeId: keys.keys().next().value as string, keys };
}

export const keyringFromEnv = (env: Record<string, string | undefined> = process.env): Keyring => parseKeyring(env.ORRERY_ENCRYPTION_KEYS);

export function encrypt(plaintext: string, keyring: Keyring, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyring.keys.get(keyring.activeId) as Buffer, iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return ["v1", keyring.activeId, iv.toString("base64url"), data.toString("base64url")].join(".");
}

function parse(ciphertext: string) {
  const [version, keyId, iv, data, ...rest] = ciphertext.split(".");
  if (version !== "v1" || rest.length > 0 || !data) throw new CryptoError("crypto_malformed");
  return { keyId, iv: Buffer.from(iv, "base64url"), data: Buffer.from(data, "base64url") };
}

/** Id of the key a value was encrypted with. */
export const keyIdOf = (ciphertext: string): string => parse(ciphertext).keyId;

export function decrypt(ciphertext: string, keyring: Keyring, context: string): string {
  const { keyId, iv, data } = parse(ciphertext);
  const key = keyring.keys.get(keyId);
  if (!key) throw new CryptoError("crypto_unknown_key");
  if (iv.length !== IV_BYTES || data.length < TAG_BYTES) throw new CryptoError("crypto_malformed");
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
    return Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    throw new CryptoError("crypto_tampered");
  }
}

/** Background rotation: true while a value still uses a key other than the active one. */
export const needsRotation = (ciphertext: string, keyring: Keyring): boolean => keyIdOf(ciphertext) !== keyring.activeId;

/** Re-encrypts a value with the active key (same context). */
export const reencrypt = (ciphertext: string, keyring: Keyring, context: string): string =>
  encrypt(decrypt(ciphertext, keyring, context), keyring, context);
