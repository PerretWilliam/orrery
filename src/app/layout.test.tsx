import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) =>
    new Map(Object.entries(messages.Metadata)).get(key),
}));
vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import RootLayout, { generateMetadata } from "./layout";

describe("RootLayout", () => {
  it("wraps children in an html document with the active locale", async () => {
    const html = renderToStaticMarkup(
      await RootLayout({ children: <p>child</p>, params: Promise.resolve({}) }),
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain("<p>child</p>");
  });
  it("takes the title and description from the catalog", async () => {
    expect(await generateMetadata()).toEqual({
      title: "Orrery",
      description: "Self-hosted control panel for your GitHub repositories",
    });
  });
});
