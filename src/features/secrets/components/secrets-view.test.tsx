import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { SecretsView } from "./secrets-view";

vi.mock("@/components/saved-toast", () => ({ SavedToast: ({ message }: { message: string }) => <p>{message}</p> }));

const project = { owner: "acme", name: "web", title: "Starfall" };
const show = (props: Partial<Parameters<typeof SecretsView>[0]> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SecretsView project={project} secrets={[]} saved={false} error={null} {...props} />
    </NextIntlClientProvider>,
  );

describe("SecretsView", () => {
  it("says when there are no secrets, and shows neither a notice nor an error", () => {
    show();
    expect(screen.getByRole("heading", { name: "Secrets of Starfall" })).toBeInTheDocument();
    expect(screen.getByText("No secrets yet.")).toBeInTheDocument();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    expect(screen.queryByText("The secret could not be saved")).not.toBeInTheDocument();
  });
  it("lists names and bound hosts, with a delete form per secret, and no value anywhere", () => {
    const { container } = show({ secrets: [{ name: "A_KEY", boundHosts: ["a.com", "b.com"], updatedAt: new Date(0) }] });
    expect(screen.getByText("A_KEY")).toBeInTheDocument();
    expect(screen.getByText("Bound hosts: a.com, b.com")).toBeInTheDocument();
    const forms = [...container.querySelectorAll("form")];
    expect(forms.map((f) => f.getAttribute("action"))).toEqual(["/settings/acme/web/secrets/delete", "/settings/acme/web/secrets/save"]);
    expect(container.querySelector("input[name=name][type=hidden]")).toHaveValue("A_KEY");
  });
  it("keeps the value box empty, masked and without autocomplete", () => {
    show();
    const value = screen.getByLabelText("Value");
    expect(value).toHaveAttribute("type", "password");
    expect(value).toHaveAttribute("autocomplete", "off");
    expect(value).toHaveValue("");
  });
  it("shows the saved notice and the fix of an error code", () => {
    show({ saved: true, error: "secret_invalid_host" });
    expect(screen.getByText("Saved.")).toBeInTheDocument();
    expect(screen.getByText(/Give a bare host name/)).toBeInTheDocument();
  });
});
