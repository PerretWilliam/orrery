import type { GitProviderInterface } from "@/features/repos/domain/git-provider";

const unavailable = () => Promise.reject(new Error("The GitHub adapter is not available yet"));

/**
 * Stands in for GitHub until the Octokit adapter exists. Every question fails, and a failure is a denial, so until then
 * only instance admins can sign in and nobody has access to a project.
 */
export const unavailableGit: Pick<GitProviderInterface, "getUserPermission" | "isInstallationMember" | "isOrgMember" | "isTeamMember"> = {
  getUserPermission: unavailable,
  isInstallationMember: unavailable,
  isOrgMember: unavailable,
  isTeamMember: unavailable,
};
