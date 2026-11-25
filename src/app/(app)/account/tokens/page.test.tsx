import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/agents/components/tokens-content", () => ({ TokensContent: () => <p>content</p> }));

import TokensPage from "./page";

describe("tokens page", () => {
  it("renders the content", () => {
    const { container } = render(<TokensPage searchParams={Promise.resolve({})} />);
    expect(container).toHaveTextContent("content");
  });
});
