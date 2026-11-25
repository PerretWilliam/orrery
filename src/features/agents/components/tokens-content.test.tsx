import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";

const currentViewer = vi.fn();
const visibleTo = vi.fn();
const list = vi.fn();
let cookie: string | undefined;
class Redirected extends Error {}
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (h: Headers) => currentViewer(h) }));
vi.mock("@/features/repos/server/runtime", () => ({ getProjects: () => ({ visibleTo }) }));
vi.mock("../server/runtime", () => ({ getTokens: () => ({ list }) }));
vi.mock("@/features/admin-settings/server/runtime", () => ({ getAdminSettings: () => ({ isAdmin: async () => false }) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "hub.test" }),
  cookies: async () => ({ get: (name: string) => (name === "orrery_new_token" && cookie ? { value: cookie } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

import { TokensContent } from "./tokens-content";

vi.mock("@/components/saved-toast", () => ({ SavedToast: ({ message }: { message: string }) => <p>{message}</p> }));

const run = (query: { saved?: string; error?: string } = {}) => TokensContent({ searchParams: Promise.resolve(query) });
const show = (ui: ReactElement) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
const TOKEN = `orr_${"a".repeat(43)}`;

beforeEach(() => {
  cookie = undefined;
  currentViewer.mockResolvedValue({ userId: "u1", login: "octo" });
  visibleTo.mockResolvedValue([]);
  list.mockResolvedValue([{ id: "t1", name: "Claude", createdAt: new Date(0), expiresAt: new Date(Date.now() + 1e10), lastUsedAt: null, revokedAt: null }]);
});
afterEach(() => vi.clearAllMocks());

describe("TokensContent", () => {
  it("sends a visitor without a session to sign-in", async () => {
    currentViewer.mockResolvedValue(null);
    await expect(run()).rejects.toThrow(Redirected);
    expect(list).not.toHaveBeenCalled();
  });
  it("lists the viewer's own tokens", async () => {
    show((await run({ saved: "1" })) as ReactElement);
    expect(list).toHaveBeenCalledWith({ userId: "u1", login: "octo" });
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Saved.")).toBeInTheDocument();
    expect(screen.queryByText("Your new token")).not.toBeInTheDocument();
  });
  it("shows a token from the cookie, but only when it is shaped like one", async () => {
    cookie = TOKEN;
    show((await run()) as ReactElement);
    expect(screen.getByText(TOKEN)).toBeInTheDocument();
    cookie = "<b>pwned</b>";
    show((await run()) as ReactElement);
    expect(screen.queryByText("<b>pwned</b>")).not.toBeInTheDocument();
  });
  it("shows only error codes that exist, so the URL cannot put text on the page", async () => {
    show((await run({ error: "token_invalid_name" })) as ReactElement);
    expect(screen.getByText(/label of 1 to 64/)).toBeInTheDocument();
    show((await run({ error: "<b>pwned</b>" })) as ReactElement);
    expect(screen.queryByText("<b>pwned</b>")).not.toBeInTheDocument();
    show((await run({ error: "toString" })) as ReactElement);
    expect(screen.getAllByText("The token could not be created")).toHaveLength(1);
  });
});
