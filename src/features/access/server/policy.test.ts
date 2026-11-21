// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RepoPermission, RepoRef } from "@/features/repos/domain/git-provider";
import type { AllowEntry, ProjectRule } from "../domain/policy";
import { createAccessPolicy } from "./policy";
import { createPermissionService } from "./permissions";
import type { AccessStore } from "./store";

const web: RepoRef = { owner: "acme", name: "web" };
const HIDE: ProjectRule = { effect: "hide" };

type Setup = { allowlist?: AllowEntry[]; rules?: ProjectRule[]; permission?: string; orgs?: string[]; teams?: string[]; installed?: string[] };

function setup(opts: Setup = {}) {
  let clock = 1_000;
  const store = {
    allowlist: vi.fn(async () => opts.allowlist ?? []),
    rulesFor: vi.fn(async () => opts.rules ?? []),
    seedAllowlist: vi.fn(),
    grantAdmins: vi.fn(),
  } satisfies AccessStore;
  const git = {
    isInstallationMember: vi.fn(async (login: string) => (opts.installed ?? []).includes(login)),
    isOrgMember: vi.fn(async (org: string, login: string) => (opts.orgs ?? []).includes(`${org}:${login}`)),
    isTeamMember: vi.fn(async (org: string, slug: string, login: string) => (opts.teams ?? []).includes(`${org}/${slug}:${login}`)),
  };
  const getUserPermission = vi.fn(async () => (opts.permission ?? "read") as RepoPermission);
  const permissions = createPermissionService({ provider: { getUserPermission }, now: () => clock });
  const policy = createAccessPolicy({ store, git, permissions, cache: { now: () => clock } });
  return { policy, store, git, getUserPermission, advance: (ms: number) => (clock += ms) };
}

let out: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("sign-in", () => {
  it("defaults to the members of the accounts where the App is installed", async () => {
    const { policy, git } = setup({ installed: ["octocat"] });
    expect(await policy.canSignIn("OctoCat".toLowerCase())).toBe(true);
    expect(await policy.canSignIn("stranger")).toBe(false);
    expect(git.isOrgMember).not.toHaveBeenCalled();
  });
  it("uses the allowlist instead of the default as soon as it has entries", async () => {
    const { policy, git } = setup({ allowlist: [{ kind: "user", value: "hubot" }], installed: ["octocat"] });
    expect(await policy.canSignIn("octocat")).toBe(false);
    expect(await policy.canSignIn("HuBot")).toBe(true);
    expect(git.isInstallationMember).not.toHaveBeenCalled();
  });
  it("admits an organization member and a team member", async () => {
    const { policy } = setup({
      allowlist: [
        { kind: "org", value: "acme" },
        { kind: "team", value: "other/core" },
      ],
      orgs: ["acme:alice"],
      teams: ["other/core:bob"],
    });
    expect(await policy.canSignIn("alice")).toBe(true);
    expect(await policy.canSignIn("bob")).toBe(true);
    expect(await policy.canSignIn("mallory")).toBe(false);
  });
  it("refuses everyone when GitHub cannot be asked, and says why in the log", async () => {
    const { policy, git } = setup({ allowlist: [{ kind: "org", value: "acme" }] });
    git.isOrgMember.mockRejectedValue(new Error("rate limited"));
    expect(await policy.canSignIn("alice")).toBe(false);
    expect(JSON.parse(String(out.mock.calls[0][0]))).toMatchObject({ level: "warn", msg: "membership check failed, access denied", kind: "org", subject: "acme", username: "alice", error: "rate limited" });
  });
  it("refuses a malformed team entry", async () => {
    const { policy, git } = setup({ allowlist: [{ kind: "team", value: "no-slash" }] });
    expect(await policy.canSignIn("alice")).toBe(false);
    expect(git.isTeamMember).not.toHaveBeenCalled();
  });
  it("only believes a literal true from the Git host", async () => {
    const { policy, git } = setup({ allowlist: [{ kind: "org", value: "acme" }] });
    git.isOrgMember.mockResolvedValue("yes" as unknown as boolean);
    expect(await policy.canSignIn("alice")).toBe(false);
  });
  it("remembers a membership for 5 minutes", async () => {
    const { policy, git, advance } = setup({ installed: ["alice"] });
    await policy.canSignIn("alice");
    await policy.canSignIn("alice");
    advance(300_000);
    await policy.canSignIn("alice");
    expect(git.isInstallationMember).toHaveBeenCalledTimes(2);
  });
});

