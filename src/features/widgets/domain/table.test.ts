import { describe, expect, it } from "vitest";
import { MAX_ROWS, columnId, tableRows } from "./table";

const table = { type: "table", source: "s", path: "rows", columns: [{ header: "A", path: "a" }, { header: "B", path: "b.c" }] } as never;

describe("tableRows", () => {
  it("builds one row per item with one cell per column, keyed by column id", () => {
    const rows = [{ a: "x", b: { c: 2 } }, { a: true, b: {} }];
    expect(tableRows(table, { rows })).toEqual([{ c0: "x", c1: 2 }, { c0: "true", c1: null }]);
    expect(columnId(3)).toBe("c3");
  });
  it("turns anything but text and finite numbers into nothing, and cuts long text", () => {
    const rows = [{ a: { x: 1 }, b: { c: Infinity } }, { a: "y".repeat(300), b: { c: NaN } }, null, 7];
    expect(tableRows(table, { rows })).toEqual([{ c0: null, c1: null }, { c0: "y".repeat(200), c1: null }, { c0: null, c1: null }, { c0: null, c1: null }]);
  });
  it("is empty when the path is not a list", () => {
    expect(tableRows(table, { rows: "no" })).toEqual([]);
    expect(tableRows(table, undefined)).toEqual([]);
  });
  it("keeps at most MAX_ROWS rows", () => {
    expect(tableRows(table, { rows: Array.from({ length: MAX_ROWS + 5 }, (_, i) => ({ a: i })) })).toHaveLength(MAX_ROWS);
  });
});
