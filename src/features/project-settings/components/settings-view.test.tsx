import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../../messages/en.json";
import { SettingsView } from "./settings-view";

const project = { owner: "acme", name: "web", title: "Starfall" };
const show = (props: Partial<Parameters<typeof SettingsView>[0]> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SettingsView project={project} overview={{ hosts: [], canManageSecrets: true, canReindex: true }} saved={false} error={null} {...props} />
    </NextIntlClientProvider>,
  );

describe("SettingsView", () => {
  it("says there is no restriction without hosts, and offers the secrets and re-index actions", () => {
    const { container } = show();
    expect(screen.getByRole("heading", { name: "Settings of Starfall" })).toBeInTheDocument();
    expect(screen.getByText("No restriction: every public host is allowed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage secrets" })).toHaveAttribute("href", "/settings/acme/web/secrets");
    expect([...container.querySelectorAll("form")].map((f) => f.getAttribute("action"))).toEqual(["/settings/acme/web/hosts/add", "/settings/acme/web/reindex"]);
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });
  it("lists the hosts with a remove form each", () => {
    const { container } = show({ overview: { hosts: ["a.com", "*.b.com"], canManageSecrets: true, canReindex: true } });
    expect(screen.getByText("*.b.com")).toBeInTheDocument();
    expect(container.querySelectorAll("form[action$='/hosts/remove']")).toHaveLength(2);
    expect(container.querySelector("input[name=host][type=hidden]")).toHaveValue("a.com");
  });
  it("shows only the actions the user may take", () => {
    show({ overview: { hosts: [], canManageSecrets: false, canReindex: false } });
    expect(screen.queryByRole("link", { name: "Manage secrets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-index now" })).not.toBeInTheDocument();
  });
  it("shows the saved notice and the fix of an error code", () => {
    show({ saved: true, error: "settings_invalid_host" });
    expect(screen.getByText("Saved.")).toBeInTheDocument();
    expect(screen.getByText(/no scheme, port, path, address or range/)).toBeInTheDocument();
  });
});
