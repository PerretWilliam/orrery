// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const store = { append: vi.fn(), list: vi.fn(), purge: vi.fn(async () => 2) };
const authStore = { isAdmin: vi.fn(async (login: string) => login === "ada") };
const startCachePurge = vi.fn((...[]: [unknown]) => () => {});
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db" }));
vi.mock("./drizzle-store", () => ({ createAuditStore: (db: unknown) => (db === "db" ? store : undefined) }));
vi.mock("@/features/auth/server/drizzle-store", () => ({ createAuthStore: (db: unknown) => (db === "db" ? authStore : undefined) }));
vi.mock("@/features/data-proxy/server/purge-job", () => ({ startCachePurge: (deps: unknown) => startCachePurge(deps) }));

import { getAudit, startAuditPurgeJob } from "./runtime";

afterEach(() => vi.clearAllMocks());

describe("getAudit", () => {
  it("is one audit per process, on the database store, with admins from the auth store", async () => {
    const audit = getAudit();
    expect(getAudit()).toBe(audit);
    store.list.mockResolvedValue([]);
    expect(await audit.list("ada")).toEqual([]);
    expect(await audit.list("eve")).toBeNull();
  });
});

describe("startAuditPurgeJob", () => {
  const start = () => {
    startAuditPurgeJob();
    return startCachePurge.mock.calls[0][0] as { purge: () => Promise<number>; schedule: (task: () => void, ms: number) => () => void };
  };
  it("purges the audit log past its retention", async () => {
    expect(await start().purge()).toBe(2);
  });
  it("schedules with a timer that does not keep the process alive, and that can be cancelled", () => {
    vi.useFakeTimers();
    try {
      const task = vi.fn();
      const cancel = start().schedule(task, 1000);
      cancel();
      vi.advanceTimersByTime(2000);
      expect(task).not.toHaveBeenCalled();
      start().schedule(task, 1000);
      vi.advanceTimersByTime(1000);
      expect(task).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("returns what stops the job", () => {
    const stop = vi.fn();
    startCachePurge.mockReturnValueOnce(stop);
    expect(startAuditPurgeJob()).toBe(stop);
  });
});
