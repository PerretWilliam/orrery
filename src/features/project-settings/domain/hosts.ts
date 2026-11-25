import { parseAllowEntry } from "@/lib/ssrf-guard";

/**
 * Error catalog of the project settings. Same shape as the other catalogs: codes are never renamed or reused once released.
 */
export const SETTINGS_ERRORS = {
  settings_invalid_host: { fix: "Give a host name such as api.example.com, or a suffix such as *.example.com: no scheme, port, path, address or range." },
  settings_reindex_failed: { fix: "GitHub could not be reached. Try again in a moment; the project keeps its last valid config meanwhile." },
} as const;
export type SettingsErrorCode = keyof typeof SETTINGS_ERRORS;

export const MAX_PROJECT_HOSTS = 50;

/**
 * A project can only narrow the instance's rules, so only names are accepted: an address or a range would be an
 * attempt to open something, which belongs to the instance admin. Returns the normalized host, or `null`.
 */
export function cleanProjectHost(input: string): string | null {
  const rule = parseAllowEntry(input);
  if (rule?.kind === "host") return rule.name;
  if (rule?.kind === "suffix") return `*.${rule.suffix}`;
  return null;
}

/** Where a project's settings live. Names are encoded: they come from the URL and from GitHub, never trusted as a path. */
export const settingsPath = (project: { owner: string; name: string }, tail = ""): string =>
  `/settings/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.name)}${tail}`;
