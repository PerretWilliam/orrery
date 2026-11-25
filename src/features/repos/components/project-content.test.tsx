import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { ConfigV1 } from "@/features/config/domain/schema-v1";

const currentViewer = vi.fn();
const open = vi.fn();
class Redirected extends Error {}
class NotFound extends Error {}
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (h: Headers) => currentViewer(h) }));
vi.mock("../server/runtime", () => ({ getProjects: () => ({ open }) }));
vi.mock("./project-view", () => ({
  ProjectView: ({ project, page, list }: { project: { title: string }; page: { id: string } | null; list?: { type: string } }) => (
    <p data-testid="view">{[project.title, page?.id, list?.type].filter(Boolean).join(" ")}</p>
  ),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "hub.test" }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  notFound: () => {
    throw new NotFound("404");
  },
}));

import { ProjectContent } from "./project-content";

const config = ConfigV1.parse({
  version: 1,
  project: { name: "Starfall" },
  pages: [
    { id: "overview", title: "Overview", widgets: [] },
    { id: "ops", title: "Ops", widgets: [] },
    { id: "activity", title: "Activity", widgets: [{ type: "github.issues" }, { type: "github.releases", title: "<img src=x>" }] },
  ],
});
const project = (over = {}) => ({ owner: "acme", name: "web", isPrivate: false, archived: false, title: "Starfall", color: null, config, issues: [], ...over });
const params = (page?: string[]) => Promise.resolve({ owner: "acme", repo: "web", ...(page ? { page } : {}) });
const outcome = async (page?: string[]) => {
  try {
    return await ProjectContent({ params: params(page) });
  } catch (error) {
    if (error instanceof Redirected || error instanceof NotFound) return error.message;
    throw error;
  }
};
const show = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  currentViewer.mockResolvedValue({ userId: "u1", login: "octo" });
  open.mockResolvedValue(project());
});
afterEach(() => vi.clearAllMocks());

describe("ProjectContent", () => {
  it("sends a visitor without a session to sign-in, before looking at the project", async () => {
    currentViewer.mockResolvedValue(null);
    expect(await outcome()).toBe("/sign-in");
    expect(open).not.toHaveBeenCalled();
  });
  it("is a 404 for a project that is missing or hidden, asking with the viewer's login", async () => {
    open.mockResolvedValue(null);
    expect(await outcome()).toBe("404");
    expect(open).toHaveBeenCalledWith({ owner: "acme", name: "web" }, "octo");
  });
  it("is a 404 for an unknown page, for extra path segments, and for a page of a project without config", async () => {
    expect(await outcome(["nope"])).toBe("404");
    expect(await outcome(["overview", "x"])).toBe("404");
    open.mockResolvedValue(project({ config: null }));
    expect(await outcome(["overview"])).toBe("404");
  });
  const shown = () => screen.getByTestId("view").textContent;
  const place = () => decodeURIComponent(document.cookie);
  it("shows the first page by default, and remembers it", async () => {
    show((await ProjectContent({ params: params() })) as ReactElement);
    expect(shown()).toBe("Starfall overview");
    expect(place()).toContain("orrery_last=/p/acme/web/overview");
  });
  it("shows the page asked for, and a project that was never valid without one", async () => {
    show((await ProjectContent({ params: params(["ops"]) })) as ReactElement).unmount();
    open.mockResolvedValue(project({ config: null }));
    show((await ProjectContent({ params: params() })) as ReactElement);
    expect(shown()).toBe("Starfall");
  });
  it("shows the first list of a page of lists by default, and the one asked for", async () => {
    const view = show((await ProjectContent({ params: params(["activity"]) })) as ReactElement);
    expect(shown()).toBe("Starfall activity github.issues");
    expect(place()).toContain("orrery_last=/p/acme/web/activity/issues");
    view.unmount();
    show((await ProjectContent({ params: params(["activity", "releases"]) })) as ReactElement);
    expect(shown()).toBe("Starfall activity github.releases");
  });
  it("is a 404 for an unknown list, a list under a page that has none, and a path deeper than a list", async () => {
    expect(await outcome(["activity", "nope"])).toBe("404");
    expect(await outcome(["ops", "issues"])).toBe("404");
    expect(await outcome(["activity", "issues", "x"])).toBe("404");
  });
});
