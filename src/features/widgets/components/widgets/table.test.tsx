import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, expect, it } from "vitest";
import messages from "../../../../../messages/en.json";
import TableWidget from "./table";

// jsdom has no layout: give every element the size of a 384px-high viewport so the virtual list has a window.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 384 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
});

const columns = [
  { header: "Player", path: "name", format: "text" },
  { header: "Score", path: "score", format: "number" },
  { header: "Joined", path: "joined", format: "date" },
  { header: "State", path: "state", format: "badge" },
];
const show = (widget: object, data: unknown) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TableWidget widget={{ type: "table", source: "s", path: "rows", columns, searchable: true, ...widget } as never} data={data} />
    </NextIntlClientProvider>,
  );
const rows = [
  { name: "Cleo", score: 1500, joined: "2026-01-05", state: "active" },
  { name: "Ada", score: 20, joined: "not a date", state: "banned" },
  { name: "<b>Bob</b>", score: 300, joined: "2026-03-01" },
];
const names = () => screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent);

describe("Table widget", () => {
  it("shows titled rows with numbers, dates and badges formatted, and source text as text", () => {
    const { container } = show({ title: "Players" }, { rows });
    expect(screen.getByText("Players")).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByText("Jan 5, 2026")).toBeInTheDocument();
    expect(screen.getByText("not a date")).toBeInTheDocument();
    expect(screen.getByText("banned").getAttribute("data-slot")).toBe("badge");
    expect(screen.getByText("<b>Bob</b>")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("3 rows")).toBeInTheDocument();
  });
  it("sorts by a column (numbers as numbers, biggest first), then flips, and puts empty cells last", () => {
    show({}, { rows });
    fireEvent.click(screen.getByRole("button", { name: "Sort by Score" }));
    expect(names()).toEqual(["Cleo", "<b>Bob</b>", "Ada"]);
    expect(screen.getByRole("columnheader", { name: /Score/ })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Score" }));
    expect(names()).toEqual(["Ada", "<b>Bob</b>", "Cleo"]);
    expect(screen.getByRole("columnheader", { name: /Score/ })).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: "Sort by State" }));
    expect(names()).toEqual(["Cleo", "Ada", "<b>Bob</b>"]);
  });
  it("filters by the search box and says when nothing matches", () => {
    show({}, { rows });
    const box = screen.getByRole("searchbox", { name: "Search rows" });
    fireEvent.change(box, { target: { value: "ada" } });
    expect(names()).toEqual(["Ada"]);
    expect(screen.getByText("1 row")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No row matches your search.")).toBeInTheDocument();
  });
  it("has no search box when the file turns it off", () => {
    show({ searchable: false }, { rows });
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
  it("draws only the rows in view for thousands of rows, with spacer rows keeping the scroll size", () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ name: `p${i}`, score: i }));
    const { container } = show({}, { rows: many });
    expect(screen.getAllByRole("row").length).toBeLessThan(40);
    expect(screen.getByText("p0")).toBeInTheDocument();
    expect(screen.getByText("5,000 rows")).toBeInTheDocument();
    const scroller = container.querySelector(".overflow-y-auto") as HTMLElement;
    scroller.scrollTop = 4000; // row 100
    fireEvent.scroll(scroller);
    expect(screen.queryByText("p0")).toBeNull();
    expect(screen.getByText("p100")).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeLessThan(40);
  });
  it("shows text as is in a number column, and nothing for a missing value", () => {
    show({}, { rows: [{ name: "Zed", score: "n/a" }] });
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });
  it("shows the empty state without rows", () => {
    show({}, { rows: [] });
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
  });
});
