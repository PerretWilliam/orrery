import { createHmac, generateKeyPairSync, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { encrypt, parseKeyring } from "@/lib/crypto";
import { instanceSettings, session, user } from "@/lib/db/schema";
import { SETTINGS_CONTEXT } from "@/features/setup/server/service";

import { ENCRYPTION_KEYS, INSTANCE_URL, SETUP_TOKEN } from "./constants";

export { INSTANCE_URL, SETUP_TOKEN };
const WEBHOOK_SECRET = "e2e-webhook-secret";

const databaseUrl = () => {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set");
  return url;
};

/** Empties every table of the schema the server migrated, so each run starts as a brand new instance. */
export async function resetInstance(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl() });
  try {
    const { rows } = await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
    if (rows.length > 0) await pool.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
  } finally {
    await pool.end();
  }
}

/**
 * What the first-run wizard and two GitHub sign-ins leave behind, written straight to the database: GitHub itself
 * cannot be driven from a test. Returns the signed session cookie of each user, as the browser would hold it.
 */
export async function finishSetup(logins: string[]): Promise<Map<string, string>> {
  const pool = new Pool({ connectionString: databaseUrl() });
  const db = drizzle(pool);
  try {
    const keyring = parseKeyring(ENCRYPTION_KEYS);
    const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const authSecret = randomBytes(32).toString("base64url");
    await db.insert(instanceSettings).values({
      id: 1,
      setupCompletedAt: new Date(),
      githubAppId: "1",
      githubAppSlug: "orrery-e2e",
      githubClientId: "Iv1.e2e",
      clientSecretCiphertext: encrypt("e2e-client-secret", keyring, SETTINGS_CONTEXT.clientSecret),
      privateKeyCiphertext: encrypt(privateKey, keyring, SETTINGS_CONTEXT.privateKey),
      webhookSecretCiphertext: encrypt(WEBHOOK_SECRET, keyring, SETTINGS_CONTEXT.webhookSecret),
      authSecretCiphertext: encrypt(authSecret, keyring, SETTINGS_CONTEXT.authSecret),
      encryptionKeyId: keyring.activeId,
    });

    const cookies = new Map<string, string>();
    for (const [index, login] of logins.entries()) {
      const id = `e2e-user-${login}`;
      const token = randomBytes(24).toString("base64url");
      await db.insert(user).values({ id, name: login, email: `${login}@example.test`, login, githubId: 1000 + index });
      await db.insert(session).values({ id: `e2e-session-${login}`, token, userId: id, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) });
      // Better Auth's signed cookie: the token, a dot, the base64 HMAC-SHA256 of the token, all URL-encoded.
      cookies.set(login, encodeURIComponent(`${token}.${createHmac("sha256", authSecret).update(token).digest("base64")}`));
    }
    return cookies;
  } finally {
    await pool.end();
  }
}

/** A delivery signed the way GitHub signs it. */
export function signedDelivery(event: string, payload: unknown, id: string, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(payload);
  return {
    data: body,
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": id,
      "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    },
  };
}
