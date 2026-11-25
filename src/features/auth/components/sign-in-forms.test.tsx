import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import messages from "../../../../messages/en.json";
import { AUTH_ERRORS } from "../domain/errors";
import { SignInSkeleton, SignInView } from "./sign-in-forms";

const show = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("SignInView", () => {
  it("posts to /auth/sign-in from a single button", () => {
    show(<SignInView error={null} canSignIn />);
    expect(screen.getByText("Sign in to Orrery")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Sign in with GitHub" });
    expect(button.closest("form")).toHaveAttribute("method", "post");
    expect(button.closest("form")).toHaveAttribute("action", "/auth/sign-in");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("shows the fix of an error code", () => {
    show(<SignInView error="auth_sign_in_refused" canSignIn />);
    expect(screen.getByRole("alert")).toHaveTextContent(AUTH_ERRORS.auth_sign_in_refused.fix);
  });
  it("keeps the product panel while loading, with nothing to act on", () => {
    show(<SignInSkeleton />);
    expect(screen.getByRole("heading", { name: "Code state next to product health." })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading…" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("offers no button before the first-run setup is done", () => {
    show(<SignInView error="auth_not_configured" canSignIn={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent(AUTH_ERRORS.auth_not_configured.fix);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
