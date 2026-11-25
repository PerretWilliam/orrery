// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Capability } from "@/features/access/domain/capabilities";
import type { AuditEvent } from "@/features/audit/domain/events";
import { MAX_PROJECT_HOSTS } from "../domain/hosts";
import { createProjectSettings } from "./service";

const repo = { owner: "acme", name: "web" };
const actor = { userId: "u1", login: "octo" };

function setup({ caps = ["manage_hosts", "manage_secrets", "reindex"] as Capability[], id = "r1" as string | null, hosts = [] as string[], fail = false } = {}) {
  const store = {
    repositoryId: vi.fn(async () => id),
    hosts: vi.fn(async () => hosts),
    addHost: vi.fn(async (_id: string, host: string) => !hosts.includes(host)),
    removeHost: vi.fn(async (_id: string, host: string) => hosts.includes(host)),
  };
  const can = vi.fn(async (_repo: unknown, _login: string, capability: Capability) => caps.includes(capability));
  const reindex = vi.fn(async () => {
    if (fail) throw new Error("github down");
  });
  const audit = vi.fn(async (_event: AuditEvent) => {});
  return { store, can, reindex, audit, settings: createProjectSettings({ store, can, reindex, audit }) };
}

describe("project settings", () => {
  it("shows hosts and what else the user may do, asking the policy with their login", async () => {
    const { settings, can } = setup({ hosts: ["a.com"], caps: ["manage_hosts", "reindex"] });
    expect(await settings.overview(repo, actor)).toEqual({ hosts: ["a.com"], canManageSecrets: false, canReindex: true });
    expect(can).toHaveBeenCalledWith(repo, "octo", "manage_hosts");
  });
  it("refuses everything without the capability, and an unknown project looks the same, touching nothing", async () => {
    for (const { settings, store, reindex } of [setup({ caps: [] }), setup({ id: null })]) {
      expect(await settings.overview(repo, actor)).toBeNull();
      expect(await settings.addHost(repo, actor, "a.com")).toEqual({ ok: false, reason: "forbidden" });
      expect(await settings.removeHost(repo, actor, "a.com")).toEqual({ ok: false, reason: "forbidden" });
      expect(await settings.reindex(repo, actor)).toEqual({ ok: false, reason: "forbidden" });
      expect(store.hosts).not.toHaveBeenCalled();
      expect(store.addHost).not.toHaveBeenCalled();
      expect(store.removeHost).not.toHaveBeenCalled();
      expect(reindex).not.toHaveBeenCalled();
    }
  });
  it("adds a normalized host and traces it; adding it again changes and traces nothing", async () => {
    const { settings, store, audit } = setup();
    expect(await settings.addHost(repo, actor, " API.example.com ")).toEqual({ ok: true });
    expect(store.addHost).toHaveBeenCalledWith("r1", "api.example.com", "u1");
    expect(audit).toHaveBeenCalledWith({ event: "allowlist_changed", actor: "octo", repository: "acme/web", detail: { change: "added", host: "api.example.com" } });
    const again = setup({ hosts: ["api.example.com"] });
    expect(await again.settings.addHost(repo, actor, "api.example.com")).toEqual({ ok: true });
    expect(again.audit).not.toHaveBeenCalled();
  });
  it("refuses an address, a range, and a list past the limit", async () => {
    const { settings, store } = setup();
    expect(await settings.addHost(repo, actor, "10.0.0.0/8")).toEqual({ ok: false, reason: "invalid", code: "settings_invalid_host" });
    const full = setup({ hosts: Array.from({ length: MAX_PROJECT_HOSTS }, (_, i) => `h${i}.com`) });
    expect(await full.settings.addHost(repo, actor, "new.com")).toEqual({ ok: false, reason: "invalid", code: "settings_invalid_host" });
    expect(store.addHost).not.toHaveBeenCalled();
    expect(full.store.addHost).not.toHaveBeenCalled();
  });
  it("removes a host and traces it, and traces nothing when it was not there", async () => {
    const { settings, audit } = setup({ hosts: ["a.com"] });
    expect(await settings.removeHost(repo, actor, "a.com")).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith({ event: "allowlist_changed", actor: "octo", repository: "acme/web", detail: { change: "removed", host: "a.com" } });
    audit.mockClear();
    expect(await settings.removeHost(repo, actor, "b.com")).toEqual({ ok: true });
    expect(audit).not.toHaveBeenCalled();
  });
  it("forces a re-index and traces it, even when GitHub then fails, in which case it says so", async () => {
    const ok = setup();
    expect(await ok.settings.reindex(repo, actor)).toEqual({ ok: true });
    expect(ok.reindex).toHaveBeenCalledWith(repo);
    expect(ok.audit).toHaveBeenCalledWith({ event: "reindex_forced", actor: "octo", repository: "acme/web" });
    const bad = setup({ fail: true });
    expect(await bad.settings.reindex(repo, actor)).toEqual({ ok: false, reason: "invalid", code: "settings_reindex_failed" });
    expect(bad.audit).toHaveBeenCalledTimes(1);
  });
  it("works without an audit log", async () => {
    const store = { repositoryId: async () => "r1", hosts: async () => [], addHost: async () => true, removeHost: async () => true };
    const settings = createProjectSettings({ store, can: async () => true, reindex: async () => {} });
    expect(await settings.addHost(repo, actor, "a.com")).toEqual({ ok: true });
    expect(await settings.removeHost(repo, actor, "a.com")).toEqual({ ok: true });
    expect(await settings.reindex(repo, actor)).toEqual({ ok: true });
  });
});
