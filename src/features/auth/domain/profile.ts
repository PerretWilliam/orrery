export type GithubProfile = { id: number; login: string; name?: string | null; avatar_url?: string | null };

/**
 * The hub user for a GitHub profile. The e-mail is always the GitHub no-reply form (lowercased, as Better Auth stores it): the App does not ask for the
 * "Email addresses" permission, authorization never uses e-mail, and nobody's address is stored.
 */
export const toHubUser = (profile: GithubProfile) => ({
  name: profile.name || profile.login,
  email: `${profile.id}+${profile.login}@users.noreply.github.com`.toLowerCase(),
  emailVerified: false,
  image: profile.avatar_url ?? undefined,
  githubId: profile.id,
  login: profile.login,
});
