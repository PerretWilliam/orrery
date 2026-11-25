// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@/features/audit/domain/events";
import { secretContext } from "@/features/secrets/server/service";
import { SETTINGS_CONTEXT } from "@/features/setup/server/service";
import { decrypt, encrypt, parseKeyring } from "@/lib/crypto";
import type { AdminAction } from "../domain/admin";
import { createAdminSettings } from "./service";
import type { AdminStore, AppCiphertexts } from "./store";

const actor = { userId: "u1", login: "Octo" };
const old = parseKeyring(`k1:${randomBytes(32).toString("base64")}`);
const ring = parseKeyring(`k2:${randomBytes(32).toString("base64")},k1:${old.keys.get("k1")!.toString("base64")}`);
const entry = { kind: "org", value: "acme" } as const;
const rule = { effect: "restrict_to", subject: { kind: "team", value: "acme/devs" } } as const;
const project = { owner: "acme", name: "web" };

function setup({ admin = true, admins = ["octo", "other"], changed = true, ruleResult = true as boolean | null, app = {} as AppCiphertexts, secrets = [] as { id: string; repositoryId: string; name: string; ciphertext: string }[], keyring = () => ring } = {}) {
  const store = {
    isAdmin: vi.fn(async () => admin),
    allowlist: vi.fn(async () => [entry]),
    addAllow: vi.fn(async () => changed),
    removeAllow: vi.fn(async () => changed),
    hosts: vi.fn(async () => ["10.0.0.0/8"]),
    addHost: vi.fn(async () => changed),
    removeHost: vi.fn(async () => changed),
    admins: vi.fn(async () => admins),
    addAdmin: vi.fn(async () => changed),
    removeAdmin: vi.fn(async () => changed),
    rules: vi.fn(async () => [{ project: "acme/web", rule: { effect: "hide" as const } }]),
    addRule: vi.fn(async () => ruleResult),
    removeRule: vi.fn(async () => ruleResult === true),
    staleSecrets: vi.fn(async () => secrets),
    saveSecret: vi.fn(async () => {}),
    appCiphertexts: vi.fn(async () => app),
    saveAppCiphertexts: vi.fn(async () => {}),
  } satisfies AdminStore;
  const audit = vi.fn(async (_event: AuditEvent) => {});
  return { store, audit, admin: createAdminSettings({ store, keyring, audit }) };
}

const everyAction: AdminAction[] = [
  { type: "allow_add", entry },
  { type: "allow_remove", entry },
  { type: "host_add", host: "a.com" },
  { type: "host_remove", host: "a.com" },
  { type: "admin_add", login: "x" },
  { type: "admin_remove", login: "x" },
  { type: "rule_add", project, rule },
  { type: "rule_remove", project, rule },
  { type: "rotate_keys" },
];

