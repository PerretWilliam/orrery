// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessPolicy } from "@/features/access/server/policy";
import { registerAccessPolicy } from "@/features/access/server/registry";
import { SETTINGS_CONTEXT } from "@/features/setup/server/service";
import { encrypt, parseKeyring } from "@/lib/crypto";

const KEYS = `k1:${Buffer.alloc(32, 9).toString("base64")}`;
const store = { secretCiphertext: vi.fn(), claimDelivery: vi.fn() };
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db" }));
vi.mock("./drizzle-store", () => ({ createWebhookStore: (db: unknown) => (db === "db" ? store : undefined) }));

import { getWebhookHandler } from "./runtime";

beforeEach(() => vi.stubEnv("ORRERY_ENCRYPTION_KEYS", KEYS));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  registerAccessPolicy(undefined);
});

const signed = (raw: string, secret: string) =>
  new Request("http://hub.test/", {
    method: "POST",
    body: raw,
    headers: { "x-github-event": "membership", "x-github-delivery": "d-1", "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}` },
  });

describe("getWebhookHandler", () => {
  it("is not configured while the database has no webhook secret", async () => {
    store.secretCiphertext.mockResolvedValue(null);
    expect((await getWebhookHandler()(signed("{}", "x"))).status).toBe(503);
  });
  it("decrypts the stored secret, records the delivery and invalidates the live access policy", async () => {
    const invalidate = vi.fn();
    registerAccessPolicy({ invalidate } as unknown as AccessPolicy);
    store.secretCiphertext.mockResolvedValue(encrypt("hook-secret", parseKeyring(KEYS), SETTINGS_CONTEXT.webhookSecret));
    store.claimDelivery.mockResolvedValue(true);
    const response = await getWebhookHandler()(signed(JSON.stringify({ member: { login: "hubot" } }), "hook-secret"));
    expect(response.status).toBe(200);
    expect(store.claimDelivery).toHaveBeenCalledWith("d-1", "membership", expect.any(Date));
    expect(invalidate).toHaveBeenCalledWith({ username: "hubot" });
  });
  it("refuses a secret that is bound to another column (a copied ciphertext)", async () => {
    store.secretCiphertext.mockResolvedValue(encrypt("hook-secret", parseKeyring(KEYS), SETTINGS_CONTEXT.clientSecret));
    await expect(getWebhookHandler()(signed("{}", "hook-secret"))).rejects.toThrow();
  });
});
