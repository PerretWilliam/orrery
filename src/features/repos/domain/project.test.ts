import { describe, expect, it } from "vitest";
import { cookieValueFor, parsePlace, pickPage, placeFromCookie, projectPath, sameRepo } from "./project";

describe("projectPath", () => {
  it("builds the URL of a project, and of one of its pages", () => {
    expect(projectPath({ owner: "acme", name: "web" })).toBe("/p/acme/web");
    expect(projectPath({ owner: "acme", name: "web" }, "overview")).toBe("/p/acme/web/overview");
    expect(projectPath({ owner: "acme", name: "web" }, "activity", "issues")).toBe("/p/acme/web/activity/issues");
  });
  it("encodes what it puts in the path", () => {
    expect(projectPath({ owner: "a/b", name: "c d" }, "x?y")).toBe("/p/a%2Fb/c%20d/x%3Fy");
  });
});

describe("parsePlace", () => {
  it("reads a project and a page", () => {
    expect(parsePlace("/p/acme/web")).toEqual({ owner: "acme", name: "web", page: null });
    expect(parsePlace("/p/Acme/my.repo_1/overview-2")).toEqual({ owner: "Acme", name: "my.repo_1", page: "overview-2" });
    expect(parsePlace("/p/acme/web/activity/issues")).toEqual({ owner: "acme", name: "web", page: "activity", list: "issues" });
  });
  it.each([
    [undefined],
    [""],
    ["/"],
    ["/p/acme"],
    ["/p/acme/web/"],
    ["/p/acme/web/Overview"],
    ["/p/acme/web/a/b/c"],
    ["/p/acme/web/a/B"],
    ["/x/acme/web"],
    ["//evil.test/p/acme/web"],
    ["/p/ac me/web"],
    ["/p/acme/web?x=1"],
    ["https://evil.test/p/acme/web"],
    ["/p/acme/web\n/x"],
    [`/p/${"a".repeat(101)}/web`],
    ["/p/acme/web/1page"],
  ])("refuses %j", (path) => {
    expect(parsePlace(path)).toBeNull();
  });
  it("accepts the longest names and page ids", () => {
    expect(parsePlace(`/p/${"a".repeat(100)}/${"b".repeat(100)}/a${"c".repeat(63)}`)).not.toBeNull();
    expect(parsePlace(`/p/acme/web/a${"c".repeat(64)}`)).toBeNull();
  });
});

describe("the cookie", () => {
  it("round-trips a place", () => {
    for (const place of [{ owner: "acme", name: "web", page: null }, { owner: "acme", name: "web", page: "ops" }, { owner: "acme", name: "web", page: "ops", list: "issues" }]) {
      expect(placeFromCookie(cookieValueFor(place))).toEqual(place);
    }
  });
  it("is nothing for a missing, malformed or forged value", () => {
    expect(placeFromCookie(undefined)).toBeNull();
    expect(placeFromCookie("%E0%A4%A")).toBeNull();
    expect(placeFromCookie(encodeURIComponent("https://evil.test"))).toBeNull();
  });
});

describe("sameRepo", () => {
  it("compares without case", () => {
    expect(sameRepo({ owner: "Acme", name: "Web" }, { owner: "acme", name: "web" })).toBe(true);
    expect(sameRepo({ owner: "acme", name: "web" }, { owner: "acme", name: "api" })).toBe(false);
    expect(sameRepo({ owner: "acme", name: "web" }, { owner: "other", name: "web" })).toBe(false);
  });
});

describe("pickPage", () => {
  const pages = [{ id: "overview" }, { id: "ops" }];
  it("takes the first page when none is named", () => {
    expect(pickPage(pages, null)).toBe(pages[0]);
    expect(pickPage(pages, undefined)).toBe(pages[0]);
  });
  it("finds a named page, and nothing for an unknown id", () => {
    expect(pickPage(pages, "ops")).toBe(pages[1]);
    expect(pickPage(pages, "nope")).toBeNull();
  });
  it("is null when there is no page at all", () => {
    expect(pickPage([], null)).toBeNull();
  });
});
