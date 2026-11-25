import { afterEach, describe, expect, it, vi } from "vitest";
import type { SecretLookup } from "@/features/secrets/domain/resolve";
import { SsrfError, type SsrfPolicy } from "@/lib/ssrf-guard";
import { SourceError } from "./source-error";
import {
  type CacheEntry,
  type CacheStore,
  type ProxyDeps,
  type ProxyRequest,
  type SourceSpec,
  TOUCH_INTERVAL_MS,
  UNUSED_ENTRY_DAYS,
  cacheKey,
  createSourceProxy,
  purgeUnused,
} from "./source-proxy";

const T0 = Date.parse("2026-03-01T10:00:00Z");
const HOUR = 3600_000;
const REPO = "11111111-1111-1111-1111-111111111111";
const spec = (over: Partial<SourceSpec> = {}): SourceSpec => ({
  url: "https://api.example.com/stats",
  method: "GET",
  ttlSeconds: 60,
  ...over,
});
const req = (
  over: Partial<SourceSpec> = {},
  repositoryId = REPO,
): ProxyRequest => ({ repositoryId, source: spec(over) });

function memoryStore(initial: Record<string, CacheEntry> = {}) {
  const entries = new Map(Object.entries(initial));
  const store = {
    entries,
    get: vi.fn(async (key: string) => entries.get(key) ?? null),
    put: vi.fn(
      async (
        key: string,
        _repositoryId: string,
        entry: { body: unknown; fetchedAt: Date; expiresAt: Date },
      ) => {
        entries.set(key, { ...entry, lastAccessedAt: entry.fetchedAt });
      },
    ),
    touch: vi.fn(async () => undefined),
    purgeUnusedSince: vi.fn(async () => 0),
  };
  return store satisfies CacheStore & { entries: Map<string, CacheEntry> };
}

const secrets: Record<string, { value: string; boundHosts: string[] }> = {
  API_TOKEN: { value: "s3cr3t-value-123", boundHosts: ["api.example.com"] },
  OTHER: { value: "other-value-456", boundHosts: ["elsewhere.example.com"] },
};
const lookup: SecretLookup = (name) => Reflect.get(secrets, name);

function setup(
  over: Partial<ProxyDeps> = {},
  store = memoryStore(),
  clock = { now: T0 },
) {
  const fetch = vi.fn<ProxyDeps["fetch"]>(async () => ({ data: { v: 1 } }));
  const loadPolicy = vi.fn(async (): Promise<SsrfPolicy> => ({
    adminAllow: ["nas.lan"],
    projectAllow: [],
  }));
  const loadSecrets = vi.fn(async () => lookup);
  const proxy = createSourceProxy({
    store,
    fetch,
    loadPolicy,
    loadSecrets,
    now: () => clock.now,
    ...over,
  });
  return { proxy, store, fetch, loadPolicy, loadSecrets, clock };
}
const logged = () =>
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
afterEach(() => vi.restoreAllMocks());

describe("cacheKey", () => {
  it("is a stable SHA-256", () => {
    expect(cacheKey(req())).toMatch(/^[0-9a-f]{64}$/);
    expect(cacheKey(req())).toBe(cacheKey(req()));
  });
  it("changes with the project, the method, the URL, the headers and the body", () => {
    const keys = new Set([
      cacheKey(req()),
      cacheKey(req({}, "22222222-2222-2222-2222-222222222222")),
      cacheKey(req({ method: "POST" })),
      cacheKey(req({ url: "https://api.example.com/other" })),
      cacheKey(req({ url: "https://api.example.com/stats?x=1" })),
      cacheKey(req({ headers: { "x-a": "1" } })),
      cacheKey(req({ headers: { "x-a": "2" } })),
      cacheKey(req({ headers: { "x-b": "1" } })),
      cacheKey(req({ method: "POST", body: { q: 1 } })),
      cacheKey(req({ method: "POST", body: { q: 2 } })),
    ]);
    expect(keys.size).toBe(10);
  });
  it("does not depend on header order or on the case of header names", () => {
    expect(cacheKey(req({ headers: { "X-A": "1", "x-b": "2" } }))).toBe(
      cacheKey(req({ headers: { "X-B": "2", "x-a": "1" } })),
    );
  });
  it("does not depend on the TTL", () => {
    expect(cacheKey(req({ ttlSeconds: 10 }))).toBe(
      cacheKey(req({ ttlSeconds: 3600 })),
    );
  });
  it("keeps a missing body apart from nothing at all being a different request", () => {
    expect(cacheKey(req({ body: undefined }))).toBe(cacheKey(req()));
  });
  it("hashes the reference, never anything that could hold a secret value", () => {
    const key = cacheKey(
      req({ headers: { Authorization: "Bearer ${API_TOKEN}" } }),
    );
    expect(key).not.toContain("s3cr3t");
  });
});

