import { describe, expect, it } from "vitest";
import { listsOf } from "./lists";

const widgets = (...types: string[]) => types.map((type) => ({ type }));

describe("listsOf", () => {
  it("names each list of a page made only of GitHub lists, numbering a repeated kind", () => {
    expect(listsOf(widgets("github.issues", "github.pull_requests", "github.issues", "github.workflow_runs", "github.releases")).map((list) => [list.id, list.kind])).toEqual([
      ["issues", "issues"],
      ["pull-requests", "pull_requests"],
      ["issues-2", "issues"],
      ["workflow-runs", "workflow_runs"],
      ["releases", "releases"],
    ]);
  });
  it("keeps each widget as the file wrote it", () => {
    const page = widgets("github.issues", "github.releases");
    expect(listsOf(page).map((list) => list.widget)).toEqual(page);
  });
  it.each([[[]], [["github.issues"]], [["github.issues", "kpi"]], [["kpi", "line"]]])("splits nothing for %j", (types) => {
    expect(listsOf(widgets(...types))).toEqual([]);
  });
});
