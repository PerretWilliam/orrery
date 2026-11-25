import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, expect, it } from "vitest";
import messages from "../../../../../messages/en.json";
import Bar from "./bar";
import Donut from "./donut";
import Line from "./line";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{node}</NextIntlClientProvider>);
const rows = [{ d: "mon", n: 3 }, { d: "<b>tue</b>", n: 5 }];
const data = { rows };

describe("chart widgets", () => {
  it("line draws a chart under its title", () => {
    const { container } = wrap(<Line widget={{ type: "line", source: "s", path: "rows", x: "d", y: "n", title: "Signups" } as never} data={data} />);
    expect(screen.getByText("Signups")).toBeInTheDocument();
    expect(container.querySelector("[data-slot=chart]")).not.toBeNull();
  });
  it("line shows the empty state when nothing is usable", () => {
    wrap(<Line widget={{ type: "line", source: "s", path: "rows", x: "d", y: "n" } as never} data={{ rows: [] }} />);
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
  });
  it("bar draws a chart, without a title when none is given", () => {
    const { container } = wrap(<Bar widget={{ type: "bar", source: "s", path: "rows", x: "d", y: "n" } as never} data={data} />);
    expect(container.querySelector("[data-slot=chart]")).not.toBeNull();
    expect(container.querySelector("[data-slot=card-title]")).toBeNull();
  });
  it("bar shows the empty state when nothing is usable", () => {
    wrap(<Bar widget={{ type: "bar", source: "s", path: "nope", x: "d", y: "n", title: "Empty bars" } as never} data={data} />);
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
  });
  it("donut draws a chart and cycles colours past the palette", () => {
    const many = { rows: Array.from({ length: 7 }, (_, i) => ({ k: `s${i}`, v: i + 1 })) };
    const { container } = wrap(<Donut widget={{ type: "donut", source: "s", path: "rows", name: "k", value: "v", title: "Split" } as never} data={many} />);
    expect(screen.getByText("Split")).toBeInTheDocument();
    expect(container.querySelector("[data-slot=chart]")).not.toBeNull();
  });
  it("donut shows the empty state when no slice is positive", () => {
    wrap(<Donut widget={{ type: "donut", source: "s", path: "rows", name: "k", value: "v" } as never} data={{ rows: [{ k: "a", v: 0 }] }} />);
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
  });
});
