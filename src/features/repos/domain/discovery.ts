import { configIssue, type ConfigIssue } from "@/features/config/domain/errors";
import type { FileResult } from "./git-provider";

/** The config files looked for at the root of the default branch, in priority order: the first one that exists wins. */
export const CONFIG_FILES = [".hub.yml", ".repo-hub.yml"] as const;
export type ConfigFile = (typeof CONFIG_FILES)[number];

export const MIN_POLL_SECONDS = 60;
export const DEFAULT_POLL_SECONDS = 300;

/** Polling period in milliseconds. Below one minute or not a number, the default applies: a typo must not hammer GitHub. */
export const pollIntervalMs = (seconds: number | null | undefined): number =>
  (Number.isFinite(seconds) && (seconds as number) >= MIN_POLL_SECONDS ? (seconds as number) : DEFAULT_POLL_SECONDS) * 1000;

/** What the Git host said about each candidate file, in `CONFIG_FILES` order. */
export type Candidates = Record<ConfigFile, FileResult>;

export type Choice = { file: ConfigFile; result: Exclude<FileResult, { kind: "absent" }> } | null;

const duplicate = () => configIssue("config_duplicate_file", "$", "Both .hub.yml and .repo-hub.yml exist; .hub.yml is used.");

/** The file the hub reads (`null` when the repository has none) and whether the other one exists too. */
export function chooseConfig(found: Candidates): { choice: Choice; both: boolean } {
  const present = CONFIG_FILES.flatMap((file) => {
    const result: FileResult = Reflect.get(found, file);
    return result.kind === "absent" ? [] : [{ file, result }];
  });
  return { choice: present[0] ?? null, both: present.length > 1 };
}

/** The stored issues without the duplicate-file warning, which is recomputed every time the repository is looked at. */
export const withoutWarning = (issues: readonly ConfigIssue[] | null): ConfigIssue[] => (issues ?? []).filter((issue) => issue.code !== "config_duplicate_file");

/** Parse issues plus the duplicate-file warning when both files exist; `null` when there is nothing to show. */
export function withWarning(issues: readonly ConfigIssue[] | null, both: boolean): ConfigIssue[] | null {
  const all = [...withoutWarning(issues), ...(both ? [duplicate()] : [])];
  return all.length === 0 ? null : all;
}

/** Only a push to the repository's default branch can change what the hub reads. */
export const isDefaultBranchPush = (ref: string, defaultBranch: string): boolean => ref === `refs/heads/${defaultBranch}`;
