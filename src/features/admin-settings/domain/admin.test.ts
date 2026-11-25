import { describe, expect, it } from "vitest";
import { ADMIN_ERRORS, parseAction } from "./admin";

const parse = (fields: Record<string, string>) => parseAction((name) => fields[name] ?? "");

describe("parseAction", () => {
  it("reads one sign-in entry, normalized, and refuses lists, bad kinds and junk", () => {
    expect(parse({ action: "allow_add", value: " Org:Acme " })).toEqual({ type: "allow_add", entry: { kind: "org", value: "acme" } });
    expect(parse({ action: "allow_remove", value: "team:acme/devs" })).toEqual({ type: "allow_remove", entry: { kind: "team", value: "acme/devs" } });
    for (const value of ["org:a,org:b", "acme", "org:-bad", "", "org:a,nope"]) expect(parse({ action: "allow_add", value })).toBeNull();
  });
  it("reads a private host, suffix, address or range, lowercased, and refuses anything else", () => {
    for (const value of ["Intranet.Corp", "*.corp", "10.0.0.0/8", "::1", "192.168.1.5"]) expect(parse({ action: "host_add", value })).toEqual({ type: "host_add", host: value.toLowerCase() });
    expect(parse({ action: "host_remove", value: "a.com" })).toEqual({ type: "host_remove", host: "a.com" });
    for (const value of ["http://a.com", "a.com/path", "", "10.0.0.0/99", `${"a".repeat(300)}.com`]) expect(parse({ action: "host_add", value })).toBeNull();
  });
  it("reads one admin login and refuses several or invalid ones", () => {
    expect(parse({ action: "admin_add", value: "Octocat" })).toEqual({ type: "admin_add", login: "octocat" });
    expect(parse({ action: "admin_remove", value: "octocat" })).toEqual({ type: "admin_remove", login: "octocat" });
    for (const value of ["a,b", "-x", ""]) expect(parse({ action: "admin_add", value })).toBeNull();
  });
  it("reads a project rule: hide, or restrict to a user or a team", () => {
    expect(parse({ action: "rule_add", value: "acme/web", effect: "hide" })).toEqual({ type: "rule_add", project: { owner: "acme", name: "web" }, rule: { effect: "hide" } });
    expect(parse({ action: "rule_remove", value: "acme/web", effect: "restrict_to", subject: "Team:acme/devs" })).toEqual({ type: "rule_remove", project: { owner: "acme", name: "web" }, rule: { effect: "restrict_to", subject: { kind: "team", value: "acme/devs" } } });
    expect(parse({ action: "rule_add", value: "acme/web", effect: "restrict_to", subject: "user:octo" })).toMatchObject({ rule: { subject: { kind: "user" } } });
  });
  it("refuses a rule with a bad project, effect or subject", () => {
    const ok = { action: "rule_add", value: "acme/web", effect: "hide" };
    for (const bad of [{ value: "acme" }, { value: "a/b/c" }, { value: "a b/c" }, { value: "/web" }, { effect: "other" }, { effect: "restrict_to", subject: "org:acme" }, { effect: "restrict_to", subject: "" }, { effect: "restrict_to", subject: "user:a,user:b" }]) {
      expect(parse({ ...ok, ...bad } as Record<string, string>)).toBeNull();
    }
  });
  it("knows the key rotation, and nothing else", () => {
    expect(parse({ action: "rotate_keys" })).toEqual({ type: "rotate_keys" });
    expect(parse({ action: "drop_database" })).toBeNull();
    expect(parse({})).toBeNull();
  });
  it("has a fix for every error code", () => {
    for (const { fix } of Object.values(ADMIN_ERRORS)) expect(fix.length).toBeGreaterThan(10);
  });
});
