import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/repos/components/welcome-content", () => ({ WelcomeContent: () => <p>content</p> }));

import WelcomePage from "./page";

describe("welcome page", () => {
  it("renders the content", () => {
    const { container } = render(<WelcomePage />);
    expect(container).toHaveTextContent("content");
  });
});
