import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../../../messages/en.json";
import Placeholder from "./placeholder";

const show = (widget: unknown) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Placeholder widget={widget as never} />
    </NextIntlClientProvider>,
  );

describe("Placeholder", () => {
  it("is titled by the file, as text", () => {
    show({ type: "kpi", title: "<i>Players</i>" });
    expect(screen.getByText("<i>Players</i>")).toBeInTheDocument();
  });
  it("falls back to the type when there is no title", () => {
    show({ type: "github.releases" });
    expect(screen.getByText("github.releases · Not drawn yet")).toBeInTheDocument();
    expect(screen.getByText("github.releases", { selector: "[data-slot=card-title]" })).toBeInTheDocument();
  });
});
