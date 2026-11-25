import { describe, expect, it } from "vitest";
import { cleanProjectHost, settingsPath } from "./hosts";

describe("cleanProjectHost", () => {
  it("normalizes names and suffixes", () => {
    expect(cleanProjectHost(" API.Example.com ")).toBe("api.example.com");
    expect(cleanProjectHost("*.Example.com")).toBe("*.example.com");
  });
  it.each(["10.0.0.5", "10.0.0.0/8", "fd00::/8", "https://a.com", "a.com:80", "a.com/x", "", "*.", "-a.com"])("refuses %j: a project never opens anything", (bad) => {
    expect(cleanProjectHost(bad)).toBeNull();
  });
});

describe("settingsPath", () => {
  it("encodes the names", () => {
    expect(settingsPath({ owner: "a b", name: "c/d" })).toBe("/settings/a%20b/c%2Fd");
    expect(settingsPath({ owner: "a", name: "b" }, "/x")).toBe("/settings/a/b/x");
  });
});
