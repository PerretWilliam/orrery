import { describe, expect, it } from "vitest";
import { createDb } from "./client";

describe("createDb", () => {
  it("builds a lazy pool (no connection until the first query)", async () => {
    const { db, pool } = createDb("postgres://user:pass@localhost:1/none");
    expect(db).toBeDefined();
    await pool.end();
  });
});
