// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@/features/audit/domain/events";
import { decrypt, parseKeyring } from "@/lib/crypto";
import { createSecrets, secretContext } from "./service";
import type { SecretWrite, SecretsStore } from "./store";

const keyring = parseKeyring(`k1:${randomBytes(32).toString("base64")}`);
const repo = { owner: "acme", name: "web" };
const actor = { userId: "u1", login: "octo" };
const VALUE = "s3cr3t-value";

function setup({ can = true, id = "r1" as string | null } = {}) {
  const saved: SecretWrite[] = [];
  const store: SecretsStore = {
    repositoryId: vi.fn(async () => id),
    list: vi.fn(async () => [{ name: "A_KEY", boundHosts: ["api.example.com"], updatedAt: new Date(0) }]),
    save: vi.fn(async (entry) => void saved.push(entry)),
    remove: vi.fn(async () => true),
  };
  const canManage = vi.fn(async () => can);
  const secrets = createSecrets({ store, keyring: () => keyring, canManage, now: () => new Date(5) });
  return { store, secrets, saved, canManage };
}
const input = { name: "A_KEY", value: VALUE, hosts: ["API.example.com", "api.example.com"] };

describe("secrets service", () => {
  it("lists names and hosts, asking the access policy with the user's login", async () => {
    const { secrets, canManage } = setup();
    expect(await secrets.list(repo, actor)).toEqual([{ name: "A_KEY", boundHosts: ["api.example.com"], updatedAt: new Date(0) }]);
    expect(canManage).toHaveBeenCalledWith(repo, "octo");
  });
  it("encrypts with the active key, bound to the repository and the name, and normalizes the hosts", async () => {
    const { secrets, saved } = setup();
    expect(await secrets.save(repo, actor, input)).toEqual({ ok: true });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ repositoryId: "r1", name: "A_KEY", keyId: "k1", boundHosts: ["api.example.com"], userId: "u1" });
    expect(saved[0].ciphertext).not.toContain(VALUE);
    expect(decrypt(saved[0].ciphertext, keyring, secretContext("r1", "A_KEY"))).toBe(VALUE);
    expect(() => decrypt(saved[0].ciphertext, keyring, secretContext("r1", "OTHER"))).toThrow();
  });
  it("stamps the write with the current time", async () => {
    const { secrets, store } = setup();
    await secrets.save(repo, actor, input);
    expect(store.save).toHaveBeenCalledWith(expect.anything(), new Date(5));
  });
  it("refuses everything without the capability, and never touches the store", async () => {
    const { secrets, store } = setup({ can: false });
    expect(await secrets.list(repo, actor)).toBeNull();
    expect(await secrets.save(repo, actor, input)).toEqual({ ok: false, reason: "forbidden" });
    expect(await secrets.remove(repo, actor, "A_KEY")).toEqual({ ok: false, reason: "forbidden" });
    expect(store.list).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });
  it("treats an unknown repository like a refusal", async () => {
    const { secrets } = setup({ id: null });
    expect(await secrets.list(repo, actor)).toBeNull();
    expect(await secrets.save(repo, actor, input)).toEqual({ ok: false, reason: "forbidden" });
    expect(await secrets.remove(repo, actor, "A_KEY")).toEqual({ ok: false, reason: "forbidden" });
  });
  it("returns every problem with the input and stores nothing, without ever echoing the value", async () => {
    const { secrets, store } = setup();
    const result = await secrets.save(repo, actor, { name: "bad name", value: "a\nb", hosts: ["https://x.com/path"] });
    expect(result.ok).toBe(false);
    const issues = result.ok === false && result.reason === "invalid" ? result.issues : [];
    expect(issues.map((i) => i.code).sort()).toEqual(["secret_invalid_host", "secret_invalid_name", "secret_invalid_value"]);
    expect(JSON.stringify(issues)).not.toContain("a\\nb");
    expect(store.save).not.toHaveBeenCalled();
  });
  it("refuses an empty value alone", async () => {
    const { secrets } = setup();
    const result = await secrets.save(repo, actor, { ...input, value: "" });
    expect(result).toMatchObject({ ok: false, reason: "invalid", issues: [{ code: "secret_invalid_value", path: "value" }] });
  });
  it("deletes by name", async () => {
    const { secrets, store } = setup();
    expect(await secrets.remove(repo, actor, "A_KEY")).toEqual({ ok: true });
    expect(store.remove).toHaveBeenCalledWith("r1", "A_KEY");
  });
  describe("audit", () => {
    const withAudit = (over = {}) => {
      const audit = vi.fn(async (_event: AuditEvent) => {});
      const store: SecretsStore = {
        repositoryId: async () => "r1",
        list: async () => [{ name: "A_KEY", boundHosts: [], updatedAt: new Date(0) }],
        save: async () => {},
        remove: async () => true,
        ...over,
      };
      return { audit, secrets: createSecrets({ store, keyring: () => keyring, canManage: async () => true, now: () => new Date(5), audit }) };
    };
    it("records the name, never the value: created for a new secret, updated for an existing one, deleted on removal", async () => {
      const { audit, secrets } = withAudit();
      await secrets.save(repo, actor, { ...input, name: "NEW_KEY" });
      await secrets.save(repo, actor, input);
      await secrets.remove(repo, actor, "A_KEY");
      expect(audit.mock.calls.map(([e]) => [e.event, e.detail])).toEqual([
        ["secret_created", { name: "NEW_KEY" }],
        ["secret_updated", { name: "A_KEY" }],
        ["secret_deleted", { name: "A_KEY" }],
      ]);
      expect(audit.mock.calls[0][0]).toMatchObject({ actor: "octo", repository: "acme/web" });
      expect(JSON.stringify(audit.mock.calls)).not.toContain(VALUE);
    });
    it("records nothing for a refused or invalid write", async () => {
      const { audit, secrets } = withAudit({ repositoryId: async () => null });
      await secrets.save(repo, actor, input);
      await secrets.remove(repo, actor, "A_KEY");
      const ok = withAudit();
      await ok.secrets.save(repo, actor, { ...input, name: "bad name" });
      expect(audit).not.toHaveBeenCalled();
      expect(ok.audit).not.toHaveBeenCalled();
    });
  });
});
