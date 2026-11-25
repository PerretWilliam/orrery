import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Suspense, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { ConfigV1 } from "@/features/config/domain/schema-v1";

const load = vi.fn();
vi.mock("../server/runtime", () => ({ getWidgetData: () => ({ load }) }));

import { PageFreshness, WidgetFrame } from "./widget-frame";

const config = ConfigV1.parse({ version: 1, project: { name: "S" }, pages: [{ id: "o", title: "O", widgets: [] }] });
const project = { id: "r1", owner: "acme", name: "web", config };
const show = (ui: ReactElement) => render(<NextIntlClientProvider locale="en" messages={messages}><Suspense fallback="wait">{ui}</Suspense></NextIntlClientProvider>);
afterEach(() => vi.clearAllMocks());

describe("WidgetFrame", () => {
  it("draws the renderer with the source's data, leaving the age of fresh data to the page", async () => {
    load.mockResolvedValue({ ok: true, data: { n: 1 }, fetchedAt: new Date(Date.now() - 120_000), stale: false });
    show((await WidgetFrame({ project, widget: { type: "markdown", title: "Players", content: "hello" } as never })) as ReactElement);
    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledWith(project, { type: "markdown", title: "Players", content: "hello" });
  });
  it("says the age of stale data on the widget itself", async () => {
    load.mockResolvedValue({ ok: true, data: null, fetchedAt: new Date(Date.now() - 120_000), stale: true });
    show((await WidgetFrame({ project, widget: { type: "markdown", content: "hello" } as never })) as ReactElement);
    expect(await screen.findByText("Updated 2 minutes ago, refreshing")).toBeInTheDocument();
  });
  it("shows the failure of the source in the widget's own cell, titled by the file, with no renderer", async () => {
    load.mockResolvedValue({ ok: false, errors: [{ code: "source_timeout", message: "Too slow", fix: "Speed up" }] });
    show((await WidgetFrame({ project, widget: { type: "markdown", title: "Players", content: "hello" } as never })) as ReactElement);
    expect(screen.getByRole("alert")).toHaveTextContent("source_timeout");
    expect(screen.getByText("Players")).toBeInTheDocument();
    expect(screen.queryByText("hello")).not.toBeInTheDocument();
  });
  it("has no age to show for a widget without a source", async () => {
    load.mockResolvedValue({ ok: true, data: null, fetchedAt: null, stale: false });
    show((await WidgetFrame({ project, widget: { type: "markdown", content: "hello" } as never })) as ReactElement);
    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  });
});

describe("PageFreshness", () => {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
  const widgets = [1, 2, 3, 4].map((n) => ({ type: "markdown", content: String(n) })) as never;

  it("says one age for the page, that of its oldest fresh data, ignoring failures, stale data and widgets without a source", async () => {
    load
      .mockResolvedValueOnce({ ok: true, data: null, fetchedAt: ago(2), stale: false })
      .mockResolvedValueOnce({ ok: true, data: null, fetchedAt: ago(5), stale: false })
      .mockResolvedValueOnce({ ok: true, data: null, fetchedAt: ago(30), stale: true })
      .mockResolvedValueOnce({ ok: false, errors: [] });
    show((await PageFreshness({ project, widgets })) as ReactElement);
    expect(screen.getByText("Updated 5 minutes ago")).toBeInTheDocument();
  });
  it("says nothing when no widget has fresh data", async () => {
    load.mockResolvedValue({ ok: true, data: null, fetchedAt: null, stale: false });
    expect(await PageFreshness({ project, widgets })).toBeNull();
  });
});
