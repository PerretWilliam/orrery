import type { ActivityItem } from "@/features/repos/domain/activity";

const text = (value: unknown): value is string => typeof value === "string";
const maybe = (value: unknown): value is string | null => value === null || typeof value === "string";
const isItem = (value: unknown): value is ActivityItem => {
  const item = value as Record<string, unknown> | null;
  return typeof item === "object" && item !== null && text(item.key) && text(item.title) && text(item.state) && maybe(item.by) && text(item.url) && maybe(item.at);
};

/** The items a GitHub widget was given. Re-checked here, so a malformed answer shows nothing rather than half a list. */
export const activityItems = (data: unknown): ActivityItem[] => (Array.isArray(data) && data.every(isItem) ? data : []);

export type Tone = "success" | "warning" | "destructive" | "done" | "neutral";

const TONES = new Map<string, Tone>([
  ...["open", "success", "released"].map((state) => [state, "success"] as const),
  ...["queued", "requested", "waiting", "pending", "in_progress", "action_required", "prerelease"].map((state) => [state, "warning"] as const),
  ...["failure", "timed_out", "startup_failure"].map((state) => [state, "destructive"] as const),
  ["merged", "done"],
]);

/** What a GitHub state means, for its colour. Closed, draft, cancelled, skipped and anything unknown stay neutral. */
export const toneOf = (state: string): Tone => TONES.get(state) ?? "neutral";

/** A link only when it stays on github.com over https; anything else is plain text. */
export const safeGithubUrl = (url: string): string | null => (url.startsWith("https://github.com/") ? url : null);
