import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";

const setup = { isCompleted: vi.fn() };
const currentUser = vi.fn();
class Redirected extends Error {}
const redirect = vi.fn((to: string) => {
  throw new Redirected(to);
});
vi.mock("@/features/setup/server/runtime", () => ({ getSetupService: () => setup }));
vi.mock("../server/runtime", () => ({ currentUser: (headers: Headers) => currentUser(headers) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "hub.test" }) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

import { SignInContent } from "./sign-in-content";

const show = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
const search = (params: Record<string, string | string[] | undefined> = {}) => Promise.resolve(params);

afterEach(() => vi.clearAllMocks());

describe("SignInContent", () => {
  it("says the instance is not set up, without a button, and does not look at sessions", async () => {
    setup.isCompleted.mockResolvedValue(false);
    show(await SignInContent({ searchParams: search() }));
    expect(screen.getByRole("alert")).toHaveTextContent("Finish the first-run setup");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(currentUser).not.toHaveBeenCalled();
  });
  it("sends a signed-in user home", async () => {
    setup.isCompleted.mockResolvedValue(true);
    currentUser.mockResolvedValue({ ok: true, userId: "u1" });
    await expect(SignInContent({ searchParams: search() })).rejects.toBeInstanceOf(Redirected);
    expect(redirect).toHaveBeenCalledWith("/");
  });
  it("shows the button to a visitor", async () => {
    setup.isCompleted.mockResolvedValue(true);
    currentUser.mockResolvedValue(null);
    show(await SignInContent({ searchParams: search() }));
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("tells a suspended user why, and lets them sign in again", async () => {
    setup.isCompleted.mockResolvedValue(true);
    currentUser.mockResolvedValue({ ok: false, issue: { code: "auth_refresh_failed" } });
    show(await SignInContent({ searchParams: search() }));
    expect(screen.getByRole("alert")).toHaveTextContent("GitHub no longer lets the hub renew your access");
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
  it("shows the fix of one of our error codes from the URL, ahead of the session's", async () => {
    setup.isCompleted.mockResolvedValue(true);
    currentUser.mockResolvedValue({ ok: false, issue: { code: "auth_refresh_failed" } });
    show(await SignInContent({ searchParams: search({ error: "auth_origin_invalid" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Send the request from this site");
  });
  it.each([["unable_to_create_user"], ["<script>alert(1)</script>"], ["toString"], ["__proto__"]])("treats the foreign error %j as a refusal, and echoes nothing", async (error) => {
    setup.isCompleted.mockResolvedValue(true);
    currentUser.mockResolvedValue(null);
    const { container } = show(await SignInContent({ searchParams: search({ error }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ask an instance admin to allow your GitHub account");
    expect(container.innerHTML).not.toContain(error);
  });
  it.each([[""], [undefined], [["auth_origin_invalid"]]])("ignores the error parameter %j", async (error) => {
    setup.isCompleted.mockResolvedValue(true);
    currentUser.mockResolvedValue(null);
    show(await SignInContent({ searchParams: search({ error }) }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
