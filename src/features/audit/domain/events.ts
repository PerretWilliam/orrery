/** Everything the audit log records. Codes are stable: once released they are never renamed or reused. */
export const AUDIT_EVENTS = [
  "sign_in",
  "sign_out",
  "token_created",
  "token_used",
  "token_revoked",
  "secret_created",
  "secret_updated",
  "secret_deleted",
  "policy_changed",
  "allowlist_changed",
  "key_rotated",
  "reindex_forced",
] as const;
export type AuditEventName = (typeof AUDIT_EVENTS)[number];

/** Entries are kept this long, then purged. */
export const AUDIT_RETENTION_DAYS = 365;

export type AuditEvent = {
  event: AuditEventName;
  /** GitHub login of who did it; `null` for the system (a scheduled rotation, say). */
  actor: string | null;
  /** `owner/name` of the project concerned, if any. */
  repository?: string;
  /** Names only: a secret's name, a token's label. Never a value. */
  detail?: Record<string, string>;
};

export type AuditEntry = { id: string; at: Date; event: AuditEventName; actor: string | null; repository: string | null; detail: Record<string, string> };

const MAX_KEYS = 8;
const MAX_VALUE = 200;

/** Detail as it is stored: at most 8 short text fields. Anything longer is cut, so a log line can never carry a document. */
export function cleanDetail(detail: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(detail ?? {}).slice(0, MAX_KEYS).map(([key, value]) => [key.slice(0, 40), String(value).slice(0, MAX_VALUE)]));
}

export const isAuditEvent = (value: unknown): value is AuditEventName => AUDIT_EVENTS.some((name) => name === value);
