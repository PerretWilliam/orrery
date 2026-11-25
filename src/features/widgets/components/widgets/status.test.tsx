import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../../../messages/en.json";
import Status from "./status";

const show = (data: unknown, title?: string) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Status widget={{ type: "status", source: "s", path: "s", up: ["ok"], degraded: ["slow"], ...(title ? { title } : {}) } as never} data={data} />
    </NextIntlClientProvider>,
  );

describe("Status", () => {
  it.each([["ok", "Up"], ["slow", "Degraded"], ["whatever", "Down"]])("says %s as %s, in words", (value, label) => {
    show({ s: value });
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });
  it("shows the title from the file, as text", () => {
    show({ s: "ok" }, "<i>API</i>");
    expect(screen.getByText("<i>API</i>")).toBeInTheDocument();
  });
  it("shows the empty state when the source gave nothing", () => {
    show({}, "API");
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
