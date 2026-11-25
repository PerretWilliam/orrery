import { describe, expect, it } from "vitest";
import { currentEntry } from "./nav";

const projects = [
  {
    href: "/p/acme/web",
    settingsHref: "/settings/acme/web",
    pages: [
      { href: "/p/acme/web/activity", lists: [{ href: "/p/acme/web/activity/issues" }, { href: "/p/acme/web/activity/releases" }] },
      { href: "/p/acme/web/ops", lists: [] },
    ],
  },
  { href: "/p/acme/web-2", settingsHref: null, pages: [{ href: "/p/acme/web-2", lists: [] }] },
  { href: "/p/acme/empty", settingsHref: null, pages: [] },
];

describe("currentEntry", () => {
  it.each([
    ["/p/acme/web", "/p/acme/web/activity/issues"],
    ["/p/acme/web/activity", "/p/acme/web/activity/issues"],
    ["/p/acme/web/activity/releases", "/p/acme/web/activity/releases"],
    ["/p/Acme/Web/ops", "/p/acme/web/ops"],
    ["/settings/acme/web", "/settings/acme/web"],
    ["/settings/acme/web/secrets", "/settings/acme/web"],
    ["/p/acme/web-2", "/p/acme/web-2"],
    ["/p/acme/empty", undefined],
    ["/settings/acme/web-2", undefined],
    ["/settings", undefined],
    ["/p/acme/web/nope", undefined],
  ])("shows %s as %s", (path, entry) => {
    expect(currentEntry(path, projects)).toBe(entry);
  });
});
