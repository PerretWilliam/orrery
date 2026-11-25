import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { SidebarProvider } from "@/components/ui/sidebar";
import { UserMenu } from "./user-menu";

const show = (image?: string | null) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SidebarProvider>
        <UserMenu login="octo" image={image} />
      </SidebarProvider>
    </NextIntlClientProvider>,
  );

/** jsdom loads no image: this one "loads" at once and records what was asked for. */
const requested: string[] = [];
class LoadingImage {
  onload: (() => void) | null = null;
  complete = true;
  naturalWidth = 32;
  set src(value: string) {
    requested.push(value);
    queueMicrotask(() => this.onload?.());
  }
}
afterEach(() => {
  requested.length = 0;
  vi.unstubAllGlobals();
});

describe("UserMenu", () => {
  it("shows the login, with initials while there is no avatar", () => {
    show();
    expect(screen.getByRole("button", { name: /octo/ })).toBeInTheDocument();
    expect(screen.getByText("OC")).toBeInTheDocument();
  });
  it("loads a GitHub avatar through this instance, never from GitHub itself", async () => {
    vi.stubGlobal("Image", LoadingImage);
    const { container } = show("https://avatars.githubusercontent.com/u/1?v=4");
    await vi.waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    for (const src of [container.querySelector("img")?.getAttribute("src"), ...requested]) expect(src).toMatch(/^\/_next\/image\?url=https%3A%2F%2Favatars\.githubusercontent\.com%2Fu%2F1/);
  });
  it("loads nothing for an image from anywhere else", () => {
    vi.stubGlobal("Image", LoadingImage);
    const { container } = show("https://evil.test/track.png");
    expect(container.querySelector("img")).toBeNull();
    expect(requested).toEqual([]);
    expect(screen.getByText("OC")).toBeInTheDocument();
  });
  it("leads to the settings, from the menu", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /octo/ }));
    expect(await screen.findByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });
  it("signs out by posting the form, from the menu", async () => {
    const { container } = show();
    const form = container.querySelector("form") as HTMLFormElement;
    expect(form).toHaveAttribute("action", "/auth/sign-out");
    expect(form).toHaveAttribute("method", "post");
    const submitted = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submitted);
    fireEvent.click(screen.getByRole("button", { name: /octo/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(submitted).toHaveBeenCalledTimes(1);
  });
});
