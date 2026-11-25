// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const can = vi.fn(async () => true);
const store = { repositoryId: vi.fn(async () => "r1"), list: vi.fn(async () => []), save: vi.fn(), remove: vi.fn() };
vi.mock("@/features/access/server/runtime", () => ({ getAccessPolicy: () => ({ can }) }));
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db" }));
vi.mock("./drizzle-store", () => ({ createSecretsStore: (db: unknown) => (db === "db" ? store : undefined) }));

import { getSecrets } from "./runtime";

afterEach(() => vi.unstubAllEnvs());

describe("getSecrets", () => {
  it("is one service per process, asking for the manage_secrets capability and reading the key ring when used", async () => {
    vi.stubEnv("ORRERY_ENCRYPTION_KEYS", `k1:${randomBytes(32).toString("base64")}`);
    const secrets = getSecrets();
    expect(getSecrets()).toBe(secrets);
    const actor = { userId: "u1", login: "octo" };
    expect(await secrets.list({ owner: "a", name: "b" }, actor)).toEqual([]);
    expect(can).toHaveBeenCalledWith({ owner: "a", name: "b" }, "octo", "manage_secrets");
    expect(await secrets.save({ owner: "a", name: "b" }, actor, { name: "K", value: "v", hosts: ["x.com"] })).toEqual({ ok: true });
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ keyId: "k1" }), expect.any(Date));
  });
});
