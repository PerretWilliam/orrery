type Entry = { href: string };
export type NavProject = { href: string; pages: readonly (Entry & { lists: readonly Entry[] })[]; settingsHref: string | null };

/**
 * The sidebar entry a URL path shows: a project's address is its first page, a page of lists is its first list, and
 * everything under a project's settings is its settings entry. Repository names ignore case, as on GitHub.
 */
export function currentEntry(pathname: string, projects: readonly NavProject[]): string | undefined {
  const path = pathname.toLowerCase();
  for (const project of projects) {
    const settings = project.settingsHref;
    if (settings && `${path}/`.startsWith(`${settings.toLowerCase()}/`)) return settings;
    const targets = (page: NavProject["pages"][number]) => (page.lists.length > 0 ? page.lists : [page]);
    if (path === project.href.toLowerCase()) return project.pages.flatMap(targets)[0]?.href;
    for (const page of project.pages) {
      const found = page.href.toLowerCase() === path ? targets(page)[0] : targets(page).find((entry) => entry.href.toLowerCase() === path);
      if (found) return found.href;
    }
  }
  return undefined;
}
