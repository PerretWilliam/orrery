import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../../../messages/en.json";
import Cohort from "./cohort";

const show = (widget: object, data: unknown) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Cohort widget={{ type: "cohort", source: "s", path: "rows", cohort: "week", values: "ret", ...widget } as never} data={data} />
    </NextIntlClientProvider>,
  );

describe("Cohort", () => {
  it("writes each retention as a percentage, shades it, and leaves gaps as dashes", () => {
    const { container } = show({ title: "Retention" }, { rows: [{ week: "<b>W1</b>", ret: [100, 25.5, -50, 150] }, { week: "W2", ret: [50] }] });
    expect(screen.getByText("Retention")).toBeInTheDocument();
    expect(screen.getByText("<b>W1</b>")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("25.5%")).toBeInTheDocument();
    expect(screen.getAllByText("–")).toHaveLength(3);
    for (const day of ["D0", "D1", "D2", "D3"]) expect(screen.getByText(day)).toBeInTheDocument();
    const shaded = container.querySelectorAll("td[style]");
    expect(shaded).toHaveLength(5);
    expect((shaded[0] as HTMLElement).style.backgroundColor).toContain("var(--primary) 40%");
  });
  it("draws the matrix without a title when the file gives none", () => {
    show({}, { rows: [{ week: "W1", ret: [0.5] }] });
    expect(screen.getByText("50%")).toBeInTheDocument();
  });
  it("shows the empty state without rows", () => {
    show({}, { rows: [] });
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
  });
  it("shows the empty state when rows have no values", () => {
    show({ title: "Empty" }, { rows: [{ week: "W1", ret: [] }] });
    expect(screen.getAllByText("Nothing to show yet.")).not.toHaveLength(0);
  });
});
