// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { RETRY_MS, startPolling } from "./poller";

afterEach(() => vi.restoreAllMocks());

function setup({ webhooks = false, setup = true, seconds = 300, broken = false } = {}) {
  const timers: { task: () => void; ms: number; cancelled: boolean }[] = [];
  const syncAll = vi.fn(async () => ({ checked: 0, failed: 0 }));
  const settings = vi.fn(async () => {
    if (broken) throw "down";
    return { setup, pollIntervalSeconds: seconds };
  });
  const schedule = vi.fn((task: () => void, ms: number) => {
    const timer = { task, ms, cancelled: false };
    timers.push(timer);
    return () => void (timer.cancelled = true);
  });
  const stop = startPolling({ syncAll, settings, webhooks, schedule });
  const fire = async () => {
    const before = timers.length;
    timers.findLast((t) => !t.cancelled)!.task();
    await vi.waitFor(() => expect(timers.length).toBeGreaterThan(before));
  };
  return { syncAll, settings, schedule, timers, stop, fire, ready: () => vi.waitFor(() => expect(timers.length).toBeGreaterThan(0)) };
}

describe("without webhooks", () => {
  it("looks everywhere at once, then every polling period", async () => {
    const { syncAll, timers, fire, ready } = setup({ seconds: 120 });
    await ready();
    expect(syncAll).toHaveBeenCalledTimes(1);
    expect(timers[0].ms).toBe(120_000);
    await fire();
    expect(syncAll).toHaveBeenCalledTimes(2);
  });
  it("never goes below a minute, whatever is stored", async () => {
    const { timers, ready } = setup({ seconds: 5 });
    await ready();
    expect(timers[0].ms).toBe(300_000);
  });
  it("keeps its rhythm when a run fails, and says so", async () => {
    const log = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { syncAll, timers, ready } = setup({ seconds: 600 });
    syncAll.mockRejectedValueOnce(new Error("GitHub is down"));
    await ready();
    expect(timers[0].ms).toBe(600_000);
    expect(log.mock.calls.join("")).toContain("GitHub is down");
  });
});

describe("before the setup is finished", () => {
  it("looks at nothing and asks again in a minute, until it is", async () => {
    const { syncAll, settings, timers, fire, ready } = setup({ setup: false });
    await ready();
    expect(syncAll).not.toHaveBeenCalled();
    expect(timers[0].ms).toBe(RETRY_MS);
    settings.mockResolvedValue({ setup: true, pollIntervalSeconds: 300 });
    await fire();
    expect(syncAll).toHaveBeenCalledTimes(1);
    expect(timers[1].ms).toBe(300_000);
  });
  it("survives a failing database, without inventing a message for what is not an Error", async () => {
    const log = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { timers, ready } = setup({ broken: true });
    await ready();
    expect(timers[0].ms).toBe(RETRY_MS);
    expect(log.mock.calls.join("")).toContain("unknown error");
  });
});

describe("with webhooks", () => {
  it("looks everywhere once and then leaves it to the webhook", async () => {
    const { syncAll, timers } = setup({ webhooks: true });
    await vi.waitFor(() => expect(syncAll).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(timers).toEqual([]);
  });
  it("tries again in a minute when the first look fails", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { syncAll, timers, ready } = setup({ webhooks: true });
    syncAll.mockRejectedValueOnce(new Error("down"));
    await ready();
    expect(timers[0].ms).toBe(RETRY_MS);
    timers[0].task();
    await vi.waitFor(() => expect(syncAll).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(timers).toHaveLength(1);
  });
  it("waits for the setup like everybody else", async () => {
    const { syncAll, timers, ready } = setup({ webhooks: true, setup: false });
    await ready();
    expect(syncAll).not.toHaveBeenCalled();
    expect(timers[0].ms).toBe(RETRY_MS);
  });
});

describe("stop", () => {
  it("cancels the next look and prevents any other", async () => {
    const { syncAll, timers, stop, ready } = setup();
    await ready();
    stop();
    expect(timers[0].cancelled).toBe(true);
    expect(syncAll).toHaveBeenCalledTimes(1);
  });
  it("also stops a run that was in flight from scheduling another", async () => {
    let release = () => {};
    const syncAll = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const schedule = vi.fn(() => () => {});
    const stop = startPolling({ syncAll, settings: async () => ({ setup: true, pollIntervalSeconds: 300 }), webhooks: false, schedule });
    await vi.waitFor(() => expect(syncAll).toHaveBeenCalled());
    stop();
    release();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(schedule).not.toHaveBeenCalled();
  });
});
