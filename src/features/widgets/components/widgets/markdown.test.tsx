import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../../../messages/en.json";
import Markdown from "./markdown";

const show = (widget: object, data: unknown = null) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Markdown widget={{ type: "markdown", ...widget } as never} data={data} />
    </NextIntlClientProvider>,
  );

describe("Markdown", () => {
  it("draws every block and inline element of the subset", () => {
    const { container } = show({
      title: "Notes",
      content: "# Big\n\ntext **bold** *em* `code` [site](https://example.com)\n\n- one\n- two\n\n1. first\n\n> quote\n\n---\n\n```\nraw\n```\n\n### Small",
    });
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Big", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Small", level: 3 })).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("em")).toHaveTextContent("em");
    expect(container.querySelector("p code")).toHaveTextContent("code");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(1);
    expect(container.querySelector("blockquote")).toHaveTextContent("quote");
    expect(container.querySelector("hr")).toBeInTheDocument();
    expect(container.querySelector("pre code")).toHaveTextContent("raw");
  });
  it("opens links safely and keeps nothing but plain links", () => {
    show({ content: "[site](https://example.com) [bad](javascript:alert(1))" });
    const link = screen.getByRole("link", { name: "site" });
    expect(link).toHaveAttribute("href", "https://example.com/");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("link", { name: "bad" })).not.toBeInTheDocument();
  });
  it("renders HTML in the text as text, from the file and from a source alike", () => {
    const payload = "<script>window.pwned=1</script><img src=x onerror=\"window.pwned=1\">";
    const inline = show({ content: payload });
    expect(inline.container.querySelector("script, img")).toBeNull();
    expect(inline.container).toHaveTextContent(payload);
    inline.unmount();
    const fromSource = show({ source: "s", path: "notes" }, { notes: payload });
    expect(fromSource.container.querySelector("script, img")).toBeNull();
    expect(fromSource.container).toHaveTextContent(payload);
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  });
  it("reads the text from the source at the path, without a title", () => {
    show({ source: "s", path: "data.notes" }, { data: { notes: "from the source" } });
    expect(screen.getByText("from the source")).toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
  });
  it("shows the empty state for nothing, for a value that is not text, and for blank text", () => {
    for (const data of [{}, { notes: 42 }, { notes: " \n " }]) {
      const { unmount } = show({ title: "Notes", source: "s", path: "notes" }, data);
      expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
      unmount();
    }
    show({ source: "s" }, { notes: "x" });
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
  });
});
