// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const store = { purgeUnusedSince: vi.fn(async () => 4) };
const startCachePurge = vi.fn((...[]: [unknown]) => () => {});
const createSourceProxy = vi.fn((deps: unknown) => ({ deps }));
const fetchSource = vi.fn(async () => ({ data: 1 }));
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db" }));
vi.mock("./drizzle-store", () => ({
  createHttpCacheStore: (db: unknown) => (db === "db" ? store : undefined),
  createSsrfPolicyLoader: (db: unknown) => `policy:${db}`,
}));
vi.mock("./purge-job", () => ({ startCachePurge: (deps: unknown) => startCachePurge(deps) }));
vi.mock("./transport", () => ({ createNodeSend: () => "send" }));
vi.mock("../domain/fetch-source", () => ({ fetchSource: (...args: unknown[]) => (fetchSource as (...a: unknown[]) => unknown)(...args) }));
vi.mock("../domain/source-proxy", async (original) => ({ ...(await original<object>()), createSourceProxy: (deps: unknown) => createSourceProxy(deps) }));
vi.mock("@/features/secrets/server/drizzle-store", () => ({ createSecretsReader: (db: unknown) => `reader:${db}` }));
vi.mock("@/features/secrets/server/lookup", () => ({ createSecretLookup: (deps: { reader: string; keyring: () => unknown }) => ({ deps }) }));

import { getSourceProxy, startCachePurgeJob } from "./runtime";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const start = () => {
  startCachePurgeJob();
  return startCachePurge.mock.calls[0][0] as {
    purge: () => Promise<number>;
    schedule: (task: () => void, ms: number) => () => void;
  };
};

describe("startCachePurgeJob", () => {
  it("purges the cache table of the database", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(await start().purge()).toBe(4);
    expect(store.purgeUnusedSince).toHaveBeenCalledTimes(1);
  });
  it("schedules with a timer that does not keep the process alive, and that can be cancelled", () => {
    vi.useFakeTimers();
    try {
      const task = vi.fn();
      const cancel = start().schedule(task, 1000);
      vi.advanceTimersByTime(999);
      expect(task).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(task).toHaveBeenCalledTimes(1);
      const later = vi.fn();
      start().schedule(later, 1000)();
      vi.advanceTimersByTime(5000);
      expect(later).not.toHaveBeenCalled();
      cancel();
    } finally {
      vi.useRealTimers();
    }
  });
  it("returns what stops the job", () => {
    const stop = vi.fn();
    startCachePurge.mockReturnValueOnce(stop);
    expect(startCachePurgeJob()).toBe(stop);
  });
});

describe("getSourceProxy", () => {
  it("is one proxy per process, built on the real transport, the database stores and the project's secrets", async () => {
    const proxy = getSourceProxy();
    expect(getSourceProxy()).toBe(proxy);
    const deps = createSourceProxy.mock.calls[0][0] as { store: unknown; loadPolicy: unknown; loadSecrets: { deps: { reader: string } }; fetch: (...a: unknown[]) => Promise<unknown> };
    expect(deps.store).toBe(store);
    expect(deps.loadPolicy).toBe("policy:db");
    expect(deps.loadSecrets.deps.reader).toBe("reader:db");
    vi.stubEnv("ORRERY_ENCRYPTION_KEYS", `k1:${Buffer.alloc(32, 1).toString("base64")}`);
    expect((deps.loadSecrets.deps as unknown as { keyring: () => { activeId: string } }).keyring().activeId).toBe("k1");
    vi.unstubAllEnvs();
    const init = { method: "GET", headers: {} };
    await deps.fetch("https://a.test/", init, {});
    expect(fetchSource).toHaveBeenCalledWith("https://a.test/", init, {}, expect.objectContaining({ send: "send", resolve: expect.any(Function) }));
  });
});