describe("project visibility and capabilities", () => {
  it("gives GitHub's capabilities when no rule narrows the project", async () => {
    const { policy } = setup({ permission: "maintain" });
    expect([...(await policy.capabilities(web, "alice"))].sort()).toEqual(["manage_hosts", "manage_secrets", "reindex", "view"]);
    expect(await policy.can(web, "alice", "manage_secrets")).toBe(true);
  });
  it("gives nothing for a project the policy hides, even to a maintainer", async () => {
    const { policy } = setup({ permission: "admin", rules: [HIDE] });
    expect((await policy.capabilities(web, "alice")).size).toBe(0);
    expect(await policy.can(web, "alice", "view")).toBe(false);
    expect(await policy.projectVisibleTo(web, "alice")).toBe(false);
  });
  it("restricts a project to the users and teams it names", async () => {
    const rules: ProjectRule[] = [
      { effect: "restrict_to", subject: { kind: "user", value: "alice" } },
      { effect: "restrict_to", subject: { kind: "team", value: "acme/core" } },
    ];
    const { policy } = setup({ rules, teams: ["acme/core:bob"] });
    expect(await policy.can(web, "Alice", "view")).toBe(true);
    expect(await policy.can(web, "bob", "view")).toBe(true);
    expect(await policy.can(web, "mallory", "view")).toBe(false);
  });
  it("never grants what GitHub does not: a listed user without access sees nothing and the policy is not even asked", async () => {
    const { policy, store } = setup({ permission: "none", rules: [{ effect: "restrict_to", subject: { kind: "user", value: "alice" } }] });
    expect((await policy.capabilities(web, "alice")).size).toBe(0);
    expect(store.rulesFor).not.toHaveBeenCalled();
  });
  it("hides the project when the team cannot be checked", async () => {
    const { policy, git } = setup({ rules: [{ effect: "restrict_to", subject: { kind: "team", value: "acme/core" } }] });
    git.isTeamMember.mockRejectedValue(new Error("boom"));
    expect(await policy.can(web, "bob", "view")).toBe(false);
  });
  it("lets a failure of the store surface instead of showing the project", async () => {
    const { policy, store } = setup();
    store.rulesFor.mockRejectedValue(new Error("db down"));
    await expect(policy.capabilities(web, "alice")).rejects.toThrow("db down");
  });
  it("treats a malformed team subject as no match", async () => {
    const { policy, git } = setup({ rules: [{ effect: "restrict_to", subject: { kind: "team", value: "oops" } }] });
    expect(await policy.can(web, "bob", "view")).toBe(false);
    expect(git.isTeamMember).not.toHaveBeenCalled();
  });
});

describe("invalidate", () => {
  async function warm() {
    const ctx = setup({ allowlist: [{ kind: "org", value: "acme" }], orgs: ["acme:alice", "acme:bob"] });
    await ctx.policy.canSignIn("alice");
    await ctx.policy.canSignIn("bob");
    await ctx.policy.capabilities(web, "alice");
    return ctx;
  }
  it("forgets one user's memberships and permissions, and only theirs", async () => {
    const { policy, git, getUserPermission } = await warm();
    policy.invalidate({ username: "ALICE" });
    await policy.canSignIn("alice");
    await policy.canSignIn("bob");
    await policy.capabilities(web, "alice");
    expect(git.isOrgMember).toHaveBeenCalledTimes(3);
    expect(getUserPermission).toHaveBeenCalledTimes(2);
  });
  it("forgets every membership for a member event, which names a repository and a user", async () => {
    const { policy, git } = await warm();
    policy.invalidate({ repo: web, username: "alice" });
    await policy.canSignIn("bob");
    expect(git.isOrgMember).toHaveBeenCalledTimes(3);
  });
  it("forgets every membership when a repository is named, since team rights changed", async () => {
    const { policy, git } = await warm();
    policy.invalidate({ repo: web });
    await policy.canSignIn("alice");
    await policy.canSignIn("bob");
    expect(git.isOrgMember).toHaveBeenCalledTimes(4);
  });
  it("forgets everything without a scope", async () => {
    const { policy, git, getUserPermission } = await warm();
    policy.invalidate();
    await policy.canSignIn("alice");
    await policy.capabilities(web, "alice");
    expect(git.isOrgMember).toHaveBeenCalledTimes(3);
    expect(getUserPermission).toHaveBeenCalledTimes(2);
  });
});
