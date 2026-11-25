// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const createSetupStore = vi.fn(() => ({ isCompleted: async () => false }));
const runMigrations = vi.fn(async () => undefined);
const startDiscovery = vi.fn();
vi.mock("@/features/repos/server/runtime", () => ({ startDiscovery: () => startDiscovery() }));
const startCachePurgeJob = vi.fn();
vi.mock("@/features/data-proxy/server/runtime", () => ({ startCachePurgeJob: () => startCachePurgeJob() }));
vi.mock("./drizzle-store", () => ({ createSetupStore: (...a: unknown[]) => createSetupStore(...(a as [])) }));
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db-handle" }));
vi.mock("@/lib/db/migrate", () => ({ runMigrations: (...a: unknown[]) => runMigrations(...(a as [])) }));

import { getSetupService } from "./runtime";
import { startInstance } from "./start";

afterEach(() => {
  startDiscovery.mockClear();
  startCachePurgeJob.mockClear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, Symbol.for("orrery.setupToken"));
});

describe("getSetupService", () => {
  it("wires the store on the database handle and exposes the wizard's operations", async () => {
    const service = getSetupService();
    expect(createSetupStore).toHaveBeenCalledWith("db-handle");
    expect(await service.isCompleted()).toBe(false);
  });
  it("reads the encryption keys from the environment, only when needed", async () => {
    vi.stubEnv("ORRERY_ENCRYPTION_KEYS", "");
    const service = getSetupService();
    const login = await service.login("nope");
    expect(login).toMatchObject({ ok: false, issue: { code: "setup_token_invalid" } });
  });
  it("uses the current time and the global fetch for GitHub", async () => {
    vi.stubEnv("ORRERY_SETUP_TOKEN", "z".repeat(40));
    vi.stubEnv("ORRERY_ENCRYPTION_KEYS", `k1:${Buffer.alloc(32, 7).toString("base64")}`);
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return { status: 404, json: async () => ({}) };
    });
    const service = getSetupService();
    const login = await service.login("z".repeat(40));
    if (!login.ok) throw new Error("login failed");
    const begun = await service.begin(login.session, "http://localhost:3000", false);
    if (!begun.ok) throw new Error("begin failed");
    const result = await service.complete(login.session, begun.state, "abcdef1234567890");
    expect(result).toMatchObject({ ok: false, issue: { code: "setup_github_failed" } });
    expect(calls).toEqual(["https://api.github.com/app-manifests/abcdef1234567890/conversions"]);
    vi.unstubAllGlobals();
  });
});

describe("startInstance", () => {
  it("migrates the database and announces the setup on a fresh instance", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await startInstance();
    expect(runMigrations).toHaveBeenCalledWith("db-handle");
    expect(out.mock.calls.join("")).toContain("/setup");
    expect(startDiscovery).toHaveBeenCalledTimes(1);
    expect(startCachePurgeJob).toHaveBeenCalledTimes(1);
  });
  it("does nothing without a database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    runMigrations.mockClear();
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await startInstance();
    expect(runMigrations).not.toHaveBeenCalled();
    expect(startDiscovery).not.toHaveBeenCalled();
  });
});
