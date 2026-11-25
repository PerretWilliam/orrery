// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const can = vi.fn(async () => true);
const refresh = vi.fn(async () => ({ checked: 1, failed: 0 }));
const record = vi.fn(async () => {});
const store = { repositoryId: vi.fn(async () => "r1"), hosts: vi.fn(async () => []), addHost: vi.fn(async () => true), removeHost: vi.fn(async () => true) };
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db" }));
vi.mock("./drizzle-store", () => ({ createProjectSettingsStore: (db: unknown) => (db === "db" ? store : undefined) }));
vi.mock("@/features/access/server/runtime", () => ({ getAccessPolicy: () => ({ can }) }));
vi.mock("@/features/audit/server/runtime", () => ({ getAudit: () => ({ record }) }));
vi.mock("@/features/repos/server/runtime", () => ({ getDiscovery: () => ({ refresh }) }));

import { getProjectSettings } from "./runtime";

afterEach(() => vi.clearAllMocks());
const repo = { owner: "acme", name: "web" };
const actor = { userId: "u1", login: "octo" };

describe("getProjectSettings", () => {
  it("is one service per process, on the access policy, a forced re-index and the audit log", async () => {
    const settings = getProjectSettings();
    expect(getProjectSettings()).toBe(settings);
    expect(await settings.overview(repo, actor)).toMatchObject({ hosts: [] });
    expect(can).toHaveBeenCalledWith(repo, "octo", "manage_hosts");
    expect(await settings.reindex(repo, actor)).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledWith(repo, { force: true });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ event: "reindex_forced" }));
    await settings.addHost(repo, actor, "a.com");
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ event: "allowlist_changed" }));
  });
});
