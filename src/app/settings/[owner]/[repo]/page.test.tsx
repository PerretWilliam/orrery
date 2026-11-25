import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/project-settings/components/settings-content", () => ({ SettingsContent: () => <p>content</p> }));

import SettingsPage from "./page";

describe("project settings page", () => {
  it("renders the content", () => {
    const { container } = render(<SettingsPage params={Promise.resolve({ owner: "a", repo: "b" })} searchParams={Promise.resolve({})} />);
    expect(container).toHaveTextContent("content");
  });
});
