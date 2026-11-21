import { describe, expect, it, vi } from "vitest";
import { createAuthService } from "./service";
import type { AuthStore, UserState } from "./store";

const NOW = new Date("2026-06-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function setup({ users = {} as Record<string, UserState>, admins = [] as string[], claim = false, token = "ghu_token" as string | Error } = {}) {
  const calls = { suspend: [] as [string, Date][], resume: [] as string[], deleted: [] as string[], claimed: [] as [string | undefined, string][] };
  const store = {
    isAdmin: vi.fn(async (login: string) => admins.includes(login)),
    userState: vi.fn(async (id: string) => users[id] ?? null),
    suspend: vi.fn(async (id: string, at: Date) => void calls.suspend.push([id, at])),
    resume: vi.fn(async (id: string) => void calls.resume.push(id)),
    deleteSession: vi.fn(async (id: string) => void calls.deleted.push(id)),
  } as unknown as AuthStore;
  const fetchAccessToken = vi.fn(async () => {
    if (token instanceof Error) throw token;
    return token;
  });
  const claimAdmin = vi.fn(async (secret: string | undefined, login: string) => {
    calls.claimed.push([secret, login]);
    return claim;
  });
  return { service: createAuthService({ store, claimAdmin, fetchAccessToken, now: () => NOW }), store, calls, fetchAccessToken, claimAdmin };
}

describe("authorize (fail closed)", () => {
  it("lets an admin in, whatever the case of the login, without using the claim", async () => {
    const { service, claimAdmin } = setup({ admins: ["octo"] });
    expect(await service.authorize("Octo", undefined)).toBe(true);
    expect(claimAdmin).not.toHaveBeenCalled();
  });
  it("lets the holder of the setup claim in, with the lowercased login", async () => {
    const { service, calls } = setup({ claim: true });
    expect(await service.authorize("Octo", "secret")).toBe(true);
    expect(calls.claimed).toEqual([["secret", "octo"]]);
  });
  it("refuses everybody else", async () => {
    const { service } = setup({ claim: false });
    expect(await service.authorize("stranger", "wrong")).toBe(false);
    expect(await service.authorize("stranger", undefined)).toBe(false);
  });
});

describe("startSession", () => {
  it("opens a session for an admin and lifts a suspension", async () => {
    const { service, calls } = setup({ users: { u1: { login: "Octo", suspendedAt: NOW } }, admins: ["octo"] });
    expect(await service.startSession("u1", undefined)).toBe(true);
    expect(calls.resume).toEqual(["u1"]);
  });
  it.each([
    ["an unknown user", {}],
    ["a user without a login", { u1: { login: null, suspendedAt: null } }],
    ["a user who is not allowed", { u1: { login: "stranger", suspendedAt: null } }],
  ])("refuses %s, and changes nothing", async (_name, users) => {
    const { service, calls } = setup({ users });
    expect(await service.startSession("u1", undefined)).toBe(false);
    expect(calls.resume).toEqual([]);
  });
});

describe("check", () => {
  const session = (over = {}) => ({ id: "s1", userId: "u1", createdAt: new Date(NOW.getTime() - DAY), expiresAt: new Date(NOW.getTime() + DAY), ...over });
  const user = { u1: { login: "octo", suspendedAt: null } };

  it("accepts a live session", async () => {
    const { service, calls } = setup({ users: user });
    expect(await service.check(session())).toEqual({ ok: true, userId: "u1" });
    expect(calls.deleted).toEqual([]);
  });
  it("deletes a session older than 30 days and an expired one", async () => {
    const { service, calls } = setup({ users: user });
    const tooOld = await service.check(session({ createdAt: new Date(NOW.getTime() - 31 * DAY) }));
    expect(tooOld).toMatchObject({ ok: false, issue: { code: "auth_session_invalid", message: "The session has ended" } });
    const expired = await service.check(session({ id: "s2", expiresAt: new Date(NOW.getTime() - 1) }));
    expect(expired).toMatchObject({ ok: false, issue: { code: "auth_session_invalid" } });
    expect(calls.deleted).toEqual(["s1", "s2"]);
  });
  it("deletes the session of a user who no longer exists", async () => {
    const { service, calls } = setup();
    expect(await service.check(session())).toMatchObject({ ok: false, issue: { code: "auth_session_invalid" } });
    expect(calls.deleted).toEqual(["s1"]);
  });
  it("keeps but refuses the session of a suspended user", async () => {
    const { service, calls } = setup({ users: { u1: { login: "octo", suspendedAt: NOW } } });
    expect(await service.check(session())).toMatchObject({
      ok: false,
      issue: { code: "auth_refresh_failed", message: "GitHub no longer renews this user's access" },
    });
    expect(calls.deleted).toEqual([]);
  });
});

describe("accessToken", () => {
  const user = { u1: { login: "octo", suspendedAt: null } };

  it("returns the token GitHub gave", async () => {
    const { service, calls } = setup({ users: user });
    expect(await service.accessToken("u1")).toEqual({ ok: true, token: "ghu_token" });
    expect(calls.suspend).toEqual([]);
  });
  it("suspends the user when GitHub refuses to renew, with the time of the failure", async () => {
    const { service, calls } = setup({ users: user, token: new Error("FAILED_TO_GET_ACCESS_TOKEN") });
    expect(await service.accessToken("u1")).toMatchObject({ ok: false, issue: { code: "auth_refresh_failed" } });
    expect(calls.suspend).toEqual([["u1", NOW]]);
  });
  it("does not call GitHub for a suspended or unknown user", async () => {
    const suspended = setup({ users: { u1: { login: "octo", suspendedAt: NOW } } });
    expect(await suspended.service.accessToken("u1")).toMatchObject({ ok: false, issue: { code: "auth_refresh_failed" } });
    const unknown = setup();
    expect(await unknown.service.accessToken("ghost")).toMatchObject({ ok: false });
    expect(suspended.fetchAccessToken).not.toHaveBeenCalled();
    expect(unknown.fetchAccessToken).not.toHaveBeenCalled();
  });
  it("refreshes once for concurrent requests of one user (refresh tokens are single use)", async () => {
    const { service, fetchAccessToken } = setup({ users: user });
    const results = await Promise.all([service.accessToken("u1"), service.accessToken("u1"), service.accessToken("u1")]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(fetchAccessToken).toHaveBeenCalledTimes(1);
  });
});
