// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const store = { purgeUnusedSince: vi.fn(async () => 4) };
const startCachePurge = vi.fn((...[]: [unknown]) => () => {});
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db" }));
vi.mock("./drizzle-store", () => ({
  createHttpCacheStore: (db: unknown) => (db === "db" ? store : undefined),
}));
vi.mock("./purge-job", () => ({
  startCachePurge: (deps: unknown) => startCachePurge(deps),
}));

import { startCachePurgeJob } from "./runtime";

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
