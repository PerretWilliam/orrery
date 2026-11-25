import { describe, expect, it } from "vitest";
import { activityItems, safeGithubUrl } from "./activity";

describe("activityItems", () => {
  it("returns well-formed items and nothing for anything else", () => {
    const item = { key: "#1", title: "t", state: "open", by: null, url: "", at: null };
    expect(activityItems([item])).toEqual([item]);
    expect(activityItems([{ ...item, state: 3 }])).toEqual([]);
    expect(activityItems("no")).toEqual([]);
    expect(activityItems(null)).toEqual([]);
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
