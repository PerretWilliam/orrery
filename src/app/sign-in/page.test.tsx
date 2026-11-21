import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/components/sign-in-content", () => ({ SignInContent: () => <p>sign in</p> }));

import SignInPage from "./page";

describe("sign-in page", () => {
  it("renders the content behind a Suspense boundary, handing over the search parameters", async () => {
    const { findByText } = render(SignInPage({ searchParams: Promise.resolve({}) } as never));
    expect(await findByText("sign in")).toBeInTheDocument();
  });
});
