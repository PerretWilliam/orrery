import { describe, expect, it, vi } from "vitest";

const migrate = vi.fn();
vi.mock("drizzle-orm/node-postgres/migrator", () => ({ migrate: (...a: unknown[]) => migrate(...a) }));

import type { Db } from "./client";
import { assertSchemaNotNewer, latestVersion, runMigrations, SchemaTooNewError } from "./migrate";

const journal = (...whens: number[]) => JSON.stringify({ entries: whens.map((when) => ({ when })) });

// Fake db answering the two version queries: table existence, then max(created_at).
const fakeDb = (applied: number | null) =>
  ({
    execute: vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ t: applied === null ? null : "drizzle.__drizzle_migrations" }] })
      .mockResolvedValueOnce({ rows: [{ v: String(applied ?? 0) }] }),
  }) as unknown as Db;

describe("latestVersion", () => {
  it("is the newest migration timestamp, or 0 when empty", () => {
    expect(latestVersion(journal(5, 9, 7))).toBe(9);
    expect(latestVersion(journal())).toBe(0);
  });
});

describe("assertSchemaNotNewer", () => {
  it("accepts an equal or older database", () => {
    expect(() => assertSchemaNotNewer(5, 5)).not.toThrow();
    expect(() => assertSchemaNotNewer(4, 5)).not.toThrow();
  });
  it("refuses a newer database with a typed error", () => {
    expect(() => assertSchemaNotNewer(6, 5)).toThrow(SchemaTooNewError);
    expect(() => assertSchemaNotNewer(6, 5)).toThrow(/newer than this app/);
  });
});

describe("runMigrations", () => {
  it("migrates a fresh database using the repository's migrations by default", async () => {
    migrate.mockClear();
    const db = fakeDb(null);
    await runMigrations(db);
    expect(migrate).toHaveBeenCalledWith(db, { migrationsFolder: expect.stringMatching(/drizzle$/) });
  });
  it("migrates a database that is behind", async () => {
    migrate.mockClear();
    await runMigrations(fakeDb(1));
    expect(migrate).toHaveBeenCalledTimes(1);
  });
  it("refuses to migrate a database ahead of the app", async () => {
    migrate.mockClear();
    await expect(runMigrations(fakeDb(Number.MAX_SAFE_INTEGER))).rejects.toBeInstanceOf(SchemaTooNewError);
    expect(migrate).not.toHaveBeenCalled();
  });
});
