import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY, THEME_SCRIPT, nextTheme, parseTheme, resolveTheme } from "./theme";

describe("theme", () => {
  it("reads only known themes, and anything else is system", () => {
    expect(["light", "dark", "system"].map(parseTheme)).toEqual(["light", "dark", "system"]);
    for (const bad of [null, undefined, "Dark", 3, "", {}]) expect(parseTheme(bad)).toBe("system");
  });
  it("resolves system by the OS preference, and the others as they are", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("cycles system, light, dark and back", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });
});

describe("THEME_SCRIPT", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.unstubAllGlobals();
  });
  const run = (prefersDark: boolean) => {
    vi.stubGlobal("matchMedia", () => ({ matches: prefersDark }));
    new Function(THEME_SCRIPT)();
    return document.documentElement.classList.contains("dark");
  };
  it("sets the dark class from the stored choice, else from the system", () => {
    expect(run(true)).toBe(true);
    expect(run(false)).toBe(false);
    localStorage.setItem(THEME_KEY, "dark");
    expect(run(false)).toBe(true);
    localStorage.setItem(THEME_KEY, "light");
    expect(run(true)).toBe(false);
  });
  it("never throws when storage or matchMedia are unavailable", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("no");
    });
    expect(() => new Function(THEME_SCRIPT)()).not.toThrow();
  });
});
