import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { ConfigV1 } from "@/features/config/domain/schema-v1";

const currentViewer = vi.fn();
const open = vi.fn();
const visibleTo = vi.fn();
class Redirected extends Error {}
class NotFound extends Error {}
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (h: Headers) => currentViewer(h) }));
const can = vi.fn();
vi.mock("@/features/access/server/runtime", () => ({ getAccessPolicy: () => ({ can }) }));
vi.mock("../server/runtime", () => ({ getProjects: () => ({ open, visibleTo }) }));
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
  visibleTo.mockResolvedValue([project()]);
  can.mockResolvedValue(false);
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
  it("shows the first page by default, inside the shell", async () => {
    show((await ProjectContent({ params: params() })) as ReactElement);
    expect(screen.getByRole("heading", { name: "Starfall" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });
  it("shows the page asked for, and the problems of a project that was never valid", async () => {
    show((await ProjectContent({ params: params(["ops"]) })) as ReactElement);
    expect(screen.getByRole("link", { name: "Ops" })).toHaveAttribute("aria-current", "page");
    open.mockResolvedValue(project({ config: null, issues: [{ code: "config_syntax", path: "$", message: "bad", fix: "fix" }] }));
    show((await ProjectContent({ params: params() })) as ReactElement);
    expect(screen.getByText("Nothing can be shown until they are fixed.")).toBeInTheDocument();
  });
  it("links to the settings for a user who manages the project, and only for them", async () => {
    show((await ProjectContent({ params: params() })) as ReactElement);
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    can.mockResolvedValue(true);
    show((await ProjectContent({ params: params() })) as ReactElement);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings/acme/web");
    expect(can).toHaveBeenCalledWith(expect.objectContaining({ owner: "acme" }), "octo", "manage_hosts");
  });
});
