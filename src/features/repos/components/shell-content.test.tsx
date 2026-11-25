import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";

const currentViewer = vi.fn();
const visibleTo = vi.fn();
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (h: Headers) => currentViewer(h) }));
vi.mock("../server/runtime", () => ({ getProjects: () => ({ visibleTo }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "hub.test" }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/settings" }));

import { ShellContent } from "./shell-content";

const show = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
afterEach(() => vi.clearAllMocks());

describe("ShellContent", () => {
  it("shows no sidebar and lists nothing without a session, leaving the page to answer", async () => {
    currentViewer.mockResolvedValue(null);
    show(await ShellContent({ children: <p>page</p> }));
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(visibleTo).not.toHaveBeenCalled();
  });
  it("lists only what the viewer may see around the page", async () => {
    currentViewer.mockResolvedValue({ userId: "u1", login: "octo" });
    visibleTo.mockResolvedValue([{ owner: "acme", name: "web", isPrivate: false, title: "Starfall", color: null, config: null, canManage: false }]);
    show((await ShellContent({ children: <p>page</p> })) as ReactElement);
    expect(visibleTo).toHaveBeenCalledWith("octo");
    expect(screen.getByRole("button", { name: /Starfall/ })).toBeInTheDocument();
    expect(screen.getByText("page")).toBeInTheDocument();
  });
});
