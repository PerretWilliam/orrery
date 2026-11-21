import { describe, expect, it, vi } from "vitest";
import { parseAdminLogins, parseAllowlist, projectVisible, signInAllowed, splitTeam, type ProjectRule } from "./policy";

describe("parseAdminLogins", () => {
  it("lowercases, trims, de-duplicates and accepts commas and new lines", () => {
    expect(parseAdminLogins(" OctoCat, hubot\nocto-cat,octocat ")).toEqual({ items: ["octocat", "hubot", "octo-cat"], problems: [] });
  });
  it("is empty when the variable is not set", () => {
    expect(parseAdminLogins(undefined)).toEqual({ items: [], problems: [] });
    expect(parseAdminLogins(" , ,\n")).toEqual({ items: [], problems: [] });
  });
  it.each(["-bad", "bad_name", "a b", "x".repeat(40), "acme/devs", "ünï", "'; drop table", "bot[bot]"])("reports %j instead of adding it", (value) => {
    expect(parseAdminLogins(`ok,${value}`)).toEqual({ items: ["ok"], problems: [value.toLowerCase()] });
  });
  it("accepts a 39-character login", () => {
    expect(parseAdminLogins("a".repeat(39)).items).toEqual(["a".repeat(39)]);
  });
});

describe("parseAllowlist", () => {
  it("reads organizations, teams and users", () => {
    expect(parseAllowlist("org:Acme, team:acme/Core-Devs,user:OctoCat")).toEqual({
      items: [
        { kind: "org", value: "acme" },
        { kind: "team", value: "acme/core-devs" },
        { kind: "user", value: "octocat" },
      ],
      problems: [],
    });
  });
  it("keeps one entry for a repeated one", () => {
    expect(parseAllowlist("org:acme\nORG:acme").items).toEqual([{ kind: "org", value: "acme" }]);
  });
  it("is empty when the variable is not set", () => {
    expect(parseAllowlist(undefined)).toEqual({ items: [], problems: [] });
  });
  it.each(["acme", "org:", ":acme", "group:acme", "org:acme:extra", "org:acme/devs", "team:acme", "team:/devs", "team:acme/", "team:a/b/c", "user:bad name", "org:-x", "team:acme/dev s"])(
    "reports %j and never widens the list",
    (value) => {
      expect(parseAllowlist(`user:ok,${value}`)).toEqual({ items: [{ kind: "user", value: "ok" }], problems: [value] });
    },
  );
  it("allows dots and underscores in a team slug only", () => {
    expect(parseAllowlist("team:acme/team_v1.2").items).toHaveLength(1);
    expect(parseAllowlist("org:acme.io").problems).toEqual(["org:acme.io"]);
  });
});

describe("splitTeam", () => {
  it("splits organization and slug", () => {
    expect(splitTeam("acme/devs")).toEqual({ org: "acme", slug: "devs" });
  });
  it.each(["acme", "/devs", "acme/", "a/b/c", ""])("rejects %j", (value) => {
    expect(splitTeam(value)).toBeNull();
  });
});

const user = (value: string): ProjectRule => ({ effect: "restrict_to", subject: { kind: "user", value } });
const team = (value: string): ProjectRule => ({ effect: "restrict_to", subject: { kind: "team", value } });
const HIDE: ProjectRule = { effect: "hide" };

describe("projectVisible", () => {
  const nobody = vi.fn(async () => false);
  it("leaves the project to GitHub when there is no rule", async () => {
    expect(await projectVisible([], nobody)).toBe(true);
    expect(nobody).not.toHaveBeenCalled();
  });
  it("hides the project from everyone", async () => {
    const everyone = vi.fn(async () => true);
    expect(await projectVisible([HIDE], everyone)).toBe(false);
    expect(everyone).not.toHaveBeenCalled();
  });
  it("lets an explicit hide win over a matching restrict_to", async () => {
    expect(await projectVisible([user("octocat"), HIDE], async () => true)).toBe(false);
    expect(await projectVisible([HIDE, user("octocat")], async () => true)).toBe(false);
  });
  it("shows a restricted project only to the subjects it names", async () => {
    const rules = [user("octocat"), team("acme/devs")];
    expect(await projectVisible(rules, async (s) => s.kind === "user" && s.value === "octocat")).toBe(true);
    expect(await projectVisible(rules, async (s) => s.kind === "team" && s.value === "acme/devs")).toBe(true);
    expect(await projectVisible(rules, async () => false)).toBe(false);
  });
  it("stops asking once one subject matches", async () => {
    const asked = vi.fn(async () => true);
    await projectVisible([user("a"), user("b"), user("c")], asked);
    expect(asked).toHaveBeenCalledTimes(1);
  });
  it("asks about every subject until one matches", async () => {
    const asked = vi.fn(async (s: { value: string }) => s.value === "c");
    expect(await projectVisible([user("a"), user("b"), user("c")], asked)).toBe(true);
    expect(asked).toHaveBeenCalledTimes(3);
  });
});

describe("signInAllowed", () => {
  const user1 = { kind: "user", value: "octocat" } as const;
  const org1 = { kind: "org", value: "acme" } as const;
  it("uses the default rule when the allowlist is empty", async () => {
    const matches = vi.fn(async () => true);
    expect(await signInAllowed([], matches, async () => true)).toBe(true);
    expect(await signInAllowed([], matches, async () => false)).toBe(false);
    expect(matches).not.toHaveBeenCalled();
  });
  it("ignores the default rule once the allowlist has entries", async () => {
    const fallback = vi.fn(async () => true);
    expect(await signInAllowed([user1], async () => false, fallback)).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
  });
  it("accepts when one entry matches, and stops there", async () => {
    const matches = vi.fn(async (entry: { kind: string }) => entry.kind === "user");
    expect(await signInAllowed([user1, org1], matches, async () => false)).toBe(true);
    expect(matches).toHaveBeenCalledTimes(1);
    expect(await signInAllowed([org1, user1], matches, async () => false)).toBe(true);
  });
});