describe("admin settings", () => {
  it("refuses every action and the overview to a user who is not an admin, touching nothing, with the lowercased login asked", async () => {
    const { admin, store, audit } = setup({ admin: false });
    expect(await admin.overview(actor)).toBeNull();
    for (const action of everyAction) expect(await admin.apply(actor, action)).toEqual({ ok: false, reason: "forbidden" });
    expect(store.isAdmin).toHaveBeenCalledWith("octo");
    expect(store.allowlist).not.toHaveBeenCalled();
    for (const fn of [store.addAllow, store.removeAllow, store.addHost, store.removeHost, store.addAdmin, store.removeAdmin, store.addRule, store.removeRule, store.saveSecret, store.saveAppCiphertexts]) expect(fn).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("shows the lists and how much is still sealed with another key", async () => {
    const stale = [{ id: "s1", repositoryId: "r1", name: "A", ciphertext: encrypt("v", old, secretContext("r1", "A")) }];
    const app = { clientSecret: encrypt("c", old, SETTINGS_CONTEXT.clientSecret), privateKey: encrypt("p", ring, SETTINGS_CONTEXT.privateKey) };
    const { admin } = setup({ secrets: stale, app });
    expect(await admin.overview(actor)).toEqual({ allowlist: [entry], hosts: ["10.0.0.0/8"], admins: ["octo", "other"], rules: [{ project: "acme/web", rule: { effect: "hide" } }], key: { active: "k2", pending: 2 } });
  });
  it("shows no key status, instead of failing, when the keys cannot be read", async () => {
    const { admin } = setup({ keyring: () => { throw new Error("no key"); } });
    expect(await admin.overview(actor)).toMatchObject({ key: null });
  });

  it.each([
    [{ type: "allow_add", entry }, "addAllow", "allowlist_changed", { scope: "sign_in", change: "added", entry: "org:acme" }],
    [{ type: "allow_remove", entry }, "removeAllow", "allowlist_changed", { scope: "sign_in", change: "removed", entry: "org:acme" }],
    [{ type: "host_add", host: "a.com" }, "addHost", "allowlist_changed", { scope: "private_hosts", change: "added", host: "a.com" }],
    [{ type: "host_remove", host: "a.com" }, "removeHost", "allowlist_changed", { scope: "private_hosts", change: "removed", host: "a.com" }],
    [{ type: "admin_add", login: "x" }, "addAdmin", "policy_changed", { scope: "admins", change: "added", login: "x" }],
    [{ type: "admin_remove", login: "x" }, "removeAdmin", "policy_changed", { scope: "admins", change: "removed", login: "x" }],
    [{ type: "rule_add", project, rule }, "addRule", "policy_changed", { scope: "project_rule", change: "added", project: "acme/web", effect: "restrict_to", subject: "team:acme/devs" }],
    [{ type: "rule_remove", project, rule: { effect: "hide" } }, "removeRule", "policy_changed", { scope: "project_rule", change: "removed", project: "acme/web", effect: "hide", subject: "" }],
  ] as [AdminAction, keyof AdminStore, AuditEvent["event"], Record<string, string>][])("applies %j and writes it to the audit log", async (action, method, event, detail) => {
    const { admin, store, audit } = setup();
    expect(await admin.apply(actor, action)).toEqual({ ok: true });
    expect(store[method]).toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith({ event, actor: "Octo", detail });
  });
  it("records the acting user as the author of what it adds", async () => {
    const { admin, store } = setup();
    await admin.apply(actor, { type: "allow_add", entry });
    await admin.apply(actor, { type: "host_add", host: "a.com" });
    await admin.apply(actor, { type: "admin_add", login: "x" });
    await admin.apply(actor, { type: "rule_add", project, rule });
    expect(store.addAllow).toHaveBeenCalledWith(entry, "u1");
    expect(store.addHost).toHaveBeenCalledWith("a.com", "u1");
    expect(store.addAdmin).toHaveBeenCalledWith("x", "u1");
    expect(store.addRule).toHaveBeenCalledWith(project, rule, "u1");
  });
  it("does not log a change that changed nothing", async () => {
    const { admin, audit } = setup({ changed: false, ruleResult: false });
    for (const action of everyAction.slice(0, 8)) expect(await admin.apply(actor, action)).toEqual({ ok: true });
    expect(audit).not.toHaveBeenCalled();
  });
  it("works without an audit log", async () => {
    const { store } = setup();
    expect(await createAdminSettings({ store, keyring: () => ring }).apply(actor, { type: "host_add", host: "a.com" })).toEqual({ ok: true });
  });
  it("says so when the project of a new rule is unknown", async () => {
    const { admin, audit } = setup({ ruleResult: null });
    expect(await admin.apply(actor, { type: "rule_add", project, rule })).toEqual({ ok: false, reason: "invalid", code: "admin_unknown_project" });
    expect(audit).not.toHaveBeenCalled();
  });
  it("never removes the last admin", async () => {
    const { admin, store } = setup({ admins: ["octo"] });
    expect(await admin.apply(actor, { type: "admin_remove", login: "octo" })).toEqual({ ok: false, reason: "invalid", code: "admin_last_admin" });
    expect(store.removeAdmin).not.toHaveBeenCalled();
    expect(await admin.apply(actor, { type: "admin_add", login: "x" })).toEqual({ ok: true });
  });

  it("re-encrypts what is on another key, each value under its own context, and logs counts only", async () => {
    const secrets = [{ id: "s1", repositoryId: "r1", name: "A", ciphertext: encrypt("value-a", old, secretContext("r1", "A")) }];
    const app = { clientSecret: encrypt("client", old, SETTINGS_CONTEXT.clientSecret), authSecret: encrypt("auth", ring, SETTINGS_CONTEXT.authSecret) };
    const { admin, store, audit } = setup({ secrets, app });
    expect(await admin.apply(actor, { type: "rotate_keys" })).toEqual({ ok: true });
    const [id, sealed, keyId] = store.saveSecret.mock.calls[0] as unknown as [string, string, string];
    expect([id, keyId]).toEqual(["s1", "k2"]);
    expect(decrypt(sealed, ring, secretContext("r1", "A"))).toBe("value-a");
    const [saved, appKey] = store.saveAppCiphertexts.mock.calls[0] as unknown as [AppCiphertexts, string];
    expect(Object.keys(saved)).toEqual(["clientSecret"]);
    expect(decrypt(saved.clientSecret!, ring, SETTINGS_CONTEXT.clientSecret)).toBe("client");
    expect(appKey).toBe("k2");
    expect(audit).toHaveBeenCalledWith({ event: "key_rotated", actor: "Octo", detail: { key: "k2", secrets: "1", credentials: "1" } });
    expect(JSON.stringify(audit.mock.calls)).not.toContain("value-a");
  });
  it("fails with a code, logging nothing, when a value cannot be re-encrypted", async () => {
    const secrets = [{ id: "s1", repositoryId: "r1", name: "A", ciphertext: "garbage" }];
    const { admin, audit } = setup({ secrets });
    expect(await admin.apply(actor, { type: "rotate_keys" })).toEqual({ ok: false, reason: "invalid", code: "admin_rotation_failed" });
    expect(audit).not.toHaveBeenCalled();
  });
});
