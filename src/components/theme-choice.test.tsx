import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { ThemeChoice, ThemeSync } from "./theme-choice";

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
const ui = (
  <NextIntlClientProvider locale="en" messages={messages}>
    <ThemeChoice />
  </NextIntlClientProvider>
);
const item = (name: string) => screen.getByRole("button", { name });
const selected = (name: string) => expect(item(name)).toHaveAttribute("aria-pressed", "true");

describe("ThemeChoice", () => {
  it("starts on the stored theme, then remembers and applies the chosen one", () => {
    localStorage.setItem("orrery-theme", "light");
    render(ui);
    selected("Light");
    fireEvent.click(item("Dark"));
    expect(localStorage.getItem("orrery-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    selected("Dark");
    fireEvent.click(item("System"));
    expect(localStorage.getItem("orrery-theme")).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    selected("System");
  });
  it("keeps a theme selected when the selected one is pressed again", () => {
    render(ui);
    fireEvent.click(item("System"));
    selected("System");
  });
  it("renders as system on the server, whatever this browser stored", () => {
    localStorage.setItem("orrery-theme", "dark");
    const host = document.createElement("div");
    host.innerHTML = renderToString(ui);
    expect(host.querySelector('[aria-pressed="true"]')).toHaveTextContent("System");
  });
  it("still works when storage is blocked", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(ui);
    selected("System");
    fireEvent.click(item("Dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    selected("Dark");
    get.mockRestore();
    set.mockRestore();
  });
});

describe("ThemeSync", () => {
  it("follows the system live while on system, and renders nothing", () => {
    const { container, unmount } = render(<ThemeSync />);
    expect(container).toBeEmptyDOMElement();
    dark = true;
    act(() => listeners.forEach((l) => l({ matches: true })));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    unmount();
    expect(listeners).toHaveLength(0);
  });
});
