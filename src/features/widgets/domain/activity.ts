import type { ActivityItem } from "@/features/repos/domain/activity";

const text = (value: unknown): value is string => typeof value === "string";
const maybe = (value: unknown): value is string | null => value === null || typeof value === "string";
const isItem = (value: unknown): value is ActivityItem => {
  const item = value as Record<string, unknown> | null;
  return typeof item === "object" && item !== null && text(item.key) && text(item.title) && text(item.state) && maybe(item.by) && text(item.url) && maybe(item.at);
};

/** The items a GitHub widget was given. Re-checked here, so a malformed answer shows nothing rather than half a list. */
export const activityItems = (data: unknown): ActivityItem[] => (Array.isArray(data) && data.every(isItem) ? data : []);

/** A link only when it stays on github.com over https; anything else is plain text. */
export const safeGithubUrl = (url: string): string | null => (url.startsWith("https://github.com/") ? url : null);
