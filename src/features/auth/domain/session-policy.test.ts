import { describe, expect, it } from "vitest";
import { SESSION_IDLE_SECONDS, SESSION_MAX_MS, SESSION_RENEW_SECONDS, sessionVerdict } from "./session-policy";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-30T12:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const facts = (over: Partial<Parameters<typeof sessionVerdict>[0]> = {}) => ({ createdAt: at(-DAY), expiresAt: at(DAY), userSuspendedAt: null, ...over });

describe("session rules", () => {
  it("are 7 days rolling, renewed daily, 30 days absolute", () => {
    expect(SESSION_IDLE_SECONDS).toBe(7 * 86400);
    expect(SESSION_RENEW_SECONDS).toBe(86400);
    expect(SESSION_MAX_MS).toBe(30 * DAY);
  });
  it("accepts a recent, unexpired session", () => expect(sessionVerdict(facts(), NOW)).toBe("ok"));
  it("ends a session 30 days after sign-in, however recently it was used", () => {
    expect(sessionVerdict(facts({ createdAt: at(-30 * DAY + 1), expiresAt: at(DAY) }), NOW)).toBe("ok");
    expect(sessionVerdict(facts({ createdAt: at(-30 * DAY), expiresAt: at(DAY) }), NOW)).toBe("too_old");
    expect(sessionVerdict(facts({ createdAt: at(-31 * DAY), expiresAt: at(DAY) }), NOW)).toBe("too_old");
  });
  it("ends a session that was idle for 7 days (expiry reached)", () => {
    expect(sessionVerdict(facts({ expiresAt: at(1) }), NOW)).toBe("ok");
    expect(sessionVerdict(facts({ expiresAt: at(0) }), NOW)).toBe("expired");
    expect(sessionVerdict(facts({ expiresAt: at(-1) }), NOW)).toBe("expired");
  });
  it("suspends a session of a user whose GitHub tokens could not be renewed", () => {
    expect(sessionVerdict(facts({ userSuspendedAt: at(-1000) }), NOW)).toBe("suspended");
  });
  it("deletes rather than suspends a session that is also too old or expired", () => {
    expect(sessionVerdict(facts({ createdAt: at(-40 * DAY), userSuspendedAt: at(-1000) }), NOW)).toBe("too_old");
    expect(sessionVerdict(facts({ expiresAt: at(-1), userSuspendedAt: at(-1000) }), NOW)).toBe("expired");
  });
});
