import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Suspense } from "react";
import { describe, expect, it } from "vitest";
import messages from "../../../../messages/en.json";
import { WIDGET_TYPES } from "@/features/config/domain/schema-v1";
import { LOADERS, WidgetRenderer } from "./registry";

describe("widget registry", () => {
  it("covers exactly the widget types of the schema, so a new type never needs a parser change", () => {
    expect(Object.keys(LOADERS).sort()).toEqual([...WIDGET_TYPES].sort());
  });
  it("loads a component for every type", async () => {
    for (const load of Object.values(LOADERS)) expect(typeof (await load()).default).toBe("function");
  });
  it("draws a widget with the lazy component of its type", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Suspense fallback="wait">
          <WidgetRenderer widget={{ type: "markdown", content: "hello" } as never} data={null} />
        </Suspense>
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText("hello")).toBeInTheDocument();
  });
});
