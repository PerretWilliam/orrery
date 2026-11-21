import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import messages from "../../../../messages/en.json";
import { SETUP_ERRORS } from "../domain/errors";
import { buildManifest } from "../domain/manifest";
import { CreateAppForm, SetupBlocked, SetupDone, SetupNotice, TokenForm } from "./setup-forms";

const show = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("TokenForm", () => {
  it("posts a password field to /setup/token, never autocompleted", () => {
    show(<TokenForm error={null} />);
    const input = screen.getByLabelText("Setup token");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("name", "token");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toBeRequired();
    const form = input.closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/setup/token");
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("shows the fix of an error code", () => {
    show(<TokenForm error="setup_token_invalid" />);
    expect(screen.getByRole("alert")).toHaveTextContent(SETUP_ERRORS.setup_token_invalid.fix);
  });
});

describe("CreateAppForm", () => {
  const manifest = buildManifest("https://orrery.example.com", true);
  it("posts the manifest to GitHub with the state in the URL", () => {
    show(<CreateAppForm manifest={manifest} state="st&te=1" error={null} />);
    const button = screen.getByRole("button", { name: "Create the GitHub App" });
    const form = button.closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "https://github.com/settings/apps/new?state=st%26te%3D1");
    const hidden = form?.querySelector("input[name=manifest]") as HTMLInputElement;
    expect(JSON.parse(hidden.value)).toEqual(JSON.parse(JSON.stringify(manifest)));
    expect(screen.getByText(/read-only/)).toBeInTheDocument();
  });
  it("shows an error from the previous attempt", () => {
    show(<CreateAppForm manifest={manifest} state="s" error="setup_github_failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent(SETUP_ERRORS.setup_github_failed.fix);
  });
});

describe("SetupNotice", () => {
  it("renders nothing without a code", () => {
    const { container } = show(<SetupNotice code={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SetupBlocked", () => {
  it("shows the page title and the fix of the error", () => {
    show(<SetupBlocked code="setup_key_missing" />);
    expect(screen.getByText(messages.Setup.title)).toBeInTheDocument();
    expect(screen.getByText(SETUP_ERRORS.setup_key_missing.fix)).toBeInTheDocument();
  });
});

describe("SetupDone", () => {
  it("links to the install page of the new App", () => {
    show(<SetupDone slug="orrery-abc" />);
    expect(screen.getByText("GitHub App created")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Install the GitHub App" })).toHaveAttribute("href", "https://github.com/apps/orrery-abc/installations/new");
  });
  it("has no link without a valid slug", () => {
    show(<SetupDone slug={null} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
