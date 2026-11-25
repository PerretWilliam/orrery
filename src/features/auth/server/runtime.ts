import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getAccessPolicy } from "@/features/access/server/runtime";
import { getAudit } from "@/features/audit/server/runtime";
import { instanceOrigin } from "@/features/setup/server/http";
import { getSetupService } from "@/features/setup/server/runtime";
import { SETTINGS_CONTEXT } from "@/features/setup/server/service";
import { decrypt, keyringFromEnv } from "@/lib/crypto";
import { getDb } from "@/lib/db/instance";
import { account, session, user, verification } from "@/lib/db/schema";
import type { Viewer } from "../domain/profile";
import { loadAuthSecret } from "./auth-secret";
import { createAuth, githubAccessToken, type Auth } from "./better-auth";
import { createAuthStore } from "./drizzle-store";
import { createAuthService, type AuthService, type SessionCheck } from "./service";

export type AuthContext = { auth: Auth; service: AuthService };

const contexts = new Map<string, Promise<AuthContext>>();

async function build(baseURL: string): Promise<AuthContext | null> {
  const db = getDb();
  const store = createAuthStore(db);
  const app = await store.githubApp();
  if (!app) return null;
  const keyring = keyringFromEnv();
  const setup = getSetupService();
  const holder: { auth?: Auth } = {};
  const service = createAuthService({
    store,
    claimAdmin: (secret, login) => setup.claimAdmin(secret, login),
    canSignIn: (login) => getAccessPolicy().canSignIn(login),
    fetchAccessToken: (userId) => githubAccessToken(holder.auth as Auth, store, userId),
    now: () => new Date(),
    onSignIn: (login) => getAudit().record({ event: "sign_in", actor: login }),
  });
  holder.auth = createAuth({
    database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
    clientId: app.clientId,
    clientSecret: decrypt(app.clientSecretCiphertext, keyring, SETTINGS_CONTEXT.clientSecret),
    secret: await loadAuthSecret(store, keyring),
    baseURL,
    service,
  });
  return { auth: holder.auth, service };
}

/** Auth for the origin the browser used. `null` until the first-run wizard has created the GitHub App. */
export async function getAuthContext(headers: Headers): Promise<AuthContext | null> {
  const baseURL = instanceOrigin(headers);
  if (!baseURL) return null;
  const known = contexts.get(baseURL);
  if (known) return known;
  const created = await build(baseURL);
  if (created) contexts.set(baseURL, Promise.resolve(created));
  return created;
}

/** The signed-in user behind these request headers, with the session rules applied. `null` when there is none. */
export async function currentUser(headers: Headers): Promise<SessionCheck | null> {
  const context = await getAuthContext(headers);
  const found = context && (await context.auth.api.getSession({ headers }));
  if (!context || !found) return null;
  return context.service.check({ ...found.session });
}

/** Who is behind these headers: the session's user and their GitHub login. `null` without a valid session. */
export async function currentViewer(headers: Headers): Promise<Viewer | null> {
  const check = await currentUser(headers);
  if (!check?.ok) return null;
  const state = await createAuthStore(getDb()).userState(check.userId);
  return state?.login ? { userId: check.userId, login: state.login, image: state.image } : null;
}
