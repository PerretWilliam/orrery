import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { use } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { ConfigV1 } from "@/features/config/domain/schema-v1";

const NEVER = vi.hoisted(() => new Promise<never>(() => {}));
vi.mock("./widget-frame", () => ({
  WidgetFrame: ({ widget }: { widget: { type: string; title?: string } }) => {
    if (widget.title === "boom") throw new Error("boom");
    if (widget.title === "slow") use(NEVER);
    return <p>frame {widget.type}</p>;
  },
}));

import { WidgetGrid } from "./widget-grid";

const config = ConfigV1.parse({ version: 1, project: { name: "S" }, pages: [{ id: "o", title: "O", widgets: [] }] });
const show = (widgets: Parameters<typeof WidgetGrid>[0]["widgets"], single?: boolean) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WidgetGrid project={{ id: "r1", owner: "acme", name: "web", config }} widgets={widgets} single={single} />
    </NextIntlClientProvider>,
  );

describe("WidgetGrid", () => {
  it("says so when the page has no widgets", () => {
    show([]);
    expect(screen.getByText("This page has no widgets yet.")).toBeInTheDocument();
  });
  it("shows a loading card in the cell of a widget still waiting, whatever the others do", async () => {
    show([{ type: "kpi", title: "slow" }, { type: "markdown" }] as never);
    expect(await screen.findByText("frame markdown")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Loading…")).toHaveLength(1);
  });
  it("draws each frame in its cell, placed from the layout", async () => {
    show([{ type: "kpi" }, { type: "markdown" }, { type: "table" }] as never);
    expect(await screen.findByText("frame kpi")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const items = screen.getAllByRole("listitem");
    expect(items[0].style.getPropertyValue("--col")).toBe("1 / span 3");
    expect(items[0].style.getPropertyValue("--row")).toBe("1 / span 2");
    expect(items[2].style.getPropertyValue("--col")).toBe("1 / span 12");
  });
  it("shows a single widget outside the grid", async () => {
    show([{ type: "github.issues" }] as never, true);
    expect(await screen.findByText("frame github.issues")).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveAttribute("data-layout", "single");
    expect(screen.getByRole("listitem").className).not.toContain("--col");
  });
  it("keeps a widget that crashes in its own cell, titled by the file, and the others drawn", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    show([{ type: "kpi", title: "boom" }, { type: "markdown" }] as never);
    expect(await screen.findByText("This widget could not be drawn.")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(await screen.findByText("frame markdown")).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
