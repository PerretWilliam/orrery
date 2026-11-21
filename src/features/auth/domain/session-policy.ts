/** 7 days rolling (renewed at most once a day), 30 days absolute: whatever the activity, a session ends 30 days after sign-in. */
export const SESSION_IDLE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_RENEW_SECONDS = 24 * 60 * 60;
export const SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionFacts = { createdAt: Date; expiresAt: Date; userSuspendedAt: Date | null };
export type SessionVerdict = "ok" | "too_old" | "expired" | "suspended";

/** `too_old` and `expired` sessions are deleted; `suspended` ones are kept and work again after the next sign-in. */
export function sessionVerdict({ createdAt, expiresAt, userSuspendedAt }: SessionFacts, now: Date): SessionVerdict {
  if (now.getTime() - createdAt.getTime() >= SESSION_MAX_MS) return "too_old";
  if (now.getTime() >= expiresAt.getTime()) return "expired";
  return userSuspendedAt ? "suspended" : "ok";
}
