import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../../../messages/en.json";
import Kpi from "./kpi";

const show = (widget: object, data: unknown) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Kpi widget={{ type: "kpi", source: "s", path: "v", label: "Day-7 retention", ...widget } as never} data={data} />
    </NextIntlClientProvider>,
  );

describe("Kpi", () => {
  it("shows the number, formatted, with its unit, and the label as title when there is none", () => {
    show({ unit: "%" }, { v: 1234.5 });
    expect(screen.getByText("Day-7 retention")).toBeInTheDocument();
    expect(screen.getByText("1,234.5")).toBeInTheDocument();
    expect(screen.getByText("%")).toBeInTheDocument();
  });
  it("shows a text value as is, titled by the file with the label beneath, and no trend or alert", () => {
    show({ title: "Health" }, { v: "<b>fine</b>" });
    expect(screen.getByText("<b>fine</b>")).toBeInTheDocument(); // text, not markup
    expect(screen.getByText("Health")).toBeInTheDocument();
    expect(screen.getByText("Day-7 retention")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/vs previous/)).not.toBeInTheDocument();
  });
  it("shows the trend with its sign, for up, down and flat", () => {
    for (const [delta, text] of [[2.5, "+2.5 vs previous"], [-1, "-1 vs previous"], [0, "0 vs previous"]] as const) {
      const { unmount } = show({ trend: "d" }, { v: 1, d: delta });
      expect(screen.getByText(text)).toBeInTheDocument();
      unmount();
    }
  });
  it("says in words when the value is past a threshold, below or above", () => {
    const below = show({ alert: { below: 18 } }, { v: 10 });
    expect(screen.getByRole("status")).toHaveTextContent("Alert: below 18");
    below.unmount();
    show({ alert: { above: 1000 } }, { v: 5000 });
    expect(screen.getByRole("status")).toHaveTextContent("Alert: above 1,000");
  });
  it("shows the empty state when the source has no value at the path", () => {
    show({}, { other: 1 });
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
    expect(screen.getByText("Day-7 retention")).toBeInTheDocument();
  });
  it("titles the empty state by the file when there is a title", () => {
    show({ title: "Players" }, null);
    expect(screen.getByText("Players")).toBeInTheDocument();
  });
});
