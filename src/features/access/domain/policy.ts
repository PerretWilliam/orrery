/**
 * The instance admin's access policy, pure parts. Level 1 is the sign-in allowlist, level 2 the per-project rules; the
 * hub never grants more than GitHub does, it only narrows. Anything that cannot be read, parsed or checked narrows.
 */

export type AllowEntry = { kind: "org" | "team" | "user"; value: string };
export type Subject = { kind: "user" | "team"; value: string };
export type ProjectRule = { effect: "hide" } | { effect: "restrict_to"; subject: Subject };

// GitHub logins: letters, digits and single hyphens, 39 characters at most. Team slugs also allow underscores and dots.
const LOGIN = /^[a-z0-9][a-z0-9-]{0,38}$/;
const TEAM = /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9_.-]{0,99}$/;

export type Parsed<T> = { items: T[]; problems: string[] };

const pieces = (text: string | undefined) =>
  (text ?? "")
    .split(/[,\n]/)
    .map((piece) => piece.trim().toLowerCase())
    .filter(Boolean);

/** `ORRERY_ADMINS`: GitHub usernames separated by commas. Invalid ones are reported and skipped, never guessed. */
export function parseAdminLogins(text: string | undefined): Parsed<string> {
  const parsed: Parsed<string> = { items: [], problems: [] };
  for (const login of new Set(pieces(text))) (LOGIN.test(login) ? parsed.items : parsed.problems).push(login);
  return parsed;
}

/** `ORRERY_SIGNIN_ALLOWLIST`: `org:acme`, `team:acme/devs`, `user:octocat`, separated by commas. */
export function parseAllowlist(text: string | undefined): Parsed<AllowEntry> {
  const parsed: Parsed<AllowEntry> = { items: [], problems: [] };
  const seen = new Set<string>();
  for (const piece of pieces(text)) {
    const [kind, value = "", ...rest] = piece.split(":");
    const valid = rest.length === 0 && ((kind === "team" && TEAM.test(value)) || ((kind === "org" || kind === "user") && LOGIN.test(value)));
    if (!valid) parsed.problems.push(piece);
    else if (!seen.has(piece)) {
      seen.add(piece);
      parsed.items.push({ kind: kind as AllowEntry["kind"], value });
    }
  }
  return parsed;
}

/** `acme/devs` -> its organization and slug; `null` when it is not a team reference. */
export function splitTeam(value: string): { org: string; slug: string } | null {
  const [org, slug, ...rest] = value.split("/");
  return org && slug && rest.length === 0 ? { org, slug } : null;
}

/**
 * Level 2 for one project. An explicit `hide` wins over everything; `restrict_to` rules together name who may see the
 * project; no rule leaves it to GitHub. `isSubject` is asked lazily and only until one subject matches.
 */
export async function projectVisible(rules: readonly ProjectRule[], isSubject: (subject: Subject) => Promise<boolean>): Promise<boolean> {
  const allowed: Subject[] = [];
  for (const rule of rules) {
    if (rule.effect === "hide") return false;
    allowed.push(rule.subject);
  }
  if (allowed.length === 0) return true;
  for (const subject of allowed) if (await isSubject(subject)) return true;
  return false;
}

/** Level 1. An empty allowlist means the default rule (`fallback`); otherwise one matching entry is enough. */
export async function signInAllowed(
  entries: readonly AllowEntry[],
  matches: (entry: AllowEntry) => Promise<boolean>,
  fallback: () => Promise<boolean>,
): Promise<boolean> {
  if (entries.length === 0) return fallback();
  for (const entry of entries) if (await matches(entry)) return true;
  return false;
}
