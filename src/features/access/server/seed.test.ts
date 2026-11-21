// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedAccess } from "./seed";
import type { AccessStore } from "./store";

const lines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);

function run(env: Record<string, string | undefined>, added = 0) {
  const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const store = { grantAdmins: vi.fn(async () => undefined), seedAllowlist: vi.fn(async () => added), allowlist: vi.fn(), rulesFor: vi.fn() } satisfies AccessStore;
  return seedAccess({ env, store }).then(() => ({ store, out }));
}

afterEach(() => vi.restoreAllMocks());

describe("seedAccess", () => {
  it("does nothing, quietly, when neither variable is set", async () => {
    const { store, out } = await run({});
    expect(store.grantAdmins).toHaveBeenCalledWith([]);
    expect(store.seedAllowlist).toHaveBeenCalledWith([]);
    expect(out).not.toHaveBeenCalled();
  });
  it("grants the admins and seeds the allowlist, and says so", async () => {
    const { store, out } = await run({ ORRERY_ADMINS: "OctoCat, hubot", ORRERY_SIGNIN_ALLOWLIST: "org:acme,user:alice" }, 2);
    expect(store.grantAdmins).toHaveBeenCalledWith(["octocat", "hubot"]);
    expect(store.seedAllowlist).toHaveBeenCalledWith([
      { kind: "org", value: "acme" },
      { kind: "user", value: "alice" },
    ]);
    expect(lines(out)).toEqual([expect.objectContaining({ level: "info", entries: 2 })]);
  });
  it("stays quiet when the allowlist already had entries", async () => {
    const { out } = await run({ ORRERY_SIGNIN_ALLOWLIST: "org:acme" }, 0);
    expect(out).not.toHaveBeenCalled();
  });
  it("skips what it cannot read, with a warning that names it", async () => {
    const { store, out } = await run({ ORRERY_ADMINS: "ok,not a user", ORRERY_SIGNIN_ALLOWLIST: "org:acme,everyone,team:x" }, 1);
    expect(store.grantAdmins).toHaveBeenCalledWith(["ok"]);
    expect(store.seedAllowlist).toHaveBeenCalledWith([{ kind: "org", value: "acme" }]);
    const warnings = lines(out).filter((l) => l.level === "warn");
    expect(warnings.map((w) => w.entries)).toEqual([["not a user"], ["everyone", "team:x"]]);
  });
});
