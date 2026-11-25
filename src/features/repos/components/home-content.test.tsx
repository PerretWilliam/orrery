import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";

const setup = { isCompleted: vi.fn() };
const currentViewer = vi.fn();
const visibleTo = vi.fn();
const cookieValue = vi.fn();
class Redirected extends Error {}
const redirect = vi.fn((to: string) => {
  throw new Redirected(to);
});
vi.mock("@/features/setup/server/runtime", () => ({ getSetupService: () => setup }));
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (h: Headers) => currentViewer(h) }));
vi.mock("../server/runtime", () => ({ getProjects: () => ({ visibleTo }) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "hub.test" }),
  cookies: async () => ({ get: (name: string) => (name === "orrery_last" && cookieValue() !== undefined ? { value: cookieValue() } : undefined) }),
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

import { HomeContent } from "./home-content";

const show = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
const project = (name: string, pages: string[] = ["overview", "ops"]) => ({
  owner: "acme",
  name,
  title: name,
  color: null,
  config: { pages: pages.map((id) => ({ id, widgets: id === "activity" ? [{ type: "github.issues" }, { type: "github.releases" }] : [] })) },
});
const open = async () => {
  try {
    return await HomeContent();
  } catch (error) {
    if (error instanceof Redirected) return `redirect:${error.message}`;
    throw error;
  }
};

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://hub.test/db");
  setup.isCompleted.mockResolvedValue(true);
  currentViewer.mockResolvedValue({ userId: "u1", login: "octo" });
  visibleTo.mockResolvedValue([project("web"), project("api")]);
  cookieValue.mockReturnValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("HomeContent", () => {
  it("is only the product name while the instance has no database, touching nothing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    show((await HomeContent()) as ReactElement);
    expect(screen.getByRole("heading", { name: "Orrery" })).toBeInTheDocument();
    expect(setup.isCompleted).not.toHaveBeenCalled();
  });
  it("sends a fresh instance to setup and a stranger to sign-in", async () => {
    setup.isCompleted.mockResolvedValue(false);
    expect(await open()).toBe("redirect:/setup");
    setup.isCompleted.mockResolvedValue(true);
    currentViewer.mockResolvedValue(null);
    expect(await open()).toBe("redirect:/sign-in");
    expect(visibleTo).not.toHaveBeenCalled();
  });
  it("goes to the first project without a memory", async () => {
    expect(await open()).toBe("redirect:/p/acme/web");
    expect(visibleTo).toHaveBeenCalledWith("octo");
  });
  it("goes back to the project and page the user left, when they can still see them", async () => {
    cookieValue.mockReturnValue(encodeURIComponent("/p/acme/api/ops"));
    expect(await open()).toBe("redirect:/p/acme/api/ops");
  });
  it("goes back to the list the user left, and to its page when the list is gone", async () => {
    visibleTo.mockResolvedValue([project("web", ["overview", "activity"])]);
    cookieValue.mockReturnValue(encodeURIComponent("/p/acme/web/activity/releases"));
    expect(await open()).toBe("redirect:/p/acme/web/activity/releases");
    cookieValue.mockReturnValue(encodeURIComponent("/p/acme/web/activity/vanished"));
    expect(await open()).toBe("redirect:/p/acme/web/activity");
    cookieValue.mockReturnValue(encodeURIComponent("/p/acme/web/vanished/releases"));
    expect(await open()).toBe("redirect:/p/acme/web");
  });
  it("drops a remembered page that is gone, and keeps the project", async () => {
    cookieValue.mockReturnValue(encodeURIComponent("/p/acme/api/vanished"));
    expect(await open()).toBe("redirect:/p/acme/api");
  });
  it("goes to a remembered project without page, and copes with a project that has no valid config", async () => {
    cookieValue.mockReturnValue(encodeURIComponent("/p/acme/api"));
    expect(await open()).toBe("redirect:/p/acme/api");
    visibleTo.mockResolvedValue([{ ...project("api"), config: null }]);
    cookieValue.mockReturnValue(encodeURIComponent("/p/acme/api/ops"));
    expect(await open()).toBe("redirect:/p/acme/api");
  });
  it("ignores a remembered project the user can no longer see, and a forged cookie", async () => {
    cookieValue.mockReturnValue(encodeURIComponent("/p/acme/gone/ops"));
    expect(await open()).toBe("redirect:/p/acme/web");
    cookieValue.mockReturnValue("https://evil.test");
    expect(await open()).toBe("redirect:/p/acme/web");
  });
  it("shows an empty state, with the shell, when there is nothing to see", async () => {
    visibleTo.mockResolvedValue([]);
    show((await HomeContent()) as ReactElement);
    expect(screen.getByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /octo/ })).toBeInTheDocument();
  });
});
