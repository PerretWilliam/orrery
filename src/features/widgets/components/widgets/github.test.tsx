import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../../../messages/en.json";
import Issues from "./github-issues";
import PullRequests from "./github-pull-requests";
import Releases from "./github-releases";
import WorkflowRuns from "./github-workflow-runs";

const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{node}</NextIntlClientProvider>);
const items = [
  { key: "#1", title: "<b>Crash</b>", state: "open", by: "ada", url: "https://github.com/a/b/issues/1", at: "2026-01-05T10:00:00Z" },
  { key: "#2", title: "Odd link", state: "closed", by: null, url: "", at: "not a date" },
  { key: "#3", title: "No date", state: "open", by: null, url: "https://evil.test/x", at: null },
];

describe("GitHub widgets", () => {
  it("list items as text, with the link only for github.com, the date and the state", () => {
    const { container } = wrap(<Issues widget={{ type: "github.issues", title: "Issues" } as never} data={items} />);
    expect(screen.getByText("Issues")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "#1 <b>Crash</b>" });
    expect(link).toHaveAttribute("href", "https://github.com/a/b/issues/1");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("ada")).toBeInTheDocument();
    expect(screen.getByText("Jan 5, 2026")).toBeInTheDocument();
    expect(screen.getByText("closed")).toBeInTheDocument();
    expect(screen.getByText("#3 No date")).toBeInTheDocument();
  });
  it("draw the list without a title when the file gives none", () => {
    wrap(<PullRequests widget={{ type: "github.pull_requests" } as never} data={items} />);
    expect(screen.getByText("#2 Odd link")).toBeInTheDocument();
  });
  it("show the empty state for no items or a malformed answer, for runs and releases too", () => {
    wrap(<WorkflowRuns widget={{ type: "github.workflow_runs", title: "Runs" } as never} data={[]} />);
    wrap(<Releases widget={{ type: "github.releases" } as never} data={"nope"} />);
    expect(screen.getAllByText("Nothing to show yet.")).toHaveLength(2);
  });
});
