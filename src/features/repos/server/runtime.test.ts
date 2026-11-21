// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_CONTEXT } from "@/features/setup/server/service";
import { encrypt, parseKeyring } from "@/lib/crypto";

const KEYS = `k1:${Buffer.alloc(32, 3).toString("base64")}`;
const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const store = { credentials: vi.fn(), settings: vi.fn() };
const discovery = { syncAll: vi.fn(), refresh: vi.fn() };
const createDiscovery = vi.fn((...[]: [unknown]) => discovery);
const startPolling = vi.fn((...[]: [unknown]) => () => {});
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db" }));
vi.mock("./drizzle-store", () => ({ createRepoStore: (db: unknown) => (db === "db" ? store : undefined) }));
vi.mock("./discovery", () => ({ createDiscovery: (deps: unknown) => createDiscovery(deps) }));
vi.mock("./poller", () => ({ startPolling: (deps: unknown) => startPolling(deps) }));

import { discover, getDiscovery, getGitProvider, startDiscovery } from "./runtime";

beforeEach(() => vi.stubEnv("ORRERY_ENCRYPTION_KEYS", KEYS));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  for (const name of ["git-provider", "discovery"]) Reflect.deleteProperty(globalThis, Symbol.for(`orrery.${name}`));
});

describe("getGitProvider", () => {
  it("is shared by the whole process", () => {
    expect(getGitProvider()).toBe(getGitProvider());
  });
  it("signs in as the App with the stored key, decrypted with its own context", async () => {
    store.credentials.mockResolvedValue({ appId: "42", privateKeyCiphertext: encrypt(pem, parseKeyring(KEYS), SETTINGS_CONTEXT.privateKey) });
    const fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getGitProvider().listInstallations()).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/app/installations?per_page=100");
    const claims = JSON.parse(Buffer.from(String((init.headers as Record<string, string>).authorization).split(".")[1], "base64url").toString());
    expect(claims.iss).toBe("42");
  });
  it("cannot talk to GitHub before the setup has created the App", async () => {
    store.credentials.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getGitProvider().listInstallations()).rejects.toThrow("not set up");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not use a key encrypted for another purpose", async () => {
    store.credentials.mockResolvedValue({ appId: "42", privateKeyCiphertext: encrypt(pem, parseKeyring(KEYS), SETTINGS_CONTEXT.clientSecret) });
    await expect(getGitProvider().listInstallations()).rejects.toThrow();
  });
});

describe("getDiscovery", () => {
  it("is built once, on the shared adapter and the database", () => {
    expect(getDiscovery()).toBe(getDiscovery());
    expect(createDiscovery).toHaveBeenCalledTimes(1);
    expect(createDiscovery).toHaveBeenCalledWith(expect.objectContaining({ git: getGitProvider(), store }));
    const { now } = createDiscovery.mock.calls[0][0] as { now: () => Date };
    expect(now()).toBeInstanceOf(Date);
  });
});

describe("discover", () => {
  it("looks at everything, or at one repository, without making the caller wait", async () => {
    discovery.syncAll.mockResolvedValue({});
    discovery.refresh.mockResolvedValue({});
    discover("all");
    discover({ owner: "acme", name: "web" });
    await vi.waitFor(() => expect(discovery.refresh).toHaveBeenCalledWith({ owner: "acme", name: "web" }));
    expect(discovery.syncAll).toHaveBeenCalledTimes(1);
  });
  it("logs a failure instead of throwing", async () => {
    const log = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    discovery.syncAll.mockRejectedValueOnce(new Error("GitHub is down")).mockRejectedValueOnce("odd");
    discover("all");
    discover("all");
    await vi.waitFor(() => expect(log.mock.calls.join("")).toContain("unknown error"));
    expect(log.mock.calls.join("")).toContain("GitHub is down");
  });
});

describe("startDiscovery", () => {
  const start = () => {
    startDiscovery();
    return startPolling.mock.calls[0][0] as { syncAll: () => unknown; settings: () => unknown; webhooks: boolean; schedule: (task: () => void, ms: number) => () => void };
  };

  it("polls through the shared discovery and the stored settings", async () => {
    vi.stubEnv("ORRERY_PUBLIC_URL", "");
    store.settings.mockResolvedValue({ setup: true, pollIntervalSeconds: 300 });
    discovery.syncAll.mockResolvedValue("report");
    const deps = start();
    expect(deps.webhooks).toBe(false);
    expect(await deps.settings()).toEqual({ setup: true, pollIntervalSeconds: 300 });
    expect(await deps.syncAll()).toBe("report");
  });
  it("leaves it to the webhook when the hub has a public URL", () => {
    vi.stubEnv("ORRERY_PUBLIC_URL", "https://hub.example.com");
    expect(start().webhooks).toBe(true);
  });
  it("schedules with a timer that does not keep the process alive, and that can be cancelled", () => {
    vi.useFakeTimers();
    try {
      const task = vi.fn();
      start().schedule(task, 1000);
      vi.advanceTimersByTime(999);
      expect(task).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(task).toHaveBeenCalledTimes(1);
      const cancelled = vi.fn();
      start().schedule(cancelled, 1000)();
      vi.advanceTimersByTime(5000);
      expect(cancelled).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
