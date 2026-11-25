import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { AdminView } from "./admin-view";

vi.mock("@/components/saved-toast", () => ({ SavedToast: ({ message }: { message: string }) => <p>{message}</p> }));

const empty = { allowlist: [], hosts: [], admins: ["octo"], rules: [], key: null };
const show = (props: Partial<Parameters<typeof AdminView>[0]> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AdminView overview={empty} audit={[]} saved={false} error={null} {...props} />
    </NextIntlClientProvider>,
  );

describe("AdminView", () => {
  it("says what an empty instance means in every section", () => {
    show();
    for (const text of [/nobody can sign in except admins/, /No rule: GitHub decides/, /private addresses are refused everywhere/, /encryption keys could not be read/, /Nothing recorded yet/]) expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });
  it("writes the form of a sign-in entry, angle brackets included", () => {
    show();
    expect(screen.getByText(/Entries are org:<login>, team:<org>\/<slug> or user:<login>\. GitHub's own/)).toBeInTheDocument();
  });
  it("lists every entry with a remove form carrying what the removal needs", () => {
    const { container } = show({
      overview: {
        allowlist: [{ kind: "org", value: "acme" }],
        hosts: ["10.0.0.0/8"],
        admins: ["octo", "other"],
        rules: [
          { project: "acme/web", rule: { effect: "hide" } },
          { project: "acme/api", rule: { effect: "restrict_to", subject: { kind: "team", value: "acme/devs" } } },
        ],
        key: { active: "k2", pending: 3 },
      },
    });
    expect(screen.getByText("org:acme")).toBeInTheDocument();
    expect(screen.getByText("acme/web · hide")).toBeInTheDocument();
    expect(screen.getByText("acme/api · restrict_to · team:acme/devs")).toBeInTheDocument();
    expect(screen.getByText("Active key: k2. Still on another key: 3.")).toBeInTheDocument();
    const forms = (action: string) => container.querySelectorAll(`form:has(input[name=action][value=${action}])`);
    expect(forms("allow_remove")).toHaveLength(1);
    expect(forms("host_remove")).toHaveLength(1);
    expect(forms("admin_remove")).toHaveLength(2);
    expect(forms("rule_remove")).toHaveLength(2);
    expect(forms("rotate_keys")).toHaveLength(1);
    expect(container.querySelector("input[name=effect][value=restrict_to]")).toBeInTheDocument();
    expect(container.querySelector("input[name=subject][type=hidden][value='team:acme/devs']")).toBeInTheDocument();
    for (const form of container.querySelectorAll("form")) expect(form).toHaveAttribute("action", "/admin/action");
  });
  it("shows the audit log as text, with the system for entries without a user", () => {
    show({
      audit: [
        { id: "1", at: new Date("2026-03-04T05:06:07Z"), event: "key_rotated", actor: null, repository: null, detail: { secrets: "2" } },
        { id: "2", at: new Date("2026-03-04T05:06:08Z"), event: "secret_created", actor: "octo", repository: "acme/web", detail: { name: "<b>X</b>" } },
      ],
    });
    expect(screen.getByText("2026-03-04 05:06:07")).toBeInTheDocument();
    expect(screen.getByText("system")).toBeInTheDocument();
    expect(screen.getByText("acme/web")).toBeInTheDocument();
    expect(screen.getByText("name=<b>X</b>")).toBeInTheDocument();
  });
  it("shows the saved notice and the fix of an error code", () => {
    show({ saved: true, error: "admin_last_admin" });
    expect(screen.getByText("Saved.")).toBeInTheDocument();
    expect(screen.getByText(/always keeps at least one/)).toBeInTheDocument();
  });
});
