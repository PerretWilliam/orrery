import { describe, expect, it } from "vitest";
import { can, capabilitiesOf, isRepoPermission, repoKey, userKey } from "./capabilities";

const list = (permission: unknown) => [...capabilitiesOf(permission)].sort();

describe("capabilitiesOf", () => {
  it.each(["read", "triage", "write"])("lets %s see the project and nothing else", (permission) => {
    expect(list(permission)).toEqual(["view"]);
  });
  it.each(["maintain", "admin"])("lets %s manage secrets, hosts and re-indexing too", (permission) => {
    expect(list(permission)).toEqual(["manage_hosts", "manage_secrets", "reindex", "view"]);
  });
  it("grants nothing to none", () => {
    expect(list("none")).toEqual([]);
  });
  it.each([undefined, null, 42, {}, "", "owner", "ADMIN", "Admin", "__proto__", "constructor", "toString", "hasOwnProperty"])(
    "grants nothing for the unknown value %j (fail closed)",
    (value) => {
      expect(list(value)).toEqual([]);
      expect(isRepoPermission(value)).toBe(false);
    },
  );
  it("returns a fresh set each time, so a caller cannot widen another caller's rights", () => {
    const first = capabilitiesOf("read") as Set<string>;
    first.add("manage_secrets");
    expect(list("read")).toEqual(["view"]);
  });
});

describe("can", () => {
  it("checks one capability", () => {
    expect(can("maintain", "manage_secrets")).toBe(true);
    expect(can("write", "manage_secrets")).toBe(false);
    expect(can("none", "view")).toBe(false);
    expect(can("nonsense", "view")).toBe(false);
  });
});

describe("keys", () => {
  it("ignores case on both repository and user", () => {
    expect(repoKey({ owner: "Acme", name: "Web" })).toBe("acme/web");
    expect(userKey("OctoCat")).toBe("octocat");
  });
});
