import { afterEach, describe, expect, it, vi } from "vitest";
import { PURGE_INTERVAL_MS, startCachePurge } from "./purge-job";

afterEach(() => vi.restoreAllMocks());

function harness(purge: () => Promise<number>) {
  const cancel = vi.fn();
  const tasks: Array<{ task: () => void; ms: number }> = [];
  const schedule = vi.fn((task: () => void, ms: number) => {
    tasks.push({ task, ms });
    return cancel;
  });
  return {
    stop: startCachePurge({ purge, schedule }),
    schedule,
    tasks,
    cancel,
  };
}
const flush = () => new Promise((done) => setTimeout(done, 0));

describe("startCachePurge", () => {
  it("purges at once, then again every day", async () => {
    const purge = vi.fn(async () => 1);
    const { tasks } = harness(purge);
    await flush();
    expect(PURGE_INTERVAL_MS).toBe(24 * 3600_000);
    expect(purge).toHaveBeenCalledTimes(1);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.ms).toBe(PURGE_INTERVAL_MS);
    tasks[0]?.task();
    await flush();
    expect(purge).toHaveBeenCalledTimes(2);
    expect(tasks).toHaveLength(2);
  });
  it("logs a failed purge and still tries again the next day", async () => {
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const { tasks } = harness(async () => Promise.reject(new Error("db down")));
    await flush();
    expect(out.mock.calls.join("")).toContain("db down");
    expect(tasks).toHaveLength(1);
  });
  it("describes a failure that is not an Error", async () => {
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    harness(async () => Promise.reject("nope"));
    await flush();
    expect(out.mock.calls.join("")).toContain("unknown error");
  });
  it("a run still in progress when stopped schedules nothing", async () => {
    let finish: (n: number) => void = () => {};
    const { stop, tasks } = harness(
      () => new Promise((done) => (finish = done)),
    );
    stop();
    finish(0);
    await flush();
    expect(tasks).toHaveLength(0);
  });
  it("cancels the pending run when stopped between two purges", async () => {
    const { stop, cancel } = harness(async () => 0);
    await flush();
    stop();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
