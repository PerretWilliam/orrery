// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAccessPolicy } from "./registry";

const store = { allowlist: vi.fn(async () => []), rulesFor: vi.fn(), seedAllowlist: vi.fn(), grantAdmins: vi.fn() };
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db" }));
const git = { getUserPermission: vi.fn(), isInstallationMember: vi.fn(), isOrgMember: vi.fn(), isTeamMember: vi.fn() };
vi.mock("@/features/repos/server/runtime", () => ({ getGitProvider: () => git }));
vi.mock("./drizzle-store", () => ({ createAccessStore: (db: unknown) => (db === "db" ? store : undefined) }));

import { getAccessPolicy } from "./runtime";

afterEach(() => {
  registerAccessPolicy(undefined);
  vi.restoreAllMocks();
});

describe("getAccessPolicy", () => {
  it("is created once and shared", () => {
    expect(getAccessPolicy()).toBe(getAccessPolicy());
  });
  it("denies sign-in and project access while GitHub cannot be asked, such as before the setup", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    git.isInstallationMember.mockRejectedValue(new Error("The GitHub App is not set up yet"));
    git.getUserPermission.mockRejectedValue(new Error("The GitHub App is not set up yet"));
    const policy = getAccessPolicy();
    expect(await policy.canSignIn("alice")).toBe(false);
    expect((await policy.capabilities({ owner: "acme", name: "web" }, "alice")).size).toBe(0);
  });
  it("asks GitHub, through the adapter of the process, who may sign in and what they may do", async () => {
    store.rulesFor.mockResolvedValue([]);
    git.isInstallationMember.mockResolvedValue(true);
    git.getUserPermission.mockResolvedValue("maintain");
    const policy = getAccessPolicy();
    expect(await policy.canSignIn("alice")).toBe(true);
    expect(git.isInstallationMember).toHaveBeenCalledWith("alice");
    expect(await policy.can({ owner: "acme", name: "web" }, "alice", "manage_secrets")).toBe(true);
    expect(git.getUserPermission).toHaveBeenCalledWith({ owner: "acme", name: "web" }, "alice");
  });
});
