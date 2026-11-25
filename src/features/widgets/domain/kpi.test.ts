import { describe, expect, it } from "vitest";
import { kpiView } from "./kpi";

const kpi = (over = {}) => ({ type: "kpi", source: "s", path: "data.v", label: "L", ...over }) as never;
const data = (v: unknown, extra = {}) => ({ data: { v }, ...extra });

describe("kpiView", () => {
  it("reads a finite number at the path, and a short text", () => {
    expect(kpiView(kpi(), data(42))).toEqual({ kind: "value", value: 42, trend: null, alert: null });
    expect(kpiView(kpi(), data("up"))).toMatchObject({ kind: "value", value: "up" });
    expect(kpiView(kpi(), data("x".repeat(100)))).toMatchObject({ value: "x".repeat(64) });
    expect(kpiView(kpi(), data(0))).toMatchObject({ value: 0 });
  });
  it("has nothing to show for a missing, empty or unusable value", () => {
    for (const value of [undefined, null, "", NaN, Infinity, true, {}, [1]]) expect(kpiView(kpi(), data(value))).toEqual({ kind: "empty" });
    expect(kpiView(kpi(), null)).toEqual({ kind: "empty" });
    expect(kpiView(kpi({ path: "constructor" }), data(1))).toEqual({ kind: "empty" });
  });
  it("reads the trend at its own path, only when it is a finite number", () => {
    const widget = kpi({ trend: "data.d" });
    expect(kpiView(widget, { data: { v: 1, d: -2.5 } })).toMatchObject({ trend: -2.5 });
    expect(kpiView(widget, { data: { v: 1, d: "up" } })).toMatchObject({ trend: null });
    expect(kpiView(widget, { data: { v: 1 } })).toMatchObject({ trend: null });
    expect(kpiView(kpi(), { data: { v: 1, d: 3 } })).toMatchObject({ trend: null });
  });
  it("raises the alert below or above the threshold, strictly", () => {
    const widget = kpi({ alert: { below: 18, above: 100 } });
    expect(kpiView(widget, data(17.9))).toMatchObject({ alert: { side: "below", limit: 18 } });
    expect(kpiView(widget, data(18))).toMatchObject({ alert: null });
    expect(kpiView(widget, data(100))).toMatchObject({ alert: null });
    expect(kpiView(widget, data(100.1))).toMatchObject({ alert: { side: "above", limit: 100 } });
  });
  it("works with only one of the two thresholds, and never alerts on text", () => {
    expect(kpiView(kpi({ alert: { below: 18 } }), data(500))).toMatchObject({ alert: null });
    expect(kpiView(kpi({ alert: { above: 100 } }), data(1))).toMatchObject({ alert: null });
    expect(kpiView(kpi({ alert: { below: 18 } }), data("1"))).toMatchObject({ alert: null });
  });
});
