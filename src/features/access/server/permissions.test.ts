// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RepoPermission, RepoRef } from "@/features/repos/domain/git-provider";
import { createPermissionService, PERMISSION_TIMEOUT_MS, PERMISSION_TTL_MS } from "./permissions";

const web: RepoRef = { owner: "acme", name: "web" };
const api: RepoRef = { owner: "acme", name: "api" };

function setup(answer: (repo: RepoRef, username: string) => Promise<unknown> | unknown = () => "read") {
  let clock = 1_000;
  const getUserPermission = vi.fn(async (repo: RepoRef, username: string) => (await answer(repo, username)) as RepoPermission);
  const service = createPermissionService({ provider: { getUserPermission }, now: () => clock });
  return { service, getUserPermission, advance: (ms: number) => (clock += ms) };
}

const logged = (out: { mock: { calls: unknown[][] } }) => out.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);

let out: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("permission cache", () => {
  it("keeps answers for 5 minutes and gives GitHub 5 seconds", () => {
    expect([PERMISSION_TTL_MS, PERMISSION_TIMEOUT_MS]).toEqual([300_000, 5_000]);
  });
  it("asks GitHub once, then answers from the cache for 5 minutes", async () => {
    const { service, getUserPermission, advance } = setup(() => "maintain");
    expect(await service.permissionOf(web, "octocat")).toBe("maintain");
    advance(PERMISSION_TTL_MS - 1);
    expect(await service.permissionOf(web, "octocat")).toBe("maintain");
    expect(getUserPermission).toHaveBeenCalledTimes(1);
    advance(1);
    await service.permissionOf(web, "octocat");
    expect(getUserPermission).toHaveBeenCalledTimes(2);
  });
  it("keeps one entry per repository and per user", async () => {
    const { service, getUserPermission } = setup((repo, user) => (repo.name === "web" && user === "octocat" ? "admin" : "read"));
    expect(await service.permissionOf(web, "octocat")).toBe("admin");
    expect(await service.permissionOf(api, "octocat")).toBe("read");
    expect(await service.permissionOf(web, "hubot")).toBe("read");
    expect(getUserPermission).toHaveBeenCalledTimes(3);
  });
  it("treats names case-insensitively, like GitHub", async () => {
    const { service, getUserPermission } = setup();
    await service.permissionOf(web, "octocat");
    await service.permissionOf({ owner: "ACME", name: "Web" }, "OctoCat");
    expect(getUserPermission).toHaveBeenCalledTimes(1);
  });
  it("caches a real 'none' answer too", async () => {
    const { service, getUserPermission } = setup(() => "none");
    await service.permissionOf(web, "stranger");
    await service.permissionOf(web, "stranger");
    expect(getUserPermission).toHaveBeenCalledTimes(1);
  });
  it("shares one GitHub call between concurrent requests", async () => {
    const { service, getUserPermission } = setup(async () => "read");
    const all = await Promise.all([service.permissionOf(web, "octocat"), service.permissionOf(web, "octocat"), service.permissionOf(web, "octocat")]);
    expect(all).toEqual(["read", "read", "read"]);
    expect(getUserPermission).toHaveBeenCalledTimes(1);
  });
});

