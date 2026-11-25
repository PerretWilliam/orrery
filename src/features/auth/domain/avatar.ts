/** The only host avatars come from; `next.config.ts` lets the image optimizer fetch it and nothing else. */
export const AVATAR_HOST = "avatars.githubusercontent.com";

/** A stored avatar URL, only when it is a GitHub avatar over https. It comes from outside, so anything else is dropped. */
export function avatarUrl(image: string | null | undefined): string | null {
  const url = image ? URL.parse(image) : null;
  return url && url.protocol === "https:" && url.host === AVATAR_HOST && url.pathname.startsWith("/u/") ? url.href : null;
}
