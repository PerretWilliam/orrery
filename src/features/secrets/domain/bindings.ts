import { secretIssue, type SecretIssue } from "./errors";

/** Rules for what a maintainer may store: a name, a value, and the hosts the value may be sent to. */

export const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
export const MAX_SECRET_LENGTH = 8192;
const CONTROL = /[\x00-\x1f\x7f]/;
const NOT_A_HOST = /[\s/?#@\\*]/;

export const isValidSecretValue = (value: string): boolean =>
  value.length > 0 && value.length <= MAX_SECRET_LENGTH && !CONTROL.test(value);

/** Lowercased, punycode host name, or `null` when the input is not a bare host (scheme, port, path, wildcard...). */
export function normalizeHost(input: string): string | null {
  if (NOT_A_HOST.test(input) || !URL.canParse(`https://${input}`)) return null;
  const url = new URL(`https://${input}`);
  // A port other than the scheme default keeps `host` different from `hostname`: refused.
  return url.host === url.hostname ? url.hostname : null;
}

/** Secrets are only sent to the exact hosts they are bound to: no subdomain or suffix matching. */
export const isHostBound = (boundHosts: readonly string[], host: string): boolean =>
  boundHosts.some((bound) => bound === normalizeHost(host));

/** Validates what a maintainer submits and returns the normalized hosts, or issues. */
export function validateSecretInput(input: {
  name: string;
  hosts: readonly string[];
}): { ok: true; hosts: string[] } | { ok: false; issues: SecretIssue[] } {
  const issues: SecretIssue[] = [];
  if (!SECRET_NAME.test(input.name)) issues.push(secretIssue("secret_invalid_name", "name", "Invalid secret name"));
  const hosts: string[] = [];
  input.hosts.forEach((raw, index) => {
    const host = normalizeHost(raw);
    if (host === null) issues.push(secretIssue("secret_invalid_host", `hosts[${index}]`, "Not a bare host name"));
    else if (!hosts.includes(host)) hosts.push(host);
  });
  if (input.hosts.length === 0) issues.push(secretIssue("secret_invalid_host", "hosts", "Bind the secret to at least one host"));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, hosts };
}
