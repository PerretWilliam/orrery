// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AUDIT_RETENTION_DAYS } from "../domain/events";
import { MAX_PAGE, createAudit } from "./service";

const logged = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({ log: logged }));

const NOW = new Date("2026-06-01T00:00:00Z");
const setup = (over: { append?: () => Promise<void>; admin?: boolean } = {}) => {
  const store = { append: vi.fn(over.append ?? (async () => {})), list: vi.fn(async () => []), purge: vi.fn(async () => 3) };
  const isAdmin = vi.fn(async () => over.admin ?? true);
  return { store, isAdmin, audit: createAudit({ store, isAdmin, now: () => NOW }) };
};

describe("audit", () => {
  it("appends an event with the time, a repository or none, and its detail cut down", async () => {
    const { audit, store } = setup();
    await audit.record({ event: "secret_created", actor: "ada", repository: "acme/web", detail: { name: "API_KEY" } });
    await audit.record({ event: "sign_in", actor: null });
    expect(store.append).toHaveBeenNthCalledWith(1, { event: "secret_created", actor: "ada", repository: "acme/web", detail: { name: "API_KEY" } }, NOW);
    expect(store.append).toHaveBeenNthCalledWith(2, { event: "sign_in", actor: null, repository: null, detail: {} }, NOW);
  });
  it("never throws when the write fails: it logs the event name and the reason, nothing else", async () => {
    const { audit } = setup({ append: async () => { throw new Error("db down"); } });
    await expect(audit.record({ event: "secret_deleted", actor: "ada", detail: { name: "X" } })).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith("error", "audit entry could not be written", { event: "secret_deleted", error: "db down" });
    const odd = setup({ append: async () => { throw "x"; } });
    await odd.audit.record({ event: "sign_out", actor: null });
    expect(logged).toHaveBeenLastCalledWith("error", expect.any(String), { event: "sign_out", error: "unknown error" });
  });
  it("lists for admins only, newest first, with the page size kept within bounds", async () => {
    const { audit, store, isAdmin } = setup();
    expect(await audit.list("Ada")).toEqual([]);
    expect(isAdmin).toHaveBeenCalledWith("ada");
    expect(store.list).toHaveBeenLastCalledWith({ limit: 50, before: undefined, event: undefined });
    const before = new Date(5);
    await audit.list("ada", { limit: 10_000, before, event: "sign_in" });
    expect(store.list).toHaveBeenLastCalledWith({ limit: MAX_PAGE, before, event: "sign_in" });
    await audit.list("ada", { limit: 0 });
    expect(store.list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1 }));
  });
  it("shows nothing, not even that there is a log, to anyone else", async () => {
    const { audit, store } = setup({ admin: false });
    expect(await audit.list("eve")).toBeNull();
    expect(store.list).not.toHaveBeenCalled();
  });
  it("purges what is older than the retention", async () => {
    const { audit, store } = setup();
    expect(await audit.purge()).toBe(3);
    expect(store.purge).toHaveBeenCalledWith(new Date(NOW.getTime() - AUDIT_RETENTION_DAYS * 86_400_000));
  });
});
