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
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

import { WelcomeContent } from "./welcome-content";

afterEach(() => vi.clearAllMocks());

describe("WelcomeContent", () => {
  it("sends a stranger to sign-in without listing anything", async () => {
    currentViewer.mockResolvedValue(null);
    await expect(WelcomeContent()).rejects.toThrow("redirect:/sign-in");
    expect(visibleTo).not.toHaveBeenCalled();
  });
  it("sends someone who has a project back to the entry page", async () => {
    currentViewer.mockResolvedValue({ userId: "u1", login: "octo" });
    visibleTo.mockResolvedValue([{ owner: "acme", name: "web" }]);
    await expect(WelcomeContent()).rejects.toThrow("redirect:/");
    expect(visibleTo).toHaveBeenCalledWith("octo");
  });
  it("shows the empty state when there is nothing to see", async () => {
    currentViewer.mockResolvedValue({ userId: "u1", login: "octo" });
    visibleTo.mockResolvedValue([]);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {(await WelcomeContent()) as ReactElement}
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
  });
});
