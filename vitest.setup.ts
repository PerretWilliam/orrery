import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest has no globals, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

// jsdom has no matchMedia: a light, static system, unless a test stubs its own.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as never;
}
