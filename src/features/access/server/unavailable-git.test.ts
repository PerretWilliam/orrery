import { describe, expect, it } from "vitest";
import { unavailableGit } from "./unavailable-git";

describe("unavailableGit", () => {
  it("fails every question, so the policy denies", async () => {
    const repo = { owner: "acme", name: "web" };
    await expect(unavailableGit.getUserPermission(repo, "alice")).rejects.toThrow("not available");
    await expect(unavailableGit.isInstallationMember("alice")).rejects.toThrow("not available");
    await expect(unavailableGit.isOrgMember("acme", "alice")).rejects.toThrow("not available");
    await expect(unavailableGit.isTeamMember("acme", "devs", "alice")).rejects.toThrow("not available");
  });
});