describe("a request with no cache entry", () => {
  it("makes one request, stores the answer for its TTL and returns it", async () => {
    const { proxy, fetch, store } = setup();
    const result = await proxy.get(req());
    expect(result).toEqual({
      ok: true,
      state: "miss",
      data: { v: 1 },
      fetchedAt: new Date(T0),
      expiresAt: new Date(T0 + 60_000),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.put).toHaveBeenCalledWith(cacheKey(req()), REPO, {
      body: { v: 1 },
      fetchedAt: new Date(T0),
      expiresAt: new Date(T0 + 60_000),
    });
  });
  it("sends a GET with default headers and no body, using the policy of the project", async () => {
    const { proxy, fetch, loadPolicy } = setup();
    await proxy.get(req());
    expect(loadPolicy).toHaveBeenCalledWith(REPO);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/stats",
      {
        method: "GET",
        headers: { accept: "application/json", "user-agent": "Orrery" },
        body: undefined,
      },
      { adminAllow: ["nas.lan"], projectAllow: [] },
    );
  });
  it("sends a POST with its static JSON body and a JSON content type", async () => {
    const { proxy, fetch } = setup();
    await proxy.get(req({ method: "POST", body: { query: "{ stats }" } }));
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/stats",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "user-agent": "Orrery",
          "content-type": "application/json",
        },
        body: '{"query":"{ stats }"}',
      },
      expect.anything(),
    );
  });
  it("lets the source's own headers replace the defaults, whatever the case, without doubling them", async () => {
    const { proxy, fetch } = setup();
    await proxy.get(
      req({
        method: "POST",
        body: {},
        headers: {
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
          "X-Team": "a",
        },
      }),
    );
    expect(fetch.mock.calls[0]?.[1].headers).toEqual({
      accept: "application/vnd.api+json",
      "user-agent": "Orrery",
      "content-type": "application/vnd.api+json",
      "x-team": "a",
    });
  });
  it("uses the real clock by default", async () => {
    const before = Date.now();
    const result = await createSourceProxy({
      store: memoryStore(),
      fetch: async () => ({ data: 1 }),
      loadPolicy: async () => ({}),
      loadSecrets: async () => lookup,
    }).get(req());
    expect(result.ok && result.fetchedAt.getTime()).toBeGreaterThanOrEqual(
      before,
    );
    expect(result.ok && result.fetchedAt.getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
  });
});

