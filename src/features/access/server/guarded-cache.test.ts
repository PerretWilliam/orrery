// @vitest-environment node
import "next/dist/server/node-environment-baseline";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE_TIMEOUT_MS, CACHE_TTL_MS, createGuardedCache } from "./guarded-cache";

beforeEach(() => void vi.spyOn(process.stdout, "write").mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());

describe("createGuardedCache", () => {
  it("keeps answers 5 minutes and waits 5 seconds for a lookup", () => {
    expect([CACHE_TTL_MS, CACHE_TIMEOUT_MS]).toEqual([300_000, 5_000]);
  });
  it("forgets everything when invalidated without a filter", async () => {
    const cache = createGuardedCache({ deny: false, what: "check" });
    const load = vi.fn(async () => true);
    await cache.get("a", load, {});
    await cache.get("b", load, {});
    cache.invalidate();
    await cache.get("a", load, {});
    await cache.get("b", load, {});
    expect(load).toHaveBeenCalledTimes(4);
  });
  it("forgets only the keys the filter accepts", async () => {
    const cache = createGuardedCache({ deny: false, what: "check" });
    const load = vi.fn(async () => true);
    await cache.get("a", load, {});
    await cache.get("b", load, {});
    cache.invalidate((key) => key === "a");
    await cache.get("a", load, {});
    await cache.get("b", load, {});
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("answers the deny value, logs what failed and does not cache it", async () => {
    const out = vi.mocked(process.stdout.write);
    const cache = createGuardedCache({ deny: "none", what: "permission check" });
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("rate limited")).mockResolvedValue("admin");
    expect(await cache.get("k", load, { repo: "acme/web" })).toBe("none");
    expect(JSON.parse(String(out.mock.calls[0][0]))).toMatchObject({ msg: "permission check failed, access denied", repo: "acme/web", error: "rate limited" });
    expect(await cache.get("k", load, {})).toBe("admin");
  });
  it("never starts a lookup inside a prerender, so a real request cannot join one that Next will not answer", async () => {
    const prerender = new AbortController();
    const cache = createGuardedCache({ deny: false, what: "check" });
    // What fetch() does in a prerender: nothing is sent, and it rejects once the prerender is over.
    const unanswered = vi.fn(() => new Promise<boolean>((_, reject) => prerender.signal.addEventListener("abort", () => reject(new Error("prerender complete")))));
    const store = { type: "prerender-runtime", phase: "render", renderSignal: prerender.signal };
    const prefetched = workAsyncStorage.run({ route: "/" } as never, () => workUnitAsyncStorage.run(store as never, () => cache.get("k", unanswered, {})));
    const abandoned = expect(prefetched).rejects.toMatchObject({ digest: "HANGING_PROMISE_REJECTION" });
    const real = cache.get("k", async () => true, {});
    prerender.abort();
    expect(await real).toBe(true);
    await abandoned;
    expect(unanswered).not.toHaveBeenCalled();
  });
});
