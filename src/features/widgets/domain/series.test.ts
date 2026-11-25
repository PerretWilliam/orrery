import { describe, expect, it } from "vitest";
import { MAX_POINTS, seriesOf, slicesOf } from "./series";

const line = { type: "line", source: "s", path: "rows", x: "day", y: "n" } as never;
const donut = { type: "donut", source: "s", path: "rows", name: "k", value: "v" } as never;

describe("seriesOf", () => {
  it("maps each item to a point, x as text and y as a finite number", () => {
    const rows = [{ day: "mon", n: 1 }, { day: 2, n: 0 }, { day: "x".repeat(100), n: -3.5 }];
    expect(seriesOf(line, { rows })).toEqual([{ x: "mon", y: 1 }, { x: "2", y: 0 }, { x: "x".repeat(64), y: -3.5 }]);
  });
  it("skips items without a usable pair", () => {
    const rows = [{ day: "a" }, { n: 1 }, { day: "", n: 1 }, { day: "b", n: "3" }, { day: "c", n: Infinity }, { day: {}, n: 1 }, null, 5, { day: "ok", n: 2 }];
    expect(seriesOf(line, { rows })).toEqual([{ x: "ok", y: 2 }]);
  });
  it("is empty when the path does not lead to a list", () => {
    expect(seriesOf(line, { rows: "nope" })).toEqual([]);
    expect(seriesOf(line, {})).toEqual([]);
    expect(seriesOf(line, null)).toEqual([]);
  });
  it("keeps at most MAX_POINTS points", () => {
    const rows = Array.from({ length: MAX_POINTS + 50 }, (_, i) => ({ day: `d${i}`, n: i }));
    expect(seriesOf(line, { rows })).toHaveLength(MAX_POINTS);
  });
});

describe("slicesOf", () => {
  it("keeps positive finite values only", () => {
    const rows = [{ k: "a", v: 3 }, { k: "b", v: 0 }, { k: "c", v: -1 }, { k: "d", v: "2" }, { k: "e", v: NaN }, { v: 1 }];
    expect(slicesOf(donut, { rows })).toEqual([{ name: "a", value: 3 }]);
  });
  it("is empty without a list", () => {
    expect(slicesOf(donut, { rows: 1 })).toEqual([]);
  });
});
