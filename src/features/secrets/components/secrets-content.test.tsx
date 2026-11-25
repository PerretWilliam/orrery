import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";

const currentViewer = vi.fn();
const open = vi.fn();
const visibleTo = vi.fn();
const list = vi.fn();
class Redirected extends Error {}
class NotFound extends Error {}
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (h: Headers) => currentViewer(h) }));
vi.mock("@/features/repos/server/runtime", () => ({ getProjects: () => ({ open, visibleTo }) }));
vi.mock("../server/runtime", () => ({ getSecrets: () => ({ list }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "hub.test" }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  notFound: () => {
    throw new NotFound("404");
  },
}));

import { SecretsContent } from "./secrets-content";

vi.mock("@/components/saved-toast", () => ({ SavedToast: ({ message }: { message: string }) => <p>{message}</p> }));

const project = { owner: "acme", name: "web", isPrivate: false, archived: false, title: "Starfall", color: null, config: null, issues: [] };
const run = (query: { saved?: string; error?: string } = {}) =>
  SecretsContent({ params: Promise.resolve({ owner: "acme", repo: "web" }), searchParams: Promise.resolve(query) });
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
  open.mockResolvedValue(project);
  visibleTo.mockResolvedValue([project]);
  list.mockResolvedValue([{ name: "A_KEY", boundHosts: ["a.com"], updatedAt: new Date(0) }]);
});
afterEach(() => vi.clearAllMocks());

describe("SecretsContent", () => {
  it("sends a visitor without a session to sign-in", async () => {
    currentViewer.mockResolvedValue(null);
    expect(await outcome()).toBe("/sign-in");
  });
  it("is a 404 for a hidden project and for a user who may not manage secrets", async () => {
    open.mockResolvedValue(null);
    expect(await outcome()).toBe("404");
    expect(list).not.toHaveBeenCalled();
    open.mockResolvedValue(project);
    list.mockResolvedValue(null);
    expect(await outcome()).toBe("404");
    expect(list).toHaveBeenCalledWith(project, { userId: "u1", login: "octo" });
  });
  it("shows the secrets of the project", async () => {
    show((await run({ saved: "1" })) as ReactElement);
    expect(screen.getByText("A_KEY")).toBeInTheDocument();
    expect(screen.getByText("Saved.")).toBeInTheDocument();
  });
  it("shows only error codes that exist, so the URL cannot put text on the page", async () => {
    show((await run({ error: "secret_invalid_name" })) as ReactElement);
    expect(screen.getByText(/capital letters/)).toBeInTheDocument();
    show((await run({ error: "<b>pwned</b>" })) as ReactElement);
    expect(screen.queryByText("<b>pwned</b>")).not.toBeInTheDocument();
    show((await run({ error: "toString" })) as ReactElement);
    expect(screen.getAllByText("The secret could not be saved")).toHaveLength(1);
  });
});
