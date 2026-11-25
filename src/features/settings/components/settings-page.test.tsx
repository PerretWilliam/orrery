import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";

const currentViewer = vi.fn();
const visibleTo = vi.fn();
const isAdmin = vi.fn();
class Redirected extends Error {}
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (h: Headers) => currentViewer(h) }));
vi.mock("@/features/repos/server/runtime", () => ({ getProjects: () => ({ visibleTo }) }));
vi.mock("@/features/admin-settings/server/runtime", () => ({ getAdminSettings: () => ({ isAdmin }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "hub.test" }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

import { AppearanceContent } from "./appearance-content";
import { settingsPage } from "./settings-page";

const show = (ui: ReactElement) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
const sections = () => within(screen.getByRole("navigation", { name: "Settings sections" }));
const viewer = { userId: "u1", login: "octo" };

beforeEach(() => {
  currentViewer.mockResolvedValue(viewer);
  visibleTo.mockResolvedValue([]);
  isAdmin.mockResolvedValue(false);
});
afterEach(() => vi.clearAllMocks());

describe("settingsPage", () => {
  it("links the sections, marks the current one, and hides administration from non-admins", async () => {
    show(await settingsPage(viewer, "tokens", <p>section</p>));
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(sections().getByRole("link", { name: "Appearance" })).toHaveAttribute("href", "/settings");
    expect(sections().getByRole("link", { name: "Agent tokens" })).toHaveAttribute("aria-current", "page");
    expect(sections().queryByRole("link", { name: "Administration" })).toBeNull();
    expect(screen.getByText("section")).toBeInTheDocument();
    expect(visibleTo).toHaveBeenCalledWith("octo");
    expect(isAdmin).toHaveBeenCalledWith(viewer);
  });
  it("offers administration to an admin", async () => {
    isAdmin.mockResolvedValue(true);
    show(await settingsPage(viewer, "appearance", "x"));
    expect(sections().getByRole("link", { name: "Administration" })).toHaveAttribute("href", "/admin");
  });
  it("fails closed when the admin check fails", async () => {
    isAdmin.mockRejectedValue(new Error("database down"));
    await expect(settingsPage(viewer, "appearance", "x")).rejects.toThrow("database down");
  });
});

describe("AppearanceContent", () => {
  it("sends a visitor without a session to sign-in, before reading anything", async () => {
    currentViewer.mockResolvedValue(null);
    await expect(AppearanceContent()).rejects.toThrow("/sign-in");
    expect(visibleTo).not.toHaveBeenCalled();
  });
  it("offers the theme choice", async () => {
    show(await AppearanceContent());
    expect(screen.getByRole("heading", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dark" })).toBeInTheDocument();
  });
});
