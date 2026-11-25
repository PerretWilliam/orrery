import { describe, expect, it } from "vitest";
import { activityItems, safeGithubUrl, toneOf } from "./activity";

describe("activityItems", () => {
  it("returns well-formed items and nothing for anything else", () => {
    const item = { key: "#1", title: "t", state: "open", by: null, url: "", at: null };
    expect(activityItems([item])).toEqual([item]);
    expect(activityItems([{ ...item, state: 3 }])).toEqual([]);
    expect(activityItems("no")).toEqual([]);
    expect(activityItems(null)).toEqual([]);
  });
});
describe("toneOf", () => {
  it.each([
    ["success", ["open", "success", "released"]],
    ["warning", ["queued", "requested", "waiting", "pending", "in_progress", "action_required", "prerelease"]],
    ["destructive", ["failure", "timed_out", "startup_failure"]],
    ["done", ["merged"]],
    ["neutral", ["closed", "draft", "cancelled", "skipped", "unknown", "", "constructor", "__proto__"]],
  ] as const)("is %s for its states", (tone, states) => {
    for (const state of states) expect(toneOf(state), state).toBe(tone);
  });
});
describe("safeGithubUrl", () => {
  it("allows https github.com links only", () => {
    expect(safeGithubUrl("https://github.com/a/b")).toBe("https://github.com/a/b");
    expect(safeGithubUrl("http://github.com/a")).toBeNull();
    expect(safeGithubUrl("https://github.com.evil.test/a")).toBeNull();
    expect(safeGithubUrl("javascript:alert(1)")).toBeNull();
    expect(safeGithubUrl("")).toBeNull();
  });
});
