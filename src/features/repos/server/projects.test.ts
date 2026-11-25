import { describe, expect, it, vi } from "vitest";
import { createProjects, type ProjectRow } from "./projects";

const config = (name: string, color?: string) => ({
  version: 1,
  project: { name, ...(color ? { color } : {}) },
  sources: {},
  pages: [{ id: "overview", title: "Overview", widgets: [] }],
});
const row = (name: string, over: Partial<ProjectRow> = {}): ProjectRow => ({
  id: `id-${name}`,
  owner: "acme",
  name,
  isPrivate: false,
  archived: false,
  config: config(name.toUpperCase(), "#7c3aed"),
  issues: null,
  ...over,
});

function setup(rows: ProjectRow[], visible: string[]) {
  const canView = vi.fn(async (repo: { name: string }) => visible.includes(repo.name));
  const store = {
    listConfigured: vi.fn(async () => rows),
    view: vi.fn(async (repo: { name: string }) => rows.find((r) => r.name === repo.name) ?? null),
  };
  return { projects: createProjects({ store, canView }), canView, store };
}

describe("visibleTo", () => {
  it("lists only what the policy lets the user see, by title, asking with the login", async () => {
    const { projects, canView } = setup([row("web"), row("api"), row("secret")], ["web", "api"]);
    expect((await projects.visibleTo("octo")).map((p) => p.title)).toEqual(["API", "WEB"]);
    expect(canView).toHaveBeenCalledTimes(3);
    expect(canView).toHaveBeenCalledWith(expect.objectContaining({ name: "secret" }), "octo");
  });
  it("is empty when nothing is visible", async () => {
    expect(await setup([row("web")], []).projects.visibleTo("octo")).toEqual([]);
  });
  it("falls back to the repository name, without color, when the file was never valid", async () => {
    const { projects } = setup([row("web", { config: null, issues: [{ code: "config_syntax", path: "$", message: "bad", fix: "fix" }] })], ["web"]);
    const [project] = await projects.visibleTo("octo");
    expect(project).toMatchObject({ id: "id-web", title: "web", color: null, config: null });
    expect(project.issues).toHaveLength(1);
  });
  it("does not trust a stored config that no longer parses", async () => {
    const { projects } = setup([row("web", { config: { version: 2 } })], ["web"]);
    expect((await projects.visibleTo("octo"))[0]).toMatchObject({ title: "web", config: null });
  });
});

describe("open", () => {
  it("returns the project with its config, color and no issues", async () => {
    const { projects } = setup([row("web", { isPrivate: true, archived: true })], ["web"]);
    expect(await projects.open({ owner: "acme", name: "web" }, "octo")).toMatchObject({
      owner: "acme",
      name: "web",
      title: "WEB",
      color: "#7c3aed",
      isPrivate: true,
      archived: true,
      issues: [],
      config: { version: 1 },
    });
  });
  it("answers null alike for a missing project and one the user may not see", async () => {
    const { projects, canView } = setup([row("secret")], []);
    expect(await projects.open({ owner: "acme", name: "secret" }, "octo")).toBeNull();
    expect(await projects.open({ owner: "acme", name: "nope" }, "octo")).toBeNull();
    expect(canView).toHaveBeenCalledTimes(1);
  });
});
