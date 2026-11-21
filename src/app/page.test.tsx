import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

vi.mock("@/features/repos/components/home-content", async (original) => ({
  ...(await original<typeof import("@/features/repos/components/home-content")>()),
  HomeContent: () => <p>home content</p>,
}));

import Home from "./page";

describe("Home", () => {
  it("renders the home content behind a Suspense boundary", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Home />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText("home content")).toBeInTheDocument();
  });
});
