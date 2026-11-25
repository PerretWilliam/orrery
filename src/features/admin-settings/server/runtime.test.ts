// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const record = vi.fn(async () => {});
const store = { isAdmin: vi.fn(async () => true), allowlist: vi.fn(async () => []), hosts: vi.fn(async () => []), admins: vi.fn(async () => ["octo"]), rules: vi.fn(async () => []), addHost: vi.fn(async () => true), staleSecrets: vi.fn(async () => []), appCiphertexts: vi.fn(async () => ({})), saveAppCiphertexts: vi.fn(async () => {}) };
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db" }));
vi.mock("./drizzle-store", () => ({ createAdminStore: (db: unknown) => (db === "db" ? store : undefined) }));
vi.mock("@/features/audit/server/runtime", () => ({ getAudit: () => ({ record }) }));

import { getAdminSettings } from "./runtime";

afterEach(() => vi.clearAllMocks());
const actor = { userId: "u1", login: "octo" };

describe("getAdminSettings", () => {
  it("is one service per process, on the database, the keys of the environment and the audit log", async () => {
    vi.stubEnv("ORRERY_ENCRYPTION_KEYS", `k1:${Buffer.alloc(32, 1).toString("base64")}`);
    const admin = getAdminSettings();
    expect(getAdminSettings()).toBe(admin);
    expect(await admin.overview(actor)).toMatchObject({ key: { active: "k1", pending: 0 } });
    await admin.apply(actor, { type: "host_add", host: "a.com" });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ event: "allowlist_changed" }));
    expect(await admin.apply(actor, { type: "rotate_keys" })).toEqual({ ok: true });
    vi.unstubAllEnvs();
  });
});
