import { betterAuth, type BetterAuthOptions } from "better-auth";
import { CLAIM_COOKIE, readCookie } from "@/features/setup/domain/http";
import { toHubUser, type GithubProfile } from "../domain/profile";
import { SESSION_IDLE_SECONDS, SESSION_RENEW_SECONDS } from "../domain/session-policy";
import type { AuthService } from "./service";
import type { AuthStore } from "./store";

export type AuthConfig = {
  database: BetterAuthOptions["database"];
  clientId: string;
  clientSecret: string;
  secret: string;
  /** Public origin of the instance, e.g. `https://hub.example.com`. */
  baseURL: string;
  service: Pick<AuthService, "authorize" | "startSession">;
};

/**
 * Better Auth with the GitHub provider (GitHub App user authorization). Choices that matter:
 * - tokens are stored encrypted, and refreshed on demand (`getAccessToken`);
 * - cookies are HttpOnly and SameSite=Lax (Strict would drop them on the return from GitHub), Secure over HTTPS;
 * - the sign-in gate runs before the user row and before every session, so a refused account leaves nothing behind.
 */
export function createAuth({ database, clientId, clientSecret, secret, baseURL, service }: AuthConfig) {
  const secure = baseURL.startsWith("https:");
  const claim = (request?: Request) => readCookie(request?.headers.get("cookie") ?? null, CLAIM_COOKIE);

  return betterAuth({
    baseURL,
    secret,
    database,
    socialProviders: { github: { clientId, clientSecret, mapProfileToUser: (profile) => toHubUser(profile as unknown as GithubProfile) } },
    account: { encryptOAuthTokens: true },
    onAPIError: { errorURL: "/sign-in" },
    session: { expiresIn: SESSION_IDLE_SECONDS, updateAge: SESSION_RENEW_SECONDS },
    // `input` must stay on or Better Auth drops these from the GitHub profile; no endpoint that takes user input is exposed (see handleAuthRequest).
    user: {
      additionalFields: {
        githubId: { type: "number", required: false },
        login: { type: "string", required: false },
      },
    },
    advanced: {
      cookiePrefix: "orrery",
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            const login = (user as { login?: string | null }).login;
            if (!login || !(await service.authorize(login, claim(context?.request)))) return false;
          },
        },
      },
      session: {
        create: {
          before: async (session, context) => {
            if (!(await service.startSession(session.userId, claim(context?.request)))) return false;
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** A valid GitHub access token for `userId`, refreshed by Better Auth when it has expired. Throws when GitHub refuses. */
export async function githubAccessToken(auth: Auth, store: Pick<AuthStore, "githubAccountId">, userId: string): Promise<string> {
  const accountId = await store.githubAccountId(userId);
  if (!accountId) throw new Error("The user has no GitHub account");
  return (await auth.api.getAccessToken({ body: { accountId, userId } })).accessToken;
}
