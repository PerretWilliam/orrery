import { authIssue, type AuthIssue } from "../domain/errors";
import { sessionVerdict } from "../domain/session-policy";
import { singleFlight } from "../domain/single-flight";
import type { AuthStore } from "./store";

export type AuthDeps = {
  store: AuthStore;
  /** From the first-run wizard: the browser that finished setup becomes admin, once. */
  claimAdmin: (claimSecret: string | undefined, login: string) => Promise<boolean>;
  /** A valid GitHub access token for the user, refreshed if needed. Throws when GitHub refuses. */
  fetchAccessToken: (userId: string) => Promise<string>;
  now: () => Date;
};

export type SessionRow = { id: string; userId: string; createdAt: Date; expiresAt: Date };
export type SessionCheck = { ok: true; userId: string } | { ok: false; issue: AuthIssue };
export type TokenResult = { ok: true; token: string } | { ok: false; issue: AuthIssue };

/**
 * Who may hold a session, and what happens to it. Fail closed: today only instance admins (or the browser that finished
 * setup) can sign in; the access policy card replaces `authorize` with the sign-in allowlist.
 */
export function createAuthService({ store, claimAdmin, fetchAccessToken, now }: AuthDeps) {
  const flight = singleFlight<TokenResult>();
  const refreshFailed = () => authIssue("auth_refresh_failed", "GitHub no longer renews this user's access");

  async function authorize(login: string, claimSecret: string | undefined): Promise<boolean> {
    const lowered = login.toLowerCase();
    return (await store.isAdmin(lowered)) || (await claimAdmin(claimSecret, lowered));
  }

  return {
    authorize,

    /** A new session for `userId`: allowed only if `authorize` says so. A successful sign-in lifts a suspension. */
    async startSession(userId: string, claimSecret: string | undefined): Promise<boolean> {
      const state = await store.userState(userId);
      if (!state?.login || !(await authorize(state.login, claimSecret))) return false;
      await store.resume(userId);
      return true;
    },

    /** Applies the 7-day rolling / 30-day absolute rules and the suspension. Dead sessions are deleted on the spot. */
    async check(session: SessionRow): Promise<SessionCheck> {
      const state = await store.userState(session.userId);
      const verdict = state
        ? sessionVerdict({ createdAt: session.createdAt, expiresAt: session.expiresAt, userSuspendedAt: state.suspendedAt }, now())
        : "expired";
      if (verdict === "too_old" || verdict === "expired") await store.deleteSession(session.id);
      if (verdict === "ok") return { ok: true, userId: session.userId };
      return { ok: false, issue: verdict === "suspended" ? refreshFailed() : authIssue("auth_session_invalid", "The session has ended") };
    },

    /**
     * The user's GitHub token. One refresh at a time per user (refresh tokens are single use). When GitHub refuses,
     * the user is suspended: sessions and agent tokens stop working until they sign in again.
     */
    accessToken(userId: string): Promise<TokenResult> {
      return flight(userId, async () => {
        const state = await store.userState(userId);
        if (!state || state.suspendedAt) return { ok: false, issue: refreshFailed() };
        try {
          return { ok: true, token: await fetchAccessToken(userId) };
        } catch {
          await store.suspend(userId, now());
          return { ok: false, issue: refreshFailed() };
        }
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
