import { describe, expect, it } from "vitest";
import { MAX_COHORTS, MAX_DAYS, cohortRows } from "./cohort";

const cohort = { type: "cohort", source: "s", path: "rows", cohort: "week", values: "ret" } as never;

describe("cohortRows", () => {
  it("keeps shares as they are when nothing is above 1", () => {
    const rows = [{ week: "W1", ret: [1, 0.5, 0.25] }];
    expect(cohortRows(cohort, { rows })).toEqual([{ name: "W1", values: [1, 0.5, 0.25] }]);
  });
  it("reads percentages when any value is above 1, over the whole matrix", () => {
    const rows = [{ week: "W1", ret: [100, 50] }, { week: "W2", ret: [1, 0.5] }];
    expect(cohortRows(cohort, { rows })).toEqual([{ name: "W1", values: [1, 0.5] }, { name: "W2", values: [0.01, 0.005] }]);
  });
  it("turns non-numbers into gaps and cuts long names", () => {
    const rows = [{ week: "w".repeat(80), ret: [0.5, "x", null, NaN, {}] }];
    expect(cohortRows(cohort, { rows })).toEqual([{ name: "w".repeat(64), values: [0.5, null, null, null, null] }]);
  });
  it("skips items without a name or without a list of values", () => {
    const rows = [{ ret: [1] }, { week: "", ret: [1] }, { week: 3, ret: [1] }, { week: "ok" }, { week: "ok", ret: "no" }, null, { week: "good", ret: [] }];
    expect(cohortRows(cohort, { rows })).toEqual([{ name: "good", values: [] }]);
  });
  it("is empty when the path is not a list", () => {
    expect(cohortRows(cohort, { rows: 1 })).toEqual([]);
    expect(cohortRows(cohort, null)).toEqual([]);
  });
  it("caps cohorts and days", () => {
    const rows = Array.from({ length: MAX_COHORTS + 5 }, (_, i) => ({ week: `w${i}`, ret: Array.from({ length: MAX_DAYS + 5 }, () => 0.1) }));
    const out = cohortRows(cohort, { rows });
    expect(out).toHaveLength(MAX_COHORTS);
    expect(out[0].values).toHaveLength(MAX_DAYS);
  });
});
