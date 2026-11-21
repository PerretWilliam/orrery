// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootInstance } from "./boot";
import type { SetupStore } from "./store";

const store = (completed: boolean) => ({ isCompleted: async () => completed }) as SetupStore;
const lines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([line]) => JSON.parse(String(line)) as { level: string; msg: string });

afterEach(() => vi.restoreAllMocks());

describe("bootInstance", () => {
  it("migrates, then prints the generated token and where to use it", async () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const migrate = vi.fn(async () => undefined);
    await bootInstance({ databaseUrl: "postgres://x", migrate, seedAccess: async () => undefined, store: () => store(false), token: { token: "tok-123", source: "generated" } });
    expect(migrate).toHaveBeenCalledTimes(1);
    const [line] = lines(out);
    expect(line.msg).toContain("/setup");
    expect(line.msg).toContain("tok-123");
  });
  it("does not print a token taken from ORRERY_SETUP_TOKEN", async () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await bootInstance({ databaseUrl: "postgres://x", migrate: async () => undefined, seedAccess: async () => undefined, store: () => store(false), token: { token: "from-env-secret", source: "env" } });
    expect(out.mock.calls.join("")).not.toContain("from-env-secret");
    expect(lines(out)[0].msg).toContain("ORRERY_SETUP_TOKEN");
  });
  it("warns when the configured token was too weak to use", async () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await bootInstance({ databaseUrl: "postgres://x", migrate: async () => undefined, seedAccess: async () => undefined, store: () => store(false), token: { token: "t", source: "generated", warning: "too short" } });
    expect(lines(out).map((l) => [l.level, l.msg])[0]).toEqual(["warn", "too short"]);
    expect(lines(out)).toHaveLength(2);
  });
  it("prints nothing about setup once the instance is set up", async () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await bootInstance({ databaseUrl: "postgres://x", migrate: async () => undefined, seedAccess: async () => undefined, store: () => store(true), token: { token: "tok-123", source: "generated" } });
    expect(out).not.toHaveBeenCalled();
  });
  it("skips everything, with a warning, when there is no database", async () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const migrate = vi.fn();
    await bootInstance({ databaseUrl: undefined, migrate, seedAccess: async () => undefined, store: () => store(false), token: { token: "t", source: "generated" } });
    expect(migrate).not.toHaveBeenCalled();
    expect(lines(out)[0]).toMatchObject({ level: "warn" });
  });
  it("seeds the access policy after the migrations and before anything else", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const order: string[] = [];
    await bootInstance({
      databaseUrl: "postgres://x",
      migrate: async () => void order.push("migrate"),
      seedAccess: async () => void order.push("seed"),
      store: () => store(true),
      token: { token: "t", source: "generated" },
    });
    expect(order).toEqual(["migrate", "seed"]);
  });
  it("does not seed when a migration failed", async () => {
    const seedAccess = vi.fn();
    await expect(bootInstance({ databaseUrl: "postgres://x", migrate: async () => { throw new Error("x"); }, seedAccess, store: () => store(false), token: { token: "t", source: "generated" } })).rejects.toThrow();
    expect(seedAccess).not.toHaveBeenCalled();
  });
  it("lets a migration failure stop the start (a schema newer than the app must not boot)", async () => {
    await expect(
      bootInstance({ databaseUrl: "postgres://x", migrate: async () => { throw new Error("schema too new"); }, seedAccess: async () => undefined, store: () => store(false), token: { token: "t", source: "generated" } }),
    ).rejects.toThrow("schema too new");
  });
});