describe("fail closed", () => {
  it("denies when GitHub errors, logs why, and never caches the failure", async () => {
    let fail = true;
    const { service, getUserPermission } = setup(() => {
      if (fail) throw new Error("rate limited");
      return "admin";
    });
    expect(await service.permissionOf(web, "Octocat")).toBe("none");
    expect(logged(out)[0]).toMatchObject({ level: "warn", repo: "acme/web", username: "octocat", error: "rate limited" });
    fail = false;
    expect(await service.permissionOf(web, "octocat")).toBe("admin");
    expect(getUserPermission).toHaveBeenCalledTimes(2);
  });
  it("reports a non-Error rejection without leaking it", async () => {
    const { service } = setup(() => Promise.reject("boom with token=abc"));
    expect(await service.permissionOf(web, "octocat")).toBe("none");
    expect(logged(out)[0].error).toBe("unknown error");
  });
  it.each([undefined, null, "owner", "ADMIN", "__proto__", 7])("denies an unknown answer (%j) and does not cache it", async (answer) => {
    const { service, getUserPermission } = setup(() => answer);
    expect(await service.permissionOf(web, "octocat")).toBe("none");
    expect(await service.can(web, "octocat", "view")).toBe(false);
    expect(getUserPermission).toHaveBeenCalledTimes(2);
  });
  it("denies when GitHub does not answer in time", async () => {
    vi.useFakeTimers();
    const { service } = setup(() => new Promise(() => undefined));
    const pending = service.permissionOf(web, "octocat");
    await vi.advanceTimersByTimeAsync(PERMISSION_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("none");
    expect(logged(out)[0].error).toContain(`${PERMISSION_TIMEOUT_MS} ms`);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("clears the timer when GitHub answers in time", async () => {
    vi.useFakeTimers();
    const { service } = setup();
    expect(await service.permissionOf(web, "octocat")).toBe("read");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("denies when the provider throws synchronously", async () => {
    const service = createPermissionService({
      provider: {
        getUserPermission: () => {
          throw new Error("not even a promise");
        },
      },
    });
    expect(await service.permissionOf(web, "octocat")).toBe("none");
  });
});

describe("capabilities", () => {
  it("maps the cached permission to what the user can do", async () => {
    const { service } = setup((_repo, user) => (user === "boss" ? "maintain" : "triage"));
    expect([...(await service.capabilities(web, "boss"))].sort()).toEqual(["manage_hosts", "manage_secrets", "reindex", "view"]);
    expect(await service.can(web, "boss", "manage_secrets")).toBe(true);
    expect(await service.can(web, "dev", "view")).toBe(true);
    expect(await service.can(web, "dev", "manage_secrets")).toBe(false);
  });
});

describe("invalidate", () => {
  it("forgets one repository for every user", async () => {
    const { service, getUserPermission } = setup();
    await service.permissionOf(web, "octocat");
    await service.permissionOf(web, "hubot");
    await service.permissionOf(api, "octocat");
    service.invalidate({ repo: { owner: "ACME", name: "web" } });
    await service.permissionOf(web, "octocat");
    await service.permissionOf(web, "hubot");
    await service.permissionOf(api, "octocat");
    expect(getUserPermission).toHaveBeenCalledTimes(5);
  });
  it("forgets one user on every repository", async () => {
    const { service, getUserPermission } = setup();
    await service.permissionOf(web, "octocat");
    await service.permissionOf(api, "octocat");
    await service.permissionOf(web, "hubot");
    service.invalidate({ username: "OctoCat" });
    await service.permissionOf(web, "octocat");
    await service.permissionOf(api, "octocat");
    await service.permissionOf(web, "hubot");
    expect(getUserPermission).toHaveBeenCalledTimes(5);
  });
  it("forgets one user on one repository only", async () => {
    const { service, getUserPermission } = setup();
    await service.permissionOf(web, "octocat");
    await service.permissionOf(api, "octocat");
    await service.permissionOf(web, "hubot");
    service.invalidate({ repo: web, username: "octocat" });
    await service.permissionOf(web, "octocat");
    await service.permissionOf(api, "octocat");
    await service.permissionOf(web, "hubot");
    expect(getUserPermission).toHaveBeenCalledTimes(4);
  });
  it("forgets everything without arguments", async () => {
    const { service, getUserPermission } = setup();
    await service.permissionOf(web, "octocat");
    await service.permissionOf(api, "hubot");
    service.invalidate();
    await service.permissionOf(web, "octocat");
    await service.permissionOf(api, "hubot");
    expect(getUserPermission).toHaveBeenCalledTimes(4);
  });
  it("does not store an answer that was already in flight when the change happened", async () => {
    let release: (p: string) => void = () => undefined;
    let first = true;
    const { service, getUserPermission } = setup(() => {
      if (!first) return "none";
      first = false;
      return new Promise((resolve) => (release = resolve));
    });
    const stale = service.permissionOf(web, "octocat");
    await vi.waitFor(() => expect(getUserPermission).toHaveBeenCalledTimes(1));
    service.invalidate({ repo: web });
    release("admin");
    expect(await stale).toBe("admin");
    expect(await service.permissionOf(web, "octocat")).toBe("none");
    expect(getUserPermission).toHaveBeenCalledTimes(2);
  });
  it("does not let a request after the change join the earlier in-flight call", async () => {
    let release: (p: string) => void = () => undefined;
    let first = true;
    const { service, getUserPermission } = setup(() => {
      if (!first) return "none";
      first = false;
      return new Promise((resolve) => (release = resolve));
    });
    const stale = service.permissionOf(web, "octocat");
    await vi.waitFor(() => expect(getUserPermission).toHaveBeenCalledTimes(1));
    service.invalidate();
    expect(await service.permissionOf(web, "octocat")).toBe("none");
    release("admin");
    await stale;
    expect(await service.permissionOf(web, "octocat")).toBe("none");
  });
});