describe("secrets", () => {
  const withToken = (over: Partial<SourceSpec> = {}) =>
    req({
      url: "https://api.example.com/stats?token=${API_TOKEN}",
      headers: { Authorization: "Bearer ${API_TOKEN}" },
      ...over,
    });
  it("resolves references in the query and the headers just before sending, from the project's own secrets", async () => {
    const { proxy, fetch, loadSecrets } = setup();
    await proxy.get(withToken());
    expect(loadSecrets).toHaveBeenCalledWith(REPO);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.com/stats?token=s3cr3t-value-123");
    expect(init?.headers.authorization).toBe("Bearer s3cr3t-value-123");
  });
  it("never puts a secret value in the cache, the key or the logs", async () => {
    const out = logged();
    const store = memoryStore();
    const { proxy } = setup({}, store);
    await proxy.get(withToken());
    const stored =
      JSON.stringify([...store.entries.entries()]) +
      JSON.stringify(store.put.mock.calls);
    expect(stored).not.toContain("s3cr3t");
    const failing = setup({
      fetch: async () =>
        Promise.reject(new Error("failed with s3cr3t-value-123")),
    });
    const result = await failing.proxy.get(withToken());
    expect(JSON.stringify(result)).not.toContain("s3cr3t");
    expect(out.mock.calls.join("")).not.toContain("s3cr3t");
  });
  it.each([
    [
      req({ url: "https://api.example.com/stats?token=${NOPE}" }),
      "secret_unknown",
    ],
    [
      req({ url: "https://api.example.com/stats?token=${OTHER}" }),
      "secret_host_not_bound",
    ],
    [
      req({ url: "https://api.example.com/${API_TOKEN}/stats" }),
      "secret_not_allowed_here",
    ],
    [
      req({ method: "POST", body: { q: "${API_TOKEN}" } }),
      "secret_not_allowed_here",
    ],
  ])(
    "sends nothing and says why when a secret cannot be used",
    async (request, code) => {
      const { proxy, fetch, store } = setup();
      const result = await proxy.get(request);
      expect(result).toMatchObject({
        ok: false,
        errors: [
          {
            code,
            fix: expect.any(String),
            message: expect.any(String),
            path: expect.any(String),
          },
        ],
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(store.put).not.toHaveBeenCalled();
    },
  );
  it("reports every problem, not just the first", async () => {
    const { proxy } = setup();
    const result = await proxy.get(
      req({ url: "https://api.example.com/stats?a=${NOPE}&b=${OTHER}" }),
    );
    expect(result.ok === false && result.errors.map((e) => e.code)).toEqual([
      "secret_unknown",
      "secret_host_not_bound",
    ]);
  });
});

describe("fresh and stale answers", () => {
  const key = cacheKey(req());
  const entry = (over: Partial<CacheEntry> = {}): CacheEntry => ({
    body: { v: "cached" },
    fetchedAt: new Date(T0 - 30_000),
    expiresAt: new Date(T0 + 30_000),
    lastAccessedAt: new Date(T0 - 1000),
    ...over,
  });

  it("answers from the cache without any request while the entry is fresh", async () => {
    const { proxy, fetch } = setup({}, memoryStore({ [key]: entry() }));
    expect(await proxy.get(req())).toEqual({
      ok: true,
      state: "fresh",
      data: { v: "cached" },
      fetchedAt: new Date(T0 - 30_000),
      expiresAt: new Date(T0 + 30_000),
    });
    await new Promise((done) => setTimeout(done, 5));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("is stale from the very millisecond the TTL is over", async () => {
    const { proxy, clock } = setup({}, memoryStore({ [key]: entry() }));
    clock.now = T0 + 30_000 - 1;
    expect(await proxy.get(req())).toMatchObject({ state: "fresh" });
    clock.now = T0 + 30_000;
    expect(await proxy.get(req())).toMatchObject({ state: "stale" });
  });
  it("answers at once with the old data and refreshes in the background", async () => {
    let release: (value: { data: unknown }) => void = () => {};
    const slow = vi.fn<ProxyDeps["fetch"]>(
      () => new Promise((done) => (release = done)),
    );
    const { proxy, store, clock } = setup(
      { fetch: slow },
      memoryStore({ [key]: entry({ expiresAt: new Date(T0 - 1) }) }),
    );
    const result = await proxy.get(req());
    expect(result).toMatchObject({
      ok: true,
      state: "stale",
      data: { v: "cached" },
    });
    await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(1));
    expect(store.put).not.toHaveBeenCalled();
    clock.now = T0 + 5000;
    release({ data: { v: "new" } });
    await vi.waitFor(() => expect(store.put).toHaveBeenCalledTimes(1));
    expect(await proxy.get(req())).toMatchObject({
      state: "fresh",
      data: { v: "new" },
      fetchedAt: new Date(T0 + 5000),
    });
  });
  it("keeps the old data, and answers stale again, when the refresh fails", async () => {
    logged();
    const failing = vi.fn<ProxyDeps["fetch"]>(async () =>
      Promise.reject(new SourceError("source_timeout")),
    );
    const { proxy, store } = setup(
      { fetch: failing },
      memoryStore({ [key]: entry({ expiresAt: new Date(T0 - 1) }) }),
    );
    expect(await proxy.get(req())).toMatchObject({
      state: "stale",
      data: { v: "cached" },
    });
    await vi.waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
    await new Promise((done) => setTimeout(done, 5));
    expect(await proxy.get(req())).toMatchObject({
      state: "stale",
      data: { v: "cached" },
    });
    expect(store.put).not.toHaveBeenCalled();
    expect(store.entries.get(key)?.body).toEqual({ v: "cached" });
  });
});

describe("coalescing", () => {
  it("shares one request between all the viewers of a missing entry", async () => {
    let release: (value: { data: unknown }) => void = () => {};
    const fetch = vi.fn<ProxyDeps["fetch"]>(
      () => new Promise((done) => (release = done)),
    );
    const { proxy } = setup({ fetch });
    const viewers = Array.from({ length: 10 }, () => proxy.get(req()));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    release({ data: "shared" });
    const results = await Promise.all(viewers);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.ok && r.data === "shared")).toBe(true);
  });
  it("shares one refresh between all the viewers of a stale entry", async () => {
    const key = cacheKey(req());
    let release: (value: { data: unknown }) => void = () => {};
    const fetch = vi.fn<ProxyDeps["fetch"]>(
      () => new Promise((done) => (release = done)),
    );
    const stale: CacheEntry = {
      body: "old",
      fetchedAt: new Date(T0 - 100_000),
      expiresAt: new Date(T0 - 1),
      lastAccessedAt: new Date(T0),
    };
    const { proxy, store } = setup({ fetch }, memoryStore({ [key]: stale }));
    const results = await Promise.all(
      Array.from({ length: 10 }, () => proxy.get(req())),
    );
    expect(results.every((r) => r.ok && r.state === "stale")).toBe(true);
    release({ data: "new" });
    await vi.waitFor(() => expect(store.put).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not share between different requests", async () => {
    const { proxy, fetch } = setup();
    await Promise.all([
      proxy.get(req()),
      proxy.get(req({ url: "https://api.example.com/other" })),
      proxy.get(req({}, "22222222-2222-2222-2222-222222222222")),
    ]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("shares the failure too, and asks again afterwards", async () => {
    logged();
    const fetch = vi.fn<ProxyDeps["fetch"]>(async () =>
      Promise.reject(new SourceError("source_unreachable")),
    );
    const { proxy } = setup({ fetch });
    const both = await Promise.all([proxy.get(req()), proxy.get(req())]);
    expect(both.every((r) => !r.ok)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    await proxy.get(req());
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("failures", () => {
  it.each([
    [new SourceError("source_timeout"), "source_timeout"],
    [new SourceError("source_too_large"), "source_too_large"],
    [new SsrfError("ssrf_address_blocked"), "ssrf_address_blocked"],
    [new SsrfError("ssrf_host_not_allowed"), "ssrf_host_not_allowed"],
  ])(
    "turns %s into a structured error and caches nothing",
    async (error, code) => {
      logged();
      const failing = vi.fn<ProxyDeps["fetch"]>(async () =>
        Promise.reject(error),
      );
      const { proxy, store } = setup({ fetch: failing });
      const result = await proxy.get(req());
      expect(result).toEqual({
        ok: false,
        errors: [
          {
            code,
            message: error.message,
            fix: (error as SourceError | SsrfError).fix,
          },
        ],
      });
      expect(store.put).not.toHaveBeenCalled();
      await proxy.get(req());
      expect(failing).toHaveBeenCalledTimes(2);
    },
  );
  it("hides what an unexpected error says", async () => {
    const out = logged();
    const { proxy } = setup({
      fetch: async () =>
        Promise.reject(
          new Error("connect ECONNREFUSED 10.0.0.9:5432 password=hunter2"),
        ),
    });
    const result = await proxy.get(req());
    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: "source_internal" }],
    });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(out.mock.calls.join("")).not.toContain("hunter2");
    expect(out.mock.calls.join("")).toContain(
      '"level":"warn","msg":"source request failed"',
    );
    expect(out.mock.calls.join("")).toContain('"code":"source_internal"');
  });
  it("hides a thrown value that is not an Error", async () => {
    logged();
    const { proxy } = setup({ fetch: async () => Promise.reject("boom") });
    expect(await proxy.get(req())).toMatchObject({
      ok: false,
      errors: [{ code: "source_internal" }],
    });
  });
  it("sends nothing when the policy cannot be loaded (fail closed)", async () => {
    logged();
    const { proxy, fetch } = setup({
      loadPolicy: async () => Promise.reject(new Error("db down")),
    });
    expect(await proxy.get(req())).toMatchObject({
      ok: false,
      errors: [{ code: "source_internal" }],
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends nothing when the secrets cannot be loaded (fail closed)", async () => {
    logged();
    const { proxy, fetch } = setup({
      loadSecrets: async () => Promise.reject(new Error("db down")),
    });
    expect(await proxy.get(req())).toMatchObject({
      ok: false,
      errors: [{ code: "source_internal" }],
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads the policy again for every request, so a change applies at once", async () => {
    const { proxy, loadPolicy, store } = setup();
    await proxy.get(req());
    store.entries.clear();
    await proxy.get(req());
    expect(loadPolicy).toHaveBeenCalledTimes(2);
  });
});

describe("a broken cache does not break the data", () => {
  it("still makes the request when the cache cannot be read", async () => {
    const out = logged();
    const store = memoryStore();
    store.get.mockRejectedValue(new Error("db down"));
    const { proxy, fetch } = setup({}, store);
    expect(await proxy.get(req())).toMatchObject({
      ok: true,
      state: "miss",
      data: { v: 1 },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(out.mock.calls.join("")).toContain(
      "could not read the source cache",
    );
  });
  it("describes a read failure that is not an Error", async () => {
    const out = logged();
    const store = memoryStore();
    store.get.mockRejectedValue("db down");
    await setup({}, store).proxy.get(req());
    expect(out.mock.calls.join("")).toContain("unknown error");
  });
  it("still returns the data when it cannot be written", async () => {
    const out = logged();
    const store = memoryStore();
    store.put.mockRejectedValue(new Error("db down"));
    const { proxy } = setup({}, store);
    expect(await proxy.get(req())).toMatchObject({
      ok: true,
      state: "miss",
      data: { v: 1 },
    });
    expect(out.mock.calls.join("")).toContain(
      "could not write the source cache",
    );
  });
  it("describes a write failure that is not an Error", async () => {
    const out = logged();
    const store = memoryStore();
    store.put.mockRejectedValue("db down");
    await setup({}, store).proxy.get(req());
    expect(out.mock.calls.join("")).toContain("unknown error");
  });
});

describe("last access", () => {
  const key = cacheKey(req());
  const read = async (lastAccessedAgoMs: number) => {
    const entry: CacheEntry = {
      body: 1,
      fetchedAt: new Date(T0 - 1000),
      expiresAt: new Date(T0 + 60_000),
      lastAccessedAt: new Date(T0 - lastAccessedAgoMs),
    };
    const store = memoryStore({ [key]: entry });
    await setup({}, store).proxy.get(req());
    return store;
  };
  it("is only written when it is more than an hour old", async () => {
    expect(TOUCH_INTERVAL_MS).toBe(HOUR);
    expect((await read(HOUR)).touch).not.toHaveBeenCalled();
    expect((await read(HOUR + 1)).touch).toHaveBeenCalledWith(
      key,
      new Date(T0),
    );
  });
  it("also counts a stale read", async () => {
    const store = memoryStore({
      [key]: {
        body: 1,
        fetchedAt: new Date(T0 - HOUR * 3),
        expiresAt: new Date(T0 - 1),
        lastAccessedAt: new Date(T0 - HOUR * 2),
      },
    });
    await setup({}, store).proxy.get(req());
    expect(store.touch).toHaveBeenCalledTimes(1);
  });
  it("does not make a read fail when the write fails", async () => {
    const out = logged();
    const entry: CacheEntry = {
      body: 1,
      fetchedAt: new Date(T0 - 1000),
      expiresAt: new Date(T0 + 60_000),
      lastAccessedAt: new Date(T0 - 2 * HOUR),
    };
    const store = memoryStore({ [key]: entry });
    store.touch.mockRejectedValue(new Error("db down"));
    expect(await setup({}, store).proxy.get(req())).toMatchObject({
      ok: true,
      state: "fresh",
    });
    await vi.waitFor(() =>
      expect(out.mock.calls.join("")).toContain(
        "could not touch the source cache",
      ),
    );
  });
  it("describes a touch failure that is not an Error", async () => {
    const out = logged();
    const store = memoryStore({
      [key]: {
        body: 1,
        fetchedAt: new Date(T0),
        expiresAt: new Date(T0 + 60_000),
        lastAccessedAt: new Date(T0 - 2 * HOUR),
      },
    });
    store.touch.mockRejectedValue("db down");
    await setup({}, store).proxy.get(req());
    await vi.waitFor(() =>
      expect(out.mock.calls.join("")).toContain("unknown error"),
    );
  });
});

describe("purge", () => {
  it("forgets entries not read for 7 days and says how many", async () => {
    const out = logged();
    const store = memoryStore();
    store.purgeUnusedSince.mockResolvedValue(3);
    expect(UNUSED_ENTRY_DAYS).toBe(7);
    expect(await setup({}, store).proxy.purge()).toBe(3);
    expect(store.purgeUnusedSince).toHaveBeenCalledWith(
      new Date(T0 - 7 * 24 * HOUR),
    );
    expect(out.mock.calls.join("")).toContain(
      '"level":"info","msg":"purged unused source cache entries","removed":3',
    );
  });
  it("uses the real clock by default", async () => {
    logged();
    const store = memoryStore();
    await purgeUnused(store);
    const cutoff = (
      store.purgeUnusedSince.mock.calls[0] as unknown as [Date]
    )[0].getTime();
    expect(Math.abs(cutoff - (Date.now() - 7 * 24 * HOUR))).toBeLessThan(5000);
  });
});

describe("preview (a dry run)", () => {
  it("asks the source now, ignoring and leaving the cache alone", async () => {
    const store = memoryStore({
      [cacheKey(req())]: {
        body: { old: 1 },
        fetchedAt: new Date(T0),
        expiresAt: new Date(T0 + 60_000),
        lastAccessedAt: new Date(T0),
      },
    });
    const { proxy, fetch } = setup({}, store);
    const result = await proxy.preview(req());
    expect(result).toMatchObject({ ok: true, data: { v: 1 } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.get).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });
  it("applies the secret binding and returns failures instead of throwing", async () => {
    const { proxy, fetch } = setup();
    const unbound = await proxy.preview(
      req({ headers: { authorization: "Bearer ${OTHER}" } }),
    );
    expect(unbound.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRejectedValue(new Error("boom"));
    expect(await proxy.preview(req())).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: "source_internal" })],
    });
  });
});
