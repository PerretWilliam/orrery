import { isHostBound, isValidSecretValue, SECRET_NAME } from "./bindings";
import { secretIssue, type SecretIssue } from "./errors";

/**
 * Resolves `${SECRET_NAME}` references of a source request, server side, just before it is sent.
 * Fail closed: every secret must exist, be bound to the destination host and sit in an allowed place
 * (header values and query string). Any problem returns issues and no request is built.
 */

export type SecretLookup = (name: string) => { value: string; boundHosts: readonly string[] } | undefined;
export type RequestTemplate = { url: string; headers?: Record<string, string>; body?: unknown };
export type ResolvedRequest = { url: string; headers: Record<string, string> };
/** `used` are the values that went into the request, and `inQuery` whether any of them travels in its URL. */
export type ResolveResult = { ok: true; request: ResolvedRequest; used: string[]; inQuery: boolean } | { ok: false; issues: SecretIssue[] };

const REFERENCE = /\$\{([^}]*)\}/g;
/** Splits `text` at the first `mark`: what comes before, and the rest starting with the mark (empty when absent). */
const cut = (text: string, mark: string): [string, string] => {
  const at = text.indexOf(mark);
  return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at)];
};
const hasReference = (text: string): boolean => text.includes("${");

/** Strings of a JSON value (keys and values), walked iteratively. */
function* strings(root: unknown): Generator<string> {
  const stack = [root];
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    if (typeof item === "string") yield item;
    else if (item !== null) {
      // Array indexes are pushed as keys too: harmless strings.
      for (const [key, value] of Object.entries(item)) stack.push(key, value);
    }
  }
}

const namesIn = (text: string): string[] => [...text.matchAll(REFERENCE)].map((match) => match[1]);

export function resolveSecrets(template: RequestTemplate, lookup: SecretLookup): ResolveResult {
  const issues: SecretIssue[] = [];
  const names = new Set<string>();
  const collect = (text: string) => namesIn(text).forEach((name) => names.add(name));

  // Where references may appear. URL: only after the first `?` and before any `#`.
  const [beforeHash, fragment] = cut(template.url, "#");
  const [base, query] = cut(beforeHash, "?");
  if (hasReference(base) || hasReference(fragment)) {
    issues.push(secretIssue("secret_not_allowed_here", "url", "Secrets cannot be used in the scheme, host, path or fragment of a URL"));
  }
  collect(query);

  const headers = Object.entries(template.headers ?? {});
  for (const [, value] of headers) collect(value);

  for (const text of strings(template.body)) {
    if (hasReference(text)) {
      issues.push(secretIssue("secret_not_allowed_here", "body", "Secrets cannot be used in the request body"));
      break;
    }
  }

  // No parsable destination means an empty host, which no secret is bound to.
  const host = URL.canParse(base) ? new URL(base).hostname : "";
  const found = new Map<string, string>();
  for (const name of names) {
    const entry = SECRET_NAME.test(name) ? lookup(name) : undefined;
    if (!entry) issues.push(secretIssue("secret_unknown", "", `Unknown secret "${name}"`));
    else if (!isHostBound(entry.boundHosts, host)) {
      issues.push(secretIssue("secret_host_not_bound", "url", `Secret "${name}" is not bound to the host of this source`));
    } else if (!isValidSecretValue(entry.value)) {
      issues.push(secretIssue("secret_invalid_value", "", `Secret "${name}" has an unusable value`));
    } else found.set(name, entry.value);
  }
  if (issues.length > 0) return { ok: false, issues };

  const fill = (text: string, encode: (value: string) => string) =>
    text.replace(REFERENCE, (_match, name: string) => encode(found.get(name) as string));
  return {
    ok: true,
    used: [...found.values()],
    inQuery: namesIn(query).length > 0,
    request: {
      url: base + fill(query, encodeURIComponent) + fragment,
      headers: Object.fromEntries(headers.map(([name, value]) => [name, fill(value, (v) => v)])),
    },
  };
}
