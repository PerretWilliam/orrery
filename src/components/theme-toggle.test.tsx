import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { ThemeToggle } from "./theme-toggle";

let listeners: ((e: { matches: boolean }) => void)[] = [];
let dark = false;
beforeEach(() => {
  listeners = [];
  dark = false;
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return dark;
    },
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: unknown) => (listeners = listeners.filter((l) => l !== fn)),
  }));
});
afterEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  vi.unstubAllGlobals();
});
const show = () => render(<NextIntlClientProvider locale="en" messages={messages}><ThemeToggle /></NextIntlClientProvider>);

describe("ThemeToggle", () => {
  it("starts on the stored theme, and cycles system, light, dark, remembering and applying each", () => {
    localStorage.setItem("orrery-theme", "light");
    show();
    expect(screen.getByRole("button", { name: "Theme: Light. Switch theme." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem("orrery-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: "Theme: Dark. Switch theme." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem("orrery-theme")).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(screen.getByRole("button", { name: "Theme: System. Switch theme." })).toBeInTheDocument();
  });
  it("follows the system live while on system", () => {
    show();
    dark = true;
    act(() => listeners.forEach((l) => l({ matches: true })));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
  it("renders as system on the server, whatever this browser stored", () => {
    localStorage.setItem("orrery-theme", "dark");
    const html = renderToString(<NextIntlClientProvider locale="en" messages={messages}><ThemeToggle /></NextIntlClientProvider>);
    expect(html).toContain("Theme: System. Switch theme.");
  });
  it("still works when storage is blocked", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    show();
    expect(screen.getByRole("button", { name: "Theme: System. Switch theme." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    get.mockRestore();
    set.mockRestore();
  });
});
