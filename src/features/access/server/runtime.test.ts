// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAccessPolicy } from "./registry";

const store = { allowlist: vi.fn(async () => []), rulesFor: vi.fn(), seedAllowlist: vi.fn(), grantAdmins: vi.fn() };
vi.mock("@/lib/db/instance", () => ({ getDb: () => "db" }));
vi.mock("./drizzle-store", () => ({ createAccessStore: (db: unknown) => (db === "db" ? store : undefined) }));

import { getAccessPolicy } from "./runtime";

afterEach(() => {
  registerAccessPolicy(undefined);
  vi.restoreAllMocks();
});

describe("getAccessPolicy", () => {
  it("is created once and shared", () => {
    expect(getAccessPolicy()).toBe(getAccessPolicy());
  });
  it("denies sign-in and project access until the GitHub adapter exists", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const policy = getAccessPolicy();
    expect(await policy.canSignIn("alice")).toBe(false);
    expect((await policy.capabilities({ owner: "acme", name: "web" }, "alice")).size).toBe(0);
  });
});
