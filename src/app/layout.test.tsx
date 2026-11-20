import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));

import RootLayout, { metadata } from "./layout";

describe("RootLayout", () => {
  it("wraps children in an English html document", () => {
    const html = renderToStaticMarkup(
      <RootLayout params={Promise.resolve({})}>
        <p>child</p>
      </RootLayout>,
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain("<p>child</p>");
  });
  it("sets the product title", () => {
    expect(metadata.title).toBe("Orrery");
  });
});
