import { fireEvent, render, screen, within } from "@testing-library/react";
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
  const first = () => screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent?.split(" ")[0]);
  it("sorts by any column, numbers in numeric order and empty cells last, keeping the host's order until asked", () => {
    wrap(<Issues widget={{ type: "github.issues" } as never} data={[{ ...items[0], key: "#10" }, items[1], { ...items[2], key: "#9" }]} />);
    expect(first()).toEqual(["#10", "#2", "#9"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Title" }));
    expect(first()).toEqual(["#2", "#9", "#10"]);
    for (const name of ["Sort by Author", "Sort by Updated"]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(first()[0]).toBe("#10");
    }
    fireEvent.click(screen.getByRole("button", { name: "Sort by State" }));
    expect(first()[0]).toBe("#2");
    expect(screen.getByRole("columnheader", { name: /State/ })).toHaveAttribute("aria-sort", "ascending");
  });
  it("searches every column, and says when nothing matches", () => {
    wrap(<Issues widget={{ type: "github.issues" } as never} data={items} />);
    const box = screen.getByRole("searchbox", { name: "Search rows" });
    fireEvent.change(box, { target: { value: "ada" } });
    expect(first()).toEqual(["#1"]);
    expect(screen.getByText("1 row")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No row matches your search.")).toBeInTheDocument();
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
