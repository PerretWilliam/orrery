import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../messages/en.json";
import { AppToaster } from "./app-toaster";

describe("AppToaster", () => {
  it("has a named region, there before the first toast", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppToaster />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
