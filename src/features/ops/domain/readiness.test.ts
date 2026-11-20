import { describe, expect, it } from "vitest";
import { readiness } from "./readiness";

describe("readiness", () => {
  it("is ready only when the database is exactly at the app's schema version", () => {
    expect(readiness(5, 5)).toEqual({ ready: true });
    expect(readiness(4, 5)).toEqual({ ready: false, reason: "migrations_pending" });
    expect(readiness(6, 5)).toEqual({ ready: false, reason: "schema_too_new" });
  });
  it("is not ready when the database is unreachable", () => {
    expect(readiness(null, 5)).toEqual({ ready: false, reason: "database_unreachable" });
  });
});
