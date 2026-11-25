import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/repos/components/project-content", () => ({ ProjectContent: () => <p>project</p> }));

import ProjectPage from "./page";

describe("project page", () => {
  it("renders the project behind a Suspense boundary, handing over the params", async () => {
    const { findByText } = render(ProjectPage({ params: Promise.resolve({ owner: "acme", repo: "web" }) }));
    expect(await findByText("project")).toBeInTheDocument();
  });
});
