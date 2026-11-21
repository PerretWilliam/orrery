/**
 * Error catalog of the first-run wizard. Same shape and rules as the other catalogs: stable codes, a message
 * that never contains a token, a code or a credential, and a suggested fix.
 */
export const SETUP_ERRORS = {
  setup_token_invalid: { fix: "Copy the setup token from the container logs (the line “Orrery setup token”), or use the value of ORRERY_SETUP_TOKEN." },
  setup_session_required: { fix: "Enter the setup token first, then try again." },
  setup_state_invalid: { fix: "Start again from /setup: the link expired or does not belong to this browser." },
  setup_origin_invalid: { fix: "Submit the form from this site, not from another page." },
  setup_already_completed: { fix: "This instance is already set up. Sign in with GitHub instead." },
  setup_key_missing: { fix: "Set ORRERY_ENCRYPTION_KEYS to `id:base64key` (32 random bytes, for example from `openssl rand -base64 32`) and restart." },
  setup_github_failed: { fix: "Start again from /setup. If it keeps failing, check that this server can reach api.github.com." },
} as const;

export type SetupIssueCode = keyof typeof SETUP_ERRORS;

export type SetupIssue = { code: SetupIssueCode; message: string; fix: string };

export const setupIssue = (code: SetupIssueCode, message: string): SetupIssue => ({
  code,
  message,
  fix: Reflect.get(SETUP_ERRORS, code).fix,
});
