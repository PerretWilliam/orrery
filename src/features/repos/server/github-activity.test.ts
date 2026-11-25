import { describe, expect, it } from "vitest";
import { activityPath, parseActivity } from "./github-activity";

const repo = { owner: "acme", name: "we b" };
const gh = (path: string) => `https://github.com/acme/web/${path}`;

describe("activityPath", () => {
  it("builds one read-only path per kind, encoded, newest change first", () => {
    expect(activityPath(repo, { kind: "issues", limit: 3 })).toBe("/repos/acme/we%20b/issues?state=open&sort=updated&direction=desc&per_page=100");
    expect(activityPath(repo, { kind: "pull_requests", state: "all", limit: 3 })).toBe("/repos/acme/we%20b/pulls?state=all&sort=updated&direction=desc&per_page=3");
    expect(activityPath(repo, { kind: "workflow_runs", limit: 4 })).toBe("/repos/acme/we%20b/actions/runs?per_page=4");
    expect(activityPath(repo, { kind: "workflow_runs", branch: "feat/a b", limit: 4 })).toBe("/repos/acme/we%20b/actions/runs?per_page=4&branch=feat%2Fa%20b");
    expect(activityPath(repo, { kind: "releases", limit: 2 })).toBe("/repos/acme/we%20b/releases?per_page=2");
  });
});

describe("parseActivity", () => {
  it("lists issues, leaving out pull requests and keeping `limit` of them", () => {
    const rows = [
      { number: 1, title: "pr", state: "open", pull_request: {}, html_url: gh("pull/1") },
      { number: 2, title: "a", state: "open", user: { login: "ada" }, html_url: gh("issues/2"), updated_at: "2026-01-01T00:00:00Z" },
      { number: 3, title: "b", state: "closed", html_url: gh("issues/3") },
      { number: 4, title: "c", state: "open", html_url: gh("issues/4") },
    ];
    expect(parseActivity({ kind: "issues", limit: 2 }, rows)).toEqual([
      { key: "#2", title: "a", state: "open", by: "ada", url: gh("issues/2"), at: "2026-01-01T00:00:00Z" },
      { key: "#3", title: "b", state: "closed", by: null, url: gh("issues/3"), at: null },
    ]);
  });
  it("tells merged, draft and open pull requests apart", () => {
    const base = { title: "t", html_url: gh("pull/1"), user: { login: "u" } };
    const rows = [{ ...base, number: 1, state: "closed", merged_at: "2026-01-01T00:00:00Z" }, { ...base, number: 2, state: "open", draft: true }, { ...base, number: 3, state: "open", draft: false }, { ...base, number: 4, state: "closed", merged_at: null }, { number: 5, title: "t", state: "open", html_url: gh("pull/5"), updated_at: "2026-01-01T00:00:00Z" }];
    expect(parseActivity({ kind: "pull_requests", limit: 10 }, rows).map((i) => i.state)).toEqual(["merged", "draft", "open", "closed", "open"]);
  });
  it("lists workflow runs by conclusion, then status, with fallbacks for missing names", () => {
    const rows = [
      { name: "CI", display_title: "feat: x", status: "completed", conclusion: "success", actor: { login: "bot" }, html_url: gh("actions/runs/1"), updated_at: "2026-01-01T00:00:00Z" },
      { name: "CI", status: "in_progress", conclusion: null, html_url: gh("actions/runs/2") },
      { html_url: gh("actions/runs/3") },
    ];
    expect(parseActivity({ kind: "workflow_runs", limit: 10 }, { workflow_runs: rows })).toEqual([
      { key: "CI", title: "feat: x", state: "success", by: "bot", url: gh("actions/runs/1"), at: "2026-01-01T00:00:00Z" },
      { key: "CI", title: "CI", state: "in_progress", by: null, url: gh("actions/runs/2"), at: null },
      { key: "", title: "", state: "unknown", by: null, url: gh("actions/runs/3"), at: null },
    ]);
  });
  it("lists releases as draft, prerelease or released, titled by name or tag", () => {
    const base = { html_url: gh("releases/x"), created_at: "2026-02-01T00:00:00Z" };
    const rows = [{ ...base, tag_name: "v1", name: "", draft: true }, { ...base, tag_name: "v2", name: "Two", prerelease: true, author: { login: "a" } }, { ...base, tag_name: "v3", published_at: "2026-03-01T00:00:00Z" }];
    expect(parseActivity({ kind: "releases", limit: 10 }, rows)).toEqual([
      { key: "v1", title: "v1", state: "draft", by: null, url: gh("releases/x"), at: "2026-02-01T00:00:00Z" },
      { key: "v2", title: "Two", state: "prerelease", by: "a", url: gh("releases/x"), at: "2026-02-01T00:00:00Z" },
      { key: "v3", title: "v3", state: "released", by: null, url: gh("releases/x"), at: "2026-03-01T00:00:00Z" },
    ]);
    expect(parseActivity({ kind: "releases", limit: 10 }, [{ tag_name: "v9", html_url: gh("x") }])[0].at).toBeNull();
  });
  it("trusts links on github.com only, and cuts long text", () => {
    const rows = [{ number: 1, title: "t".repeat(300), state: "open", html_url: "https://evil.test/x" }, { number: 2, title: "u", state: "open", html_url: "javascript:alert(1)" }];
    const [one, two] = parseActivity({ kind: "issues", limit: 10 }, rows);
    expect(one.url).toBe("");
    expect(one.title).toHaveLength(200);
    expect(two.url).toBe("");
  });
  it("skips a row of the wrong shape and throws on a wrong overall shape", () => {
    expect(parseActivity({ kind: "releases", limit: 10 }, [{ nope: 1 }, null, 5])).toEqual([]);
    expect(() => parseActivity({ kind: "issues", limit: 3 }, { x: 1 })).toThrow();
    expect(() => parseActivity({ kind: "workflow_runs", limit: 3 }, [])).toThrow();
  });
});
