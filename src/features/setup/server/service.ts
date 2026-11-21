import { encrypt, type Keyring } from "@/lib/crypto";
import { log } from "@/lib/logger";
import { hashClaim, newAdminClaim } from "../domain/admin-claim";
import { setupIssue, type SetupIssue } from "../domain/errors";
import { buildManifest, parseConversion, type AppCredentials } from "../domain/manifest";
import { manifestState, signSession, stateMatches, tokensMatch, verifySession } from "../domain/token";
import type { SetupStore } from "./store";

/** Encryption contexts of the App credentials: a ciphertext copied to another column fails to decrypt. */
export const SETTINGS_CONTEXT = {
  clientSecret: "instance_settings.client_secret",
  privateKey: "instance_settings.private_key",
  webhookSecret: "instance_settings.webhook_secret",
} as const;

export const SESSION_TTL_MS = 30 * 60 * 1000;
const CODE = /^[A-Za-z0-9_-]{8,128}$/;
const GITHUB_TIMEOUT_MS = 10_000;

export type Fail = { ok: false; issue: SetupIssue };
const fail = (code: Parameters<typeof setupIssue>[0], message: string): Fail => ({ ok: false, issue: setupIssue(code, message) });

export type SetupDeps = {
  store: SetupStore;
  token: string;
  keyring: () => Keyring;
  fetch: typeof fetch;
  now: () => Date;
};

export function createSetupService({ store, token, keyring, fetch, now }: SetupDeps) {
  const alreadyDone = () => fail("setup_already_completed", "This instance is already set up");

  /** Setup is open and the browser proved it holds the token. */
  async function guard(session: string | undefined): Promise<Fail | null> {
    if (await store.isCompleted()) return alreadyDone();
    return verifySession(token, session, now()) ? null : fail("setup_session_required", "Enter the setup token first");
  }

  const keyringReady = (): Fail | null => {
    try {
      keyring();
      return null;
    } catch {
      return fail("setup_key_missing", "ORRERY_ENCRYPTION_KEYS is missing or invalid");
    }
  };

  /** One-time code from GitHub for the App credentials. `null` unless GitHub answers 201 with a complete App. */
  async function exchange(code: string): Promise<AppCredentials | null> {
    const response = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
      method: "POST",
      headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "orrery" },
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      redirect: "error",
    });
    return response.status === 201 ? parseConversion(await response.json()) : null;
  }

  return {
    isCompleted: () => store.isCompleted(),

    /** Step 1: the token entered by the person at the keyboard. Returns the session cookie value. */
    async login(provided: unknown): Promise<{ ok: true; session: string; maxAgeSeconds: number } | Fail> {
      if (await store.isCompleted()) return alreadyDone();
      if (!tokensMatch(provided, token)) return fail("setup_token_invalid", "The setup token is not correct");
      return { ok: true, session: signSession(token, now(), SESSION_TTL_MS), maxAgeSeconds: SESSION_TTL_MS / 1000 };
    },

    /** True while setup is open and this browser holds a live session. */
    async hasSession(session: string | undefined): Promise<boolean> {
      return (await guard(session)) === null;
    },

    /** Step 2: what the browser posts to GitHub to create the App. */
    async begin(session: string | undefined, baseUrl: string, webhooks: boolean) {
      const refused = (await guard(session)) ?? keyringReady();
      if (refused) return refused;
      return { ok: true as const, manifest: buildManifest(baseUrl, webhooks), state: manifestState(token, session as string) };
    },

    /** Step 3: GitHub sends the browser back with a one-time code; exchange it and store the App, encrypted. */
    async complete(session: string | undefined, state: unknown, code: unknown) {
      const refused = (await guard(session)) ?? keyringReady();
      if (refused) return refused;
      if (!stateMatches(token, session as string, state)) return fail("setup_state_invalid", "The state does not match this session");
      if (typeof code !== "string" || !CODE.test(code)) return fail("setup_github_failed", "GitHub did not return a valid code");

      const credentials = await exchange(code).catch(() => null);
      if (!credentials) return fail("setup_github_failed", "GitHub did not create the App");

      const keys = keyring();
      const claim = newAdminClaim(now());
      const stored = await store.complete({
        githubAppId: credentials.id,
        githubAppSlug: credentials.slug,
        githubClientId: credentials.clientId,
        clientSecretCiphertext: encrypt(credentials.clientSecret, keys, SETTINGS_CONTEXT.clientSecret),
        privateKeyCiphertext: encrypt(credentials.privateKey, keys, SETTINGS_CONTEXT.privateKey),
        webhookSecretCiphertext: encrypt(credentials.webhookSecret, keys, SETTINGS_CONTEXT.webhookSecret),
        encryptionKeyId: keys.activeId,
        adminClaimHash: claim.hash,
        adminClaimExpiresAt: claim.expiresAt,
        completedAt: now(),
      });
      if (!stored) {
        log("warn", "setup was completed concurrently; an extra GitHub App was created and can be deleted", { slug: credentials.slug });
        return alreadyDone();
      }
      log("info", "setup completed: GitHub App created", { slug: credentials.slug, appId: credentials.id });
      return { ok: true as const, slug: credentials.slug, claimSecret: claim.secret, claimExpiresAt: claim.expiresAt };
    },

    /** Called after a GitHub sign-in: the browser's claim cookie makes this user an admin, once. */
    async claimAdmin(claimSecret: string | undefined, login: string): Promise<boolean> {
      return claimSecret ? store.consumeAdminClaim(hashClaim(claimSecret), now(), login.toLowerCase()) : false;
    },
  };
}

export type SetupService = ReturnType<typeof createSetupService>;
