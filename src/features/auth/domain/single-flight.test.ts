import { describe, expect, it, vi } from "vitest";
import { singleFlight } from "./single-flight";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe("singleFlight", () => {
  it("runs once for concurrent callers of the same key and gives them the same result", async () => {
    const flight = singleFlight<string>();
    const gate = deferred<string>();
    const run = vi.fn(() => gate.promise);
    const results = Promise.all([flight("a", run), flight("a", run), flight("a", run)]);
    gate.resolve("token");
    expect(await results).toEqual(["token", "token", "token"]);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("does not share between different keys", async () => {
    const flight = singleFlight<string>();
    const run = vi.fn(async () => "x");
    await Promise.all([flight("a", run), flight("b", run)]);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("runs again once the previous call is over, after a success or a failure", async () => {
    const flight = singleFlight<string>();
    const run = vi.fn(async () => "ok");
    await flight("a", run);
    await flight("a", run);
    expect(run).toHaveBeenCalledTimes(2);
    const failing = vi.fn(async (): Promise<string> => { throw new Error("boom"); });
    await expect(flight("b", failing)).rejects.toThrow("boom");
    await expect(flight("b", failing)).rejects.toThrow("boom");
    expect(failing).toHaveBeenCalledTimes(2);
  });
  it("gives the same failure to every concurrent caller", async () => {
    const flight = singleFlight<string>();
    const gate = deferred<string>();
    const first = flight("a", () => gate.promise);
    const second = flight("a", () => gate.promise);
    gate.reject(new Error("refused"));
    await expect(first).rejects.toThrow("refused");
    await expect(second).rejects.toThrow("refused");
  });
});
