import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import messages from "../../../../messages/en.json";
import { ConfigV1 } from "@/features/config/domain/schema-v1";
import type { ListedProject } from "../server/projects";
import { AppShell, EmptyProjects } from "./app-shell";
import { ProjectView } from "./project-view";

const show = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

const config = ConfigV1.parse({
  version: 1,
  project: { name: "Starfall" },
  pages: [
    { id: "overview", title: "Overview", widgets: [] },
    { id: "ops", title: "Ops", widgets: [{ type: "markdown", content: "hi" }] },
  ],
});
const project = (over: Partial<ListedProject> = {}): ListedProject => ({ id: "r1", owner: "acme", name: "web", isPrivate: false, archived: false, title: "Starfall", color: null, config, issues: [], canManage: false, ...over });

const viewer = { userId: "u1", login: "octo" };
const resize = (width: number) => Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
afterEach(() => resize(1024));

const projects = () => within(screen.getByRole("navigation", { name: "Projects" }));
const unfold = (name: RegExp) => fireEvent.click(projects().getByRole("button", { name }));

describe("AppShell", () => {
  it("lists the visible projects under GitHub and says which are private", () => {
    show(
      <AppShell viewer={viewer} projects={[project({ color: "#7c3aed", isPrivate: true }), project({ name: "api", title: "API" })]}>
        <p>content</p>
      </AppShell>,
    );
    expect(projects().getByText("GitHub")).toBeInTheDocument();
    expect(projects().getByRole("button", { name: /Starfall.*Private/ })).toHaveAttribute("aria-expanded", "false");
    expect(projects().getByRole("button", { name: /API.*Public/ })).toHaveAttribute("aria-expanded", "false");
    expect(projects().queryByRole("link")).toBeNull();
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Orrery" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });
  it("unfolds the project of the current page, and marks that page", () => {
    show(
      <AppShell viewer={viewer} projects={[project(), project({ name: "api", title: "API" })]} current="/p/acme/web/ops">
        x
      </AppShell>,
    );
    expect(projects().getByRole("button", { name: /Starfall/ })).toHaveAttribute("aria-expanded", "true");
    expect(projects().getByRole("button", { name: /API/ })).toHaveAttribute("aria-expanded", "false");
    expect(projects().getByRole("link", { name: "Ops" })).toHaveAttribute("aria-current", "page");
    expect(projects().getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/p/acme/web/overview");
    expect(projects().getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(projects().queryByRole("link", { name: "Settings" })).toBeNull();
  });
  it("folds and unfolds a project on demand", async () => {
    show(
      <AppShell viewer={viewer} projects={[project()]}>
        x
      </AppShell>,
    );
    unfold(/Starfall/);
    expect(await projects().findByRole("link", { name: "Ops" })).toBeInTheDocument();
    unfold(/Starfall/);
    await waitFor(() => expect(projects().queryByRole("link", { name: "Ops" })).toBeNull());
  });
  it("lists the project's settings with its pages, only for a user who manages it", () => {
    show(
      <AppShell viewer={viewer} projects={[project({ canManage: true }), project({ name: "api", title: "API" })]} current="/settings/acme/web">
        x
      </AppShell>,
    );
    const settings = projects().getByRole("link", { name: "Settings" });
    expect(settings).toHaveAttribute("href", "/settings/acme/web");
    expect(settings).toHaveAttribute("aria-current", "page");
    unfold(/API/);
    expect(projects().getAllByRole("link", { name: "Settings" })).toHaveLength(1);
  });
  it("leads to the problems of a project whose config was never valid", () => {
    show(
      <AppShell viewer={viewer} projects={[project({ config: null })]} current="/p/acme/web">
        x
      </AppShell>,
    );
    expect(projects().getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/p/acme/web");
    expect(projects().getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });
  it("unfolds a page of GitHub lists into one link per list, titled by the file or by the kind, as text", async () => {
    const activity = ConfigV1.parse({
      version: 1,
      project: { name: "Starfall" },
      pages: [{ id: "activity", title: "Activity", widgets: [{ type: "github.issues" }, { type: "github.pull_requests", title: "<b>Reviews</b>" }] }],
    });
    const view = show(
      <AppShell viewer={viewer} projects={[project({ config: activity })]} current="/p/acme/web/activity/issues">
        x
      </AppShell>,
    );
    expect(projects().getByRole("button", { name: "Activity" })).toHaveAttribute("aria-expanded", "true");
    expect(projects().queryByRole("link", { name: "Activity" })).toBeNull();
    expect(projects().getByRole("link", { name: "Issues" })).toHaveAttribute("aria-current", "page");
    expect(projects().getByRole("link", { name: "<b>Reviews</b>" })).toHaveAttribute("href", "/p/acme/web/activity/pull-requests");
    view.unmount();
    show(
      <AppShell viewer={viewer} projects={[project({ config: activity })]}>
        x
      </AppShell>,
    );
    unfold(/Starfall/);
    expect(await projects().findByRole("button", { name: "Activity" })).toHaveAttribute("aria-expanded", "false");
    unfold(/^Activity$/);
    expect(await projects().findByRole("link", { name: "Issues" })).toBeInTheDocument();
  });
  it("names the visibility in a tooltip on hover", async () => {
    show(
      <AppShell viewer={viewer} projects={[project({ isPrivate: true })]}>
        x
      </AppShell>,
    );
    const trigger = screen.getByRole("img", { name: "Private" }).parentElement as HTMLElement;
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseMove(trigger);
    expect(await screen.findByText("Private")).toBeInTheDocument();
  });
  it("shows no project group without projects", () => {
    show(
      <AppShell viewer={viewer} projects={[]}>
        x
      </AppShell>,
    );
    expect(screen.queryByRole("navigation", { name: "Projects" })).toBeNull();
    expect(screen.queryByText("GitHub")).toBeNull();
  });
  it("is rendered on the server as on a wide screen", () => {
    resize(400);
    const html = renderToString(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppShell viewer={viewer} projects={[project()]} current="/p/acme/web/ops">
          x
        </AppShell>
      </NextIntlClientProvider>,
    );
    expect(html).toContain('href="/p/acme/web/ops"');
  });
  it("opens as a drawer on a narrow screen, and closes it when a link is followed", async () => {
    resize(400);
    show(
      <AppShell viewer={viewer} projects={[project()]} current="/p/acme/web/overview">
        x
      </AppShell>,
    );
    expect(screen.queryByRole("link", { name: "Orrery" })).toBeNull();
    for (const [role, name] of [["link", "Ops"], ["link", "Orrery"], ["menuitem", "Settings"]]) {
      fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
      if (role === "menuitem") fireEvent.click(await screen.findByRole("button", { name: /octo/ }));
      const link = await screen.findByRole(role, { name });
      link.addEventListener("click", (event) => event.preventDefault());
      fireEvent.click(link);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });
});

describe("EmptyProjects", () => {
  it("explains how a repository gets here", () => {
    show(<EmptyProjects />);
    expect(screen.getByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
  });
});

describe("ProjectView", () => {
  it("shows the title, the archived badge and the selected page's widgets, without repeating the sidebar", () => {
    show(<ProjectView project={project({ isPrivate: true, archived: true })} page={config.pages[1]} />);
    expect(screen.getByRole("heading", { name: "Starfall" })).toBeInTheDocument();
    expect(screen.getByText("acme/web")).toBeInTheDocument();
    expect(screen.queryByText("Private")).toBeNull();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
  it("shows only the list asked for, outside the grid", () => {
    show(<ProjectView project={project()} page={config.pages[1]} list={config.pages[1].widgets[0]} />);
    expect(screen.getByRole("list")).toHaveAttribute("data-layout", "single");
  });
  it("has no badge for an active project", () => {
    show(<ProjectView project={project()} page={config.pages[0]} />);
    expect(screen.queryByText("Archived")).toBeNull();
    expect(screen.getByText("This page has no widgets yet.")).toBeInTheDocument();
  });
  it("lists the problems of the file as text, and keeps showing the last valid version", () => {
    const issues = [
      { code: "config_syntax", path: "$.pages", message: "<script>alert(1)</script>", fix: "Fix it", line: 4 },
      { code: "config_required", path: "$.version", message: "Missing", fix: "Add it" },
    ] as ListedProject["issues"];
    const { container } = show(<ProjectView project={project({ issues })} page={config.pages[0]} />);
    expect(screen.getByText("The configuration file has problems")).toBeInTheDocument();
    expect(screen.getByText("Showing the last valid version until they are fixed.")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(screen.getByText("$.pages")).toBeInTheDocument();
    expect(screen.getByText("This page has no widgets yet.")).toBeInTheDocument();
  });
  it("shows only the problems when the file has never been valid", () => {
    const issues = [{ code: "config_syntax", path: "$", message: "bad", fix: "fix" }] as ListedProject["issues"];
    show(<ProjectView project={project({ config: null, issues })} page={null} />);
    expect(screen.getByText("Nothing can be shown until they are fixed.")).toBeInTheDocument();
    expect(screen.queryByText("This page has no widgets yet.")).toBeNull();
  });
});
