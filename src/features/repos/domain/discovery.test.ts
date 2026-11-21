import { describe, expect, it } from "vitest";
import { configIssue } from "@/features/config/domain/errors";
import { chooseConfig, DEFAULT_POLL_SECONDS, isDefaultBranchPush, MIN_POLL_SECONDS, pollIntervalMs, withoutWarning, withWarning, type Candidates } from "./discovery";

const found = { kind: "found", content: "version: 1", etag: "e", sha: "s" } as const;
const absent = { kind: "absent" } as const;
const unchanged = { kind: "unchanged" } as const;
const files = (hub: Candidates[".hub.yml"], legacy: Candidates[".repo-hub.yml"]): Candidates => ({ ".hub.yml": hub, ".repo-hub.yml": legacy });

describe("pollIntervalMs", () => {
  it("keeps a valid period, one minute included", () => {
    expect(pollIntervalMs(MIN_POLL_SECONDS)).toBe(60_000);
    expect(pollIntervalMs(900)).toBe(900_000);
  });
  it.each([[59], [0], [-5], [Number.NaN], [Infinity], [null], [undefined]])("falls back to five minutes for %s", (value) => {
    expect(pollIntervalMs(value)).toBe(DEFAULT_POLL_SECONDS * 1000);
  });
});

describe("chooseConfig", () => {
  it("finds nothing when neither file exists", () => {
    expect(chooseConfig(files(absent, absent))).toEqual({ choice: null, both: false });
  });
  it("uses .repo-hub.yml when it is the only one", () => {
    expect(chooseConfig(files(absent, found))).toEqual({ choice: { file: ".repo-hub.yml", result: found }, both: false });
  });
  it("uses .hub.yml when it is the only one, unchanged or not", () => {
    expect(chooseConfig(files(found, absent))).toEqual({ choice: { file: ".hub.yml", result: found }, both: false });
    expect(chooseConfig(files(unchanged, absent))).toEqual({ choice: { file: ".hub.yml", result: unchanged }, both: false });
  });
  it("lets .hub.yml win and says both exist", () => {
    expect(chooseConfig(files(found, unchanged))).toEqual({ choice: { file: ".hub.yml", result: found }, both: true });
  });
});

describe("the duplicate-file warning", () => {
  const parse = configIssue("config_required", "project.name", "Required");
  it("is added to the issues, once", () => {
    const issues = withWarning(withWarning([parse], true), true);
    expect(issues?.map((issue) => issue.code)).toEqual(["config_required", "config_duplicate_file"]);
    expect(issues?.[1]).toMatchObject({ path: "$", message: "Both .hub.yml and .repo-hub.yml exist; .hub.yml is used." });
  });
  it("is removed when only one file is left, and nothing left means null", () => {
    expect(withWarning(withWarning(null, true), false)).toBeNull();
    expect(withWarning([parse], false)).toEqual([parse]);
    expect(withWarning(null, false)).toBeNull();
  });
  it("is the only thing withoutWarning takes out", () => {
    expect(withoutWarning(null)).toEqual([]);
    expect(withoutWarning(withWarning([parse], true))).toEqual([parse]);
  });
});

describe("isDefaultBranchPush", () => {
  it("accepts only the default branch", () => {
    expect(isDefaultBranchPush("refs/heads/main", "main")).toBe(true);
    expect(isDefaultBranchPush("refs/heads/feature", "main")).toBe(false);
    expect(isDefaultBranchPush("refs/tags/main", "main")).toBe(false);
    expect(isDefaultBranchPush("refs/heads/main2", "main")).toBe(false);
  });
});
