import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/admin-settings/components/admin-content", () => ({ AdminContent: () => <p>content</p> }));

import AdminPage from "./page";

describe("admin page", () => {
  it("renders the content", () => {
    const { container } = render(<AdminPage searchParams={Promise.resolve({})} />);
    expect(container).toHaveTextContent("content");
  });
});
