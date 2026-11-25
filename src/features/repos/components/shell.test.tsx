import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import messages from "../../../../messages/en.json";
import { ConfigV1 } from "@/features/config/domain/schema-v1";
import type { Project } from "../server/projects";
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
const project = (over: Partial<Project> = {}): Project => ({ id: "r1", owner: "acme", name: "web", isPrivate: false, archived: false, title: "Starfall", color: null, config, issues: [], ...over });

describe("AppShell", () => {
  it("links to the visible projects, marks the current one and offers sign-out", () => {
    show(
      <AppShell projects={[project({ color: "#7c3aed" }), project({ name: "api", title: "API" })]} current={{ owner: "acme", name: "web" }}>
        <p>content</p>
      </AppShell>,
    );
    const nav = screen.getByRole("navigation", { name: "Projects" });
    expect(within(nav).getByRole("link", { name: "Starfall" })).toHaveAttribute("href", "/p/acme/web");
    expect(within(nav).getByRole("link", { name: "Starfall" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "API" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" }).closest("form")).toHaveAttribute("action", "/auth/sign-out");
    expect(screen.getByRole("link", { name: "Orrery" })).toHaveAttribute("href", "/");
  });
  it("marks nothing without a current project", () => {
    show(<AppShell projects={[project()]}>x</AppShell>);
    expect(screen.getByRole("link", { name: "Starfall" })).not.toHaveAttribute("aria-current");
  });
});

describe("EmptyProjects", () => {
  it("explains how a repository gets here", () => {
    show(<EmptyProjects />);
    expect(screen.getByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
  });
});

describe("ProjectView", () => {
  it("shows the title, badges, page tabs and the selected page's widgets", () => {
    show(<ProjectView project={project({ isPrivate: true, archived: true })} page={config.pages[1]} />);
    expect(screen.getByRole("heading", { name: "Starfall" })).toBeInTheDocument();
    expect(screen.getByText("acme/web")).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Pages" });
    expect(within(tabs).getByRole("link", { name: "Ops" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/p/acme/web/overview");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
  it("has no badges for a public, active project", () => {
    show(<ProjectView project={project()} page={config.pages[0]} />);
    expect(screen.queryByText("Private")).toBeNull();
    expect(screen.queryByText("Archived")).toBeNull();
    expect(screen.getByText("This page has no widgets yet.")).toBeInTheDocument();
  });
  it("lists the problems of the file as text, and keeps showing the last valid version", () => {
    const issues = [
      { code: "config_syntax", path: "$.pages", message: "<script>alert(1)</script>", fix: "Fix it", line: 4 },
      { code: "config_required", path: "$.version", message: "Missing", fix: "Add it" },
    ] as Project["issues"];
    const { container } = show(<ProjectView project={project({ issues })} page={config.pages[0]} />);
    expect(screen.getByText("The configuration file has problems")).toBeInTheDocument();
    expect(screen.getByText("Showing the last valid version until they are fixed.")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(screen.getByText("$.pages")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
  });
  it("shows only the problems when the file has never been valid", () => {
    const issues = [{ code: "config_syntax", path: "$", message: "bad", fix: "fix" }] as Project["issues"];
    show(<ProjectView project={project({ config: null, issues })} page={null} />);
    expect(screen.getByText("Nothing can be shown until they are fixed.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
  });
});
