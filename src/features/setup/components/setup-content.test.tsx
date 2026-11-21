import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";

const service = { isCompleted: vi.fn(), hasSession: vi.fn(), begin: vi.fn() };
const cookieGet = vi.fn();
const headerGet = vi.fn();
class Redirected extends Error {}
const redirect = vi.fn((to: string) => {
  throw new Redirected(to);
});
vi.mock("../server/runtime", () => ({ getSetupService: () => service }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }), headers: async () => ({ get: headerGet }) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

import { DoneContent, SetupContent } from "./setup-content";

const show = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
const search = (params: Record<string, string | string[] | undefined> = {}) => Promise.resolve(params);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function open({ session = "sess", hasSession = true, host = "orrery.test", proto = null as string | null } = {}) {
  service.isCompleted.mockResolvedValue(false);
  service.hasSession.mockResolvedValue(hasSession);
  cookieGet.mockReturnValue(session ? { value: session } : undefined);
  headerGet.mockImplementation((name: string) => (name === "host" ? host : name === "x-forwarded-proto" ? proto : null));
}

describe("SetupContent", () => {
  it("sends a finished instance away from the wizard", async () => {
    service.isCompleted.mockResolvedValue(true);
    await expect(SetupContent({ searchParams: search() })).rejects.toBeInstanceOf(Redirected);
    expect(redirect).toHaveBeenCalledWith("/");
  });
  it("asks for the token when the browser has no session", async () => {
    open({ session: "", hasSession: false });
    show(await SetupContent({ searchParams: search() }));
    expect(screen.getByLabelText("Setup token")).toBeInTheDocument();
    expect(service.hasSession).toHaveBeenCalledWith(undefined);
    expect(service.begin).not.toHaveBeenCalled();
  });
  it("shows the fix of a known error code from the URL, and nothing for an unknown one", async () => {
    open({ hasSession: false });
    show(await SetupContent({ searchParams: search({ error: "setup_token_invalid" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Copy the setup token");
  });
  it.each([["<script>alert(1)</script>"], ["toString"], ["__proto__"], [["setup_token_invalid"]], [undefined]])("ignores the error parameter %j", async (error) => {
    open({ hasSession: false });
    show(await SetupContent({ searchParams: search({ error }) }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("offers to create the App once the token was accepted, with webhooks off when no public URL is set", async () => {
    open();
    service.begin.mockResolvedValue({ ok: true, manifest: { name: "Orrery" }, state: "the-state" });
    show(await SetupContent({ searchParams: search() }));
    expect(service.begin).toHaveBeenCalledWith("sess", "http://orrery.test", false);
    expect(screen.getByRole("button", { name: "Create the GitHub App" }).closest("form")).toHaveAttribute("action", "https://github.com/settings/apps/new?state=the-state");
  });
  it("turns webhooks on and uses the public URL when it is set", async () => {
    vi.stubEnv("ORRERY_PUBLIC_URL", "https://orrery.example.com");
    open({ proto: "https" });
    service.begin.mockResolvedValue({ ok: true, manifest: {}, state: "s" });
    show(await SetupContent({ searchParams: search() }));
    expect(service.begin).toHaveBeenCalledWith("sess", "https://orrery.example.com", true);
  });
  it("shows why the App cannot be created yet (for example no encryption key)", async () => {
    open();
    service.begin.mockResolvedValue({ ok: false, issue: { code: "setup_key_missing" } });
    show(await SetupContent({ searchParams: search() }));
    expect(screen.getByRole("alert")).toHaveTextContent("ORRERY_ENCRYPTION_KEYS");
    expect(screen.queryByRole("button", { name: "Create the GitHub App" })).not.toBeInTheDocument();
  });
  it("refuses an unusable host header instead of building URLs from it", async () => {
    open({ host: "evil.test/<x>" });
    show(await SetupContent({ searchParams: search() }));
    expect(service.begin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Submit the form from this site");
  });
});

describe("DoneContent", () => {
  it("links to the install page for a valid app slug", async () => {
    show(await DoneContent({ searchParams: search({ app: "orrery-abc" }) }));
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://github.com/apps/orrery-abc/installations/new");
  });
  it.each([["../evil"], ["a/b"], ["x".repeat(101)], [""], [["a", "b"]], [undefined]])("shows no link for the slug %j", async (app) => {
    show(await DoneContent({ searchParams: search({ app }) }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
