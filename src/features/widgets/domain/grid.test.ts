import { describe, expect, it } from "vitest";
import { WIDGET_TYPES } from "@/features/config/domain/schema-v1";
import { GRID_COLUMNS, layoutFor, SIZED_TYPES, sizeOf } from "./grid";

describe("sizes", () => {
  it("cover exactly the widget types of schema v1", () => {
    expect([...SIZED_TYPES].sort()).toEqual([...WIDGET_TYPES].sort());
  });
  it("fit in the grid", () => {
    for (const type of SIZED_TYPES) {
      const { w, h } = sizeOf(type);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(GRID_COLUMNS);
      expect(h).toBeGreaterThan(0);
    }
  });
  it("give a type the schema does not know yet a middle-sized place", () => {
    expect(sizeOf("from-the-future")).toEqual({ w: 6, h: 4 });
  });
});

describe("layoutFor", () => {
  it("is empty for an empty page", () => {
    expect(layoutFor([])).toEqual([]);
  });
  it("places widgets in file order, left to right", () => {
    expect(layoutFor(["kpi", "kpi", "status"])).toEqual([
      { i: "w0", x: 0, y: 0, w: 3, h: 2 },
      { i: "w1", x: 3, y: 0, w: 3, h: 2 },
      { i: "w2", x: 6, y: 0, w: 3, h: 2 },
    ]);
  });
  it("fills a row exactly before wrapping", () => {
    const items = layoutFor(["line", "bar", "kpi"]);
    expect(items.map((item) => [item.x, item.y])).toEqual([[0, 0], [6, 0], [0, 4]]);
  });
  it("wraps below the tallest widget of the row", () => {
    const items = layoutFor(["kpi", "line", "line", "kpi"]);
    expect(items.map((item) => [item.x, item.y])).toEqual([[0, 0], [3, 0], [0, 4], [6, 4]]);
  });
  it("gives a full-width widget a row of its own", () => {
    const items = layoutFor(["kpi", "table", "kpi"]);
    expect(items.map((item) => [item.x, item.y])).toEqual([[0, 0], [0, 2], [0, 7]]);
  });
  it("never overflows the grid and gives every widget a distinct id", () => {
    const items = layoutFor(Array.from({ length: 40 }, (_, i) => SIZED_TYPES[i % SIZED_TYPES.length]));
    expect(items.every((item) => item.x + item.w <= GRID_COLUMNS)).toBe(true);
    expect(new Set(items.map((item) => item.i)).size).toBe(40);
  });
});
