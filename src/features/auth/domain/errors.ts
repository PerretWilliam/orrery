/**
 * Error catalog of sign-in and sessions. Same shape and rules as the other catalogs: stable codes (never renamed or
 * reused), a message that never contains a token or a cookie, and a suggested fix.
 */
export const AUTH_ERRORS = {
  auth_not_configured: { fix: "Finish the first-run setup at /setup, then sign in." },
  auth_sign_in_refused: { fix: "Ask an instance admin to allow your GitHub account, then sign in again." },
  auth_session_invalid: { fix: "Sign in with GitHub again." },
  auth_refresh_failed: { fix: "Sign in with GitHub again: GitHub no longer lets the hub renew your access." },
  auth_origin_invalid: { fix: "Send the request from this site, not from another page." },
} as const;

export type AuthIssueCode = keyof typeof AUTH_ERRORS;

export type AuthIssue = { code: AuthIssueCode; message: string; fix: string };

export const authIssue = (code: AuthIssueCode, message: string): AuthIssue => ({
  code,
  message,
  fix: Reflect.get(AUTH_ERRORS, code).fix,
});
