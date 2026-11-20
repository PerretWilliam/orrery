import { afterEach, describe, expect, it, vi } from "vitest";

const databaseVersion = vi.fn();
vi.mock("@/lib/db/migrate", () => ({ databaseVersion: (...a: unknown[]) => databaseVersion(...a), appVersion: () => 7 }));

import type { Db } from "@/lib/db/client";
import { checkReadiness } from "./check-readiness";

afterEach(() => vi.restoreAllMocks());
const db = {} as Db;

describe("checkReadiness", () => {
  it("is ready when the database is at the app's version", async () => {
    databaseVersion.mockResolvedValue(7);
    expect(await checkReadiness(() => db)).toEqual({ ready: true });
  });
  it("reports pending migrations", async () => {
    databaseVersion.mockResolvedValue(3);
    expect(await checkReadiness(() => db)).toEqual({ ready: false, reason: "migrations_pending" });
  });
  it("reports an unreachable database without throwing, and logs the cause", async () => {
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    databaseVersion.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await checkReadiness(() => db)).toEqual({ ready: false, reason: "database_unreachable" });
    expect(String(err.mock.calls[0][0])).toContain("ECONNREFUSED");
  });
  it("treats a missing DATABASE_URL (non-Error throw) as unreachable", async () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const result = await checkReadiness(() => {
      throw "no url";
    });
    expect(result).toEqual({ ready: false, reason: "database_unreachable" });
  });
});
