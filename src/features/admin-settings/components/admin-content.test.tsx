import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";

const currentViewer = vi.fn();
const overview = vi.fn();
const list = vi.fn();
const visibleTo = vi.fn();
class Redirected extends Error {}
class NotFound extends Error {}
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (h: Headers) => currentViewer(h) }));
vi.mock("@/features/repos/server/runtime", () => ({ getProjects: () => ({ visibleTo }) }));
vi.mock("@/features/audit/server/runtime", () => ({ getAudit: () => ({ list }) }));
vi.mock("../server/runtime", () => ({ getAdminSettings: () => ({ overview, isAdmin: async () => true }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "hub.test" }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  notFound: () => {
    throw new NotFound("404");
  },
}));

import { AdminContent } from "./admin-content";

const run = (query: { saved?: string; error?: string } = {}) => AdminContent({ searchParams: Promise.resolve(query) });
const outcome = async () => {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Redirected || error instanceof NotFound) return error.message;
    throw error;
  }
};
const show = (ui: ReactElement) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);

beforeEach(() => {
  currentViewer.mockResolvedValue({ userId: "u1", login: "octo" });
  overview.mockResolvedValue({ allowlist: [{ kind: "org", value: "acme" }], hosts: [], admins: ["octo"], rules: [], key: { active: "k1", pending: 0 } });
  list.mockResolvedValue([]);
  visibleTo.mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

describe("AdminContent", () => {
  it("sends a visitor without a session to sign-in", async () => {
    currentViewer.mockResolvedValue(null);
    expect(await outcome()).toBe("/sign-in");
  });
  it("is a 404 for a user who is not an admin, before anything else is read", async () => {
    overview.mockResolvedValue(null);
    expect(await outcome()).toBe("404");
    expect(list).not.toHaveBeenCalled();
    expect(visibleTo).not.toHaveBeenCalled();
  });
  it("shows the settings and the audit log", async () => {
    list.mockResolvedValue([{ id: "1", at: new Date("2026-03-04T05:06:07Z"), event: "sign_in", actor: "octo", repository: null, detail: {} }]);
    show((await run({ saved: "1" })) as ReactElement);
    expect(list).toHaveBeenCalledWith("octo", { limit: 50 });
    expect(screen.getByText("org:acme")).toBeInTheDocument();
    expect(screen.getByText("sign_in")).toBeInTheDocument();
    expect(screen.getByText("Saved.")).toBeInTheDocument();
  });
  it("copes with an audit log that says no", async () => {
    list.mockResolvedValue(null);
    show((await run()) as ReactElement);
    expect(screen.getByText("Nothing recorded yet.")).toBeInTheDocument();
  });
  it("shows only error codes that exist, so the URL cannot put text on the page", async () => {
    show((await run({ error: "admin_unknown_project" })) as ReactElement);
    expect(screen.getByText(/not known yet/)).toBeInTheDocument();
    show((await run({ error: "<b>pwned</b>" })) as ReactElement);
    expect(screen.queryByText("<b>pwned</b>")).not.toBeInTheDocument();
    show((await run({ error: "toString" })) as ReactElement);
    expect(screen.getAllByText("The change could not be made")).toHaveLength(1);
  });
});
