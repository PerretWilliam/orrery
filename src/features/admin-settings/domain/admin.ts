import { parseAdminLogins, parseAllowlist, type AllowEntry, type ProjectRule } from "@/features/access/domain/policy";
import type { RepoRef } from "@/features/repos/domain/git-provider";
import { parseAllowEntry } from "@/lib/ssrf-guard";

/** Error catalog of the admin settings. Codes are never renamed or reused once released. */
export const ADMIN_ERRORS = {
  admin_invalid_entry: { fix: "Check the value: a sign-in entry is org:acme, team:acme/devs or user:octocat; a host is a name, a *.suffix, an address or a CIDR range; a project is owner/name." },
  admin_last_admin: { fix: "Add another admin first: an instance always keeps at least one." },
  admin_unknown_project: { fix: "The project is not known yet. Wait for its first discovery, or check the owner/name." },
  admin_rotation_failed: { fix: "Some data could not be re-encrypted. Keep the old key in ORRERY_ENCRYPTION_KEYS after the new active one, then try again." },
} as const;
export type AdminErrorCode = keyof typeof ADMIN_ERRORS;

export type AdminAction =
  | { type: "allow_add" | "allow_remove"; entry: AllowEntry }
  | { type: "host_add" | "host_remove"; host: string }
  | { type: "admin_add" | "admin_remove"; login: string }
  | { type: "rule_add" | "rule_remove"; project: RepoRef; rule: ProjectRule }
  | { type: "rotate_keys" };

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const only = <T,>(parsed: { items: T[]; problems: string[] }): T | null => (parsed.items.length === 1 && parsed.problems.length === 0 ? parsed.items[0]! : null);

function parseRule(field: (name: string) => string): ProjectRule | null {
  if (field("effect") === "hide") return { effect: "hide" };
  const subject = only(parseAllowlist(field("subject")));
  return field("effect") === "restrict_to" && (subject?.kind === "user" || subject?.kind === "team") ? { effect: "restrict_to", subject: { kind: subject.kind, value: subject.value } } : null;
}

/** An admin's form post as an action, or `null` for anything that is not exactly one well-formed action. */
export function parseAction(field: (name: string) => string): AdminAction | null {
  const type = field("action");
  const value = field("value").trim();
  switch (type) {
    case "allow_add":
    case "allow_remove": {
      const entry = only(parseAllowlist(value));
      return entry ? { type, entry } : null;
    }
    case "host_add":
    case "host_remove":
      return value.length <= 253 && parseAllowEntry(value) ? { type, host: value.toLowerCase() } : null;
    case "admin_add":
    case "admin_remove": {
      const login = only(parseAdminLogins(value));
      return login ? { type, login } : null;
    }
    case "rule_add":
    case "rule_remove": {
      const [owner = "", name = "", ...rest] = value.split("/");
      const rule = parseRule(field);
      return rest.length === 0 && NAME.test(owner) && NAME.test(name) && rule ? { type, project: { owner, name }, rule } : null;
    }
    case "rotate_keys":
      return { type };
    default:
      return null;
  }
}
