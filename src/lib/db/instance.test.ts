import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getDb", () => {
  it("throws when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getDb } = await import("./instance");
    expect(() => getDb()).toThrow("DATABASE_URL is not set");
  });
  it("creates the handle once and reuses it", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:1/none");
    const { getDb } = await import("./instance");
    expect(getDb()).toBe(getDb());
  });
});
