import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../../messages/en.json";
import { WidgetGrid } from "./widget-grid";

const show = (widgets: Parameters<typeof WidgetGrid>[0]["widgets"]) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WidgetGrid widgets={widgets} />
    </NextIntlClientProvider>,
  );

describe("WidgetGrid", () => {
  it("says so when the page has no widgets", () => {
    show([]);
    expect(screen.getByText("This page has no widgets yet.")).toBeInTheDocument();
  });
  it("shows a loading card while a widget's code is fetched, then its renderer, placed from the layout", async () => {
    show([{ type: "kpi", title: "<b>Players</b>" }, { type: "markdown" }, { type: "table" }] as never);
    expect(screen.getAllByLabelText("Loading…").length).toBeGreaterThan(0);
    expect(await screen.findByText("<b>Players</b>")).toBeInTheDocument(); // text, not markup
    expect(await screen.findAllByText(/Not drawn yet/)).toHaveLength(3);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].style.getPropertyValue("--col")).toBe("1 / span 3");
    expect(items[0].style.getPropertyValue("--row")).toBe("1 / span 2");
    expect(items[2].style.getPropertyValue("--col")).toBe("1 / span 12");
  });
});
