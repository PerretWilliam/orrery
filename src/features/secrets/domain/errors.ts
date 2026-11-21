/**
 * Error catalog of secrets. Same shape as the config errors (code, JSON path, message, fix) and the same rules:
 * codes are never renamed or reused once released, and messages never contain a secret value.
 */
export const SECRET_ERRORS = {
  secret_invalid_name: { fix: "Use 1 to 64 characters: capital letters, digits and underscores, starting with a letter (for example GAME_API_TOKEN)." },
  secret_invalid_host: { fix: "Give a bare host name such as api.example.com: no scheme, port, path or wildcard." },
  secret_invalid_value: { fix: "Re-enter the secret without line breaks or control characters, up to 8192 characters." },
  secret_unknown: { fix: "Create the secret in the project's secret settings, or fix the name used in .hub.yml." },
  secret_host_not_bound: { fix: "Bind the secret to this host in the project's secret settings (maintainers only), or point the source at a host the secret is bound to." },
  secret_not_allowed_here: { fix: "Move the ${NAME} reference into a header value or the query string. Secrets are never sent in the scheme, host, path, fragment or body." },
} as const;

export type SecretIssueCode = keyof typeof SECRET_ERRORS;

export type SecretIssue = { code: SecretIssueCode; path: string; message: string; fix: string };

export const secretIssue = (code: SecretIssueCode, path: string, message: string): SecretIssue => ({
  code,
  path,
  message,
  fix: Reflect.get(SECRET_ERRORS, code).fix,
});
