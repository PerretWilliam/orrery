import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import messages from "../../../../messages/en.json";
import { Freshness, WidgetCrashed, WidgetEmpty, WidgetError, WidgetLoading } from "./widget-states";

const show = (ui: ReactElement) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
const now = new Date("2026-01-01T12:00:00Z");

describe("widget states", () => {
  it("loading is a busy card with an accessible name", () => {
    show(<WidgetLoading />);
    expect(screen.getByLabelText("Loading…")).toHaveAttribute("aria-busy", "true");
  });
  it("empty says so, with or without a title", () => {
    show(<WidgetEmpty title="Players" />);
    expect(screen.getByText("Players")).toBeInTheDocument();
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
    show(<WidgetEmpty />);
    expect(screen.getAllByText("Nothing to show yet.")).toHaveLength(2);
  });
  it("error lists each failure with its code, message and fix, as text", () => {
    show(<WidgetError title="<b>Players</b>" errors={[{ code: "source_timeout", message: "Too slow", fix: "Speed up" }, { code: "secret_unknown", message: "No", fix: "Create it", path: "url" }]} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("<b>Players</b>")).toBeInTheDocument();
    expect(screen.getByText("source_timeout")).toBeInTheDocument();
    expect(screen.getByText("Too slow")).toBeInTheDocument();
    expect(screen.getByText("Speed up")).toHaveTextContent("Fix Speed up");
    expect(screen.getByText("secret_unknown")).toBeInTheDocument();
  });
  it("error without a title falls back to the generic heading", () => {
    show(<WidgetError errors={[]} />);
    expect(screen.getByText("This widget could not load its data")).toBeInTheDocument();
  });
  it("crashed gives no detail, with or without a title", () => {
    show(<WidgetCrashed title="Players" />);
    expect(screen.getByText("Players")).toBeInTheDocument();
    expect(screen.getByText("This widget could not be drawn.")).toBeInTheDocument();
    show(<WidgetCrashed />);
    expect(screen.getAllByText("This widget could not be drawn.")).toHaveLength(2);
  });
  it("freshness shows the age of fresh data, and says when it is refreshing", () => {
    const fetchedAt = new Date("2026-01-01T11:57:00Z");
    show(<Freshness fetchedAt={fetchedAt} stale={false} now={now} />);
    const fresh = screen.getByText("Updated 3 minutes ago");
    expect(fresh).toHaveAttribute("datetime", fetchedAt.toISOString());
    show(<Freshness fetchedAt={fetchedAt} stale now={now} />);
    expect(screen.getByText("Updated 3 minutes ago, refreshing").closest("p")).toHaveAttribute("data-stale", "true");
  });
  it("freshness is absent for a widget without a source", () => {
    const { container } = show(<Freshness fetchedAt={null} stale={false} now={now} />);
    expect(container).toBeEmptyDOMElement();
  });
});
