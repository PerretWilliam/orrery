import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { WidgetBoundary } from "./widget-boundary";

const Boom = () => {
  throw new Error("secret detail from the source");
};
const show = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);

describe("WidgetBoundary", () => {
  it("draws its children when they work", () => {
    show(<WidgetBoundary><p>fine</p></WidgetBoundary>);
    expect(screen.getByText("fine")).toBeInTheDocument();
  });
  it("replaces only the widget that throws, without showing the error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    show(
      <>
        <WidgetBoundary title="Players"><Boom /></WidgetBoundary>
        <WidgetBoundary><p>neighbour</p></WidgetBoundary>
      </>,
    );
    expect(screen.getByText("This widget could not be drawn.")).toBeInTheDocument();
    expect(screen.getByText("Players")).toBeInTheDocument();
    expect(screen.getByText("neighbour")).toBeInTheDocument();
    expect(screen.queryByText(/secret detail/)).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
