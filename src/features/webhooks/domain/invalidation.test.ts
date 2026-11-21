import { describe, expect, it } from "vitest";
import { HANDLED_EVENTS, invalidationScopes, isHandledEvent } from "./invalidation";

const repository = { name: "Web", owner: { login: "Acme" } };
const REPO = { owner: "Acme", name: "Web" };
const EVERYTHING = [{}];

describe("isHandledEvent", () => {
  it("covers exactly the events that change who can see what", () => {
    expect([...HANDLED_EVENTS]).toEqual(["member", "membership", "team", "organization", "repository", "installation", "installation_repositories"]);
    for (const event of HANDLED_EVENTS) expect(isHandledEvent(event)).toBe(true);
    for (const event of ["push", "ping", "issues", "pull_request", "star", "", "Member", "constructor"]) expect(isHandledEvent(event)).toBe(false);
  });
});

describe("invalidationScopes", () => {
  it("member: that user on that repository", () => {
    expect(invalidationScopes("member", { action: "removed", repository, member: { login: "hubot" } })).toEqual([{ repo: REPO, username: "hubot" }]);
  });
  it("membership: that user everywhere", () => {
    expect(invalidationScopes("membership", { action: "removed", member: { login: "hubot" }, team: {} })).toEqual([{ username: "hubot" }]);
  });
  it.each(["member_added", "member_removed", "member_invited"])("organization %s: that user everywhere", (action) => {
    expect(invalidationScopes("organization", { action, membership: { user: { login: "hubot" } } })).toEqual([{ username: "hubot" }]);
  });
  it.each(["renamed", "deleted", "not_member_added", undefined, 7])("organization %j: everything", (action) => {
    expect(invalidationScopes("organization", { action, membership: { user: { login: "hubot" } } })).toEqual(EVERYTHING);
  });
  it("team: the repository it was added to or removed from, otherwise everything", () => {
    expect(invalidationScopes("team", { action: "added_to_repository", repository })).toEqual([{ repo: REPO }]);
    expect(invalidationScopes("team", { action: "edited", team: {} })).toEqual(EVERYTHING);
  });
  it.each(["created", "deleted", "archived", "privatized", "publicized", "edited"])("repository %s: that repository", (action) => {
    expect(invalidationScopes("repository", { action, repository })).toEqual([{ repo: REPO }]);
  });
  it.each(["renamed", "transferred"])("repository %s: everything, because the old name is stale too", (action) => {
    expect(invalidationScopes("repository", { action, repository })).toEqual(EVERYTHING);
  });
  it.each(["installation", "installation_repositories"])("%s: everything", (event) => {
    expect(invalidationScopes(event, { action: "added" })).toEqual(EVERYTHING);
  });
  it.each([
    ["member", { repository, member: {} }],
    ["member", { repository: { name: "", owner: { login: "a" } }, member: { login: "x" } }],
    ["member", { member: { login: "x" } }],
    ["membership", { member: { login: "" } }],
    ["membership", {}],
    ["team", { repository: { name: "x" } }],
    ["repository", { action: "created" }],
    ["organization", { action: "member_added", membership: {} }],
  ])("%s with an unexpected shape falls back to everything", (event, payload) => {
    expect(invalidationScopes(event, payload)).toEqual(EVERYTHING);
  });
  it.each([null, undefined, "text", 42, [], true])("falls back to everything for the payload %j", (payload) => {
    for (const event of HANDLED_EVENTS) expect(invalidationScopes(event, payload)).toEqual(EVERYTHING);
  });
});
