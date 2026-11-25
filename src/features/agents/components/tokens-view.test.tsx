import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { TokensView } from "./tokens-view";

vi.mock("@/components/saved-toast", () => ({ SavedToast: ({ message }: { message: string }) => <p>{message}</p> }));

const NOW = new Date("2026-06-10T00:00:00Z");
const token = (over = {}) => ({ id: "t1", name: "Claude", createdAt: new Date("2026-06-01T00:00:00Z"), expiresAt: new Date("2026-09-01T00:00:00Z"), lastUsedAt: null, revokedAt: null, ...over });
const show = (props: Partial<Parameters<typeof TokensView>[0]> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TokensView tokens={[]} created={null} saved={false} error={null} now={NOW} {...props} />
    </NextIntlClientProvider>,
  );

describe("TokensView", () => {
  it("says when there are no tokens, and shows no notice, token or error", () => {
    show();
    expect(screen.getByRole("heading", { name: "Agent tokens" })).toBeInTheDocument();
    expect(screen.getByText("No tokens yet.")).toBeInTheDocument();
    expect(screen.queryByText("Your new token")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    expect(screen.queryByText("The token could not be created")).not.toBeInTheDocument();
  });
  it("lists label, dates and state, and offers to revoke only an active token", () => {
    const { container } = show({
      tokens: [
        token({ lastUsedAt: new Date("2026-06-05T00:00:00Z") }),
        token({ id: "t2", name: "Old", revokedAt: new Date(1) }),
        token({ id: "t3", name: "Late", expiresAt: new Date("2026-06-09T00:00:00Z") }),
      ],
    });
    expect(screen.getByText("Created 2026-06-01, expires 2026-09-01, last used 2026-06-05")).toBeInTheDocument();
    expect(screen.getByText("Created 2026-06-01, expires 2026-09-01, last used never")).toBeInTheDocument();
    expect(screen.getByText("(active)")).toBeInTheDocument();
    expect(screen.getByText("(revoked)")).toBeInTheDocument();
    expect(screen.getByText("(expired)")).toBeInTheDocument();
    const revoke = [...container.querySelectorAll("form[action='/account/tokens/revoke']")];
    expect(revoke).toHaveLength(1);
    expect(revoke[0].querySelector("input[name=id]")).toHaveValue("t1");
  });
  it("shows a new token once, with the warning", () => {
    show({ created: `orr_${"a".repeat(43)}` });
    expect(screen.getByText(`orr_${"a".repeat(43)}`)).toBeInTheDocument();
    expect(screen.getByText(/shown once/)).toBeInTheDocument();
  });
  it("has a creation form with the default lifetime as a hint", () => {
    const { container } = show();
    expect(container.querySelector("form[action='/account/tokens/create']")).toBeInTheDocument();
    expect(screen.getByLabelText("Label")).toBeRequired();
    expect(screen.getByLabelText("Lifetime in days")).toHaveAttribute("placeholder", "90");
    expect(screen.getByText("Lifetime: 90 days by default, 365 at most.")).toBeInTheDocument();
  });
  it("shows the saved notice and the fix of an error code", () => {
    show({ saved: true, error: "token_invalid_expiry" });
    expect(screen.getByText("Saved.")).toBeInTheDocument();
    expect(screen.getByText(/whole number of days/)).toBeInTheDocument();
  });
});
