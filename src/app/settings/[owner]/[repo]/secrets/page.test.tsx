import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/secrets/components/secrets-content", () => ({ SecretsContent: () => <p>content</p> }));

import SecretsPage from "./page";

describe("secrets page", () => {
  it("renders the content", () => {
    const { container } = render(<SecretsPage params={Promise.resolve({ owner: "a", repo: "b" })} searchParams={Promise.resolve({})} />);
    expect(container).toHaveTextContent("content");
  });
});
