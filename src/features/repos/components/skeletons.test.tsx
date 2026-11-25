import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../../messages/en.json";
import { CenteredSkeleton, ProjectSkeleton, SettingsSkeleton, ShellSkeleton } from "./skeletons";

describe("skeletons", () => {
  it.each([ProjectSkeleton, SettingsSkeleton, CenteredSkeleton, ShellSkeleton])("%o is announced once as loading", (Component) => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Component />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("status", { name: "Loading…" })).toHaveAttribute("aria-busy", "true");
  });

  it("draws no word and no image before the first page, which would be painted ahead of it", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ShellSkeleton />
      </NextIntlClientProvider>,
    );
    expect(container.textContent).toBe("");
    expect(container.querySelector("img")).toBeNull();
  });
});
