import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/settings/components/appearance-content", () => ({ AppearanceContent: () => <p>content</p> }));

import SettingsPage from "./page";

describe("settings page", () => {
  it("renders the content", () => {
    const { container } = render(<SettingsPage />);
    expect(container).toHaveTextContent("content");
  });
});
