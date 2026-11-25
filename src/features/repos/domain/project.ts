import type { RepoRef } from "./git-provider";

/** Cookie holding the last project page the user opened, so the hub reopens where they left. Not sensitive, and checked on use. */
export const LAST_PAGE_COOKIE = "orrery_last";

/** GitHub owner and repository names: letters, digits, `-`, `_` and `.`. Page ids are the schema's. */
const NAME = "[A-Za-z0-9_.-]{1,100}";
const PAGE = "[a-z][a-z0-9-]{0,63}";
const PATH = new RegExp(`^/p/(${NAME})/(${NAME})(?:/(${PAGE})(?:/(${PAGE}))?)?$`);

/** `list` is the list shown on a page made of GitHub lists. */
export type Place = RepoRef & { page: string | null; list?: string };

export const projectPath = (repo: RepoRef, page?: string, list?: string): string =>
  ["/p", ...[repo.owner, repo.name, page, list].filter((part) => part !== undefined).map(encodeURIComponent)].join("/");

/** The place named by a URL path of ours; `null` for anything else, so a forged cookie leads nowhere. */
export function parsePlace(path: string | undefined): Place | null {
  const found = PATH.exec(path ?? "");
  return found ? { owner: found[1], name: found[2], page: found[3] ?? null, ...(found[4] ? { list: found[4] } : {}) } : null;
}

/** The place in the cookie's value (a URL-encoded path). */
export function placeFromCookie(value: string | undefined): Place | null {
  try {
    return parsePlace(value === undefined ? undefined : decodeURIComponent(value));
  } catch {
    return null;
  }
}

export const cookieValueFor = (place: Place): string => encodeURIComponent(projectPath(place, place.page ?? undefined, place.list));

export const sameRepo = (a: RepoRef, b: RepoRef): boolean => a.owner.toLowerCase() === b.owner.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase();

/** The page asked for, or the first one when none is named; `null` when the id is unknown. */
export const pickPage = <T extends { id: string }>(pages: readonly T[], id: string | null | undefined): T | null =>
  id === null || id === undefined ? (pages[0] ?? null) : (pages.find((page) => page.id === id) ?? null);
