import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/setup/components/setup-content", () => ({
  SetupContent: () => <p>wizard</p>,
  DoneContent: () => <p>done</p>,
}));

import SetupDonePage from "./done/page";
import SetupPage from "./page";

describe("setup pages", () => {
  it("render the wizard behind a Suspense boundary, handing over the search parameters", async () => {
    const { findByText } = render(SetupPage({ searchParams: Promise.resolve({}) } as never));
    expect(await findByText("wizard")).toBeInTheDocument();
  });
  it("render the done step the same way", async () => {
    const { findByText } = render(SetupDonePage({ searchParams: Promise.resolve({}) } as never));
    expect(await findByText("done")).toBeInTheDocument();
  });
});
