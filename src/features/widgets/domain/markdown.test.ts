import { describe, expect, it } from "vitest";
import { MAX_MARKDOWN, parseMarkdown, safeHref, type Inline } from "./markdown";

const text = (t: string): Inline => ({ type: "text", text: t });

describe("safeHref", () => {
  it("keeps http, https and mailto, normalized", () => {
    expect(safeHref("https://example.com/a b")).toBe("https://example.com/a%20b");
    expect(safeHref("http://example.com")).toBe("http://example.com/");
    expect(safeHref("mailto:a@b.co")).toBe("mailto:a@b.co");
  });
  it("refuses every other scheme, relative links and garbage", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "data:text/html,<b>", "vbscript:x", "file:///etc/passwd", "//evil.test", "/relative", "x", ""]) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});

describe("parseMarkdown blocks", () => {
  it("parses headings, paragraphs (joined across lines), rules and quotes", () => {
    expect(parseMarkdown("# Title\n\nline one\nline two\n\n---\n> quoted\n###### small")).toEqual([
      { type: "heading", level: 1, children: [text("Title")] },
      { type: "paragraph", children: [text("line one line two")] },
      { type: "rule" },
      { type: "quote", children: [text("quoted")] },
      { type: "heading", level: 6, children: [text("small")] },
    ]);
  });
  it("groups consecutive list items, bullet and numbered apart", () => {
    expect(parseMarkdown("- a\n* b\n1. c\n2. d\n- e")).toEqual([
      { type: "list", ordered: false, items: [[text("a")], [text("b")]] },
      { type: "list", ordered: true, items: [[text("c")], [text("d")]] },
      { type: "list", ordered: false, items: [[text("e")]] },
    ]);
  });
  it("keeps fenced code as is, unparsed, even without a closing fence", () => {
    expect(parseMarkdown("before\n```js\n# not a heading\n**no**\n```\nafter")).toEqual([
      { type: "paragraph", children: [text("before")] },
      { type: "code", text: "# not a heading\n**no**" },
      { type: "paragraph", children: [text("after")] },
    ]);
    expect(parseMarkdown("```\nopen")).toEqual([{ type: "code", text: "open" }]);
  });
  it("treats \\r\\n and a lone \\r as line breaks, and ignores blank input", () => {
    expect(parseMarkdown("a\r\n\r\nb\rc")).toHaveLength(2);
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n \n")).toEqual([]);
  });
  it("is not a heading without a space, nor a list, nor a rule with fewer than three marks", () => {
    expect(parseMarkdown("#nope")).toEqual([{ type: "paragraph", children: [text("#nope")] }]);
    expect(parseMarkdown("-nope")).toEqual([{ type: "paragraph", children: [text("-nope")] }]);
    expect(parseMarkdown("--")).toEqual([{ type: "paragraph", children: [text("--")] }]);
    expect(parseMarkdown("####### seven")).toEqual([{ type: "paragraph", children: [text("####### seven")] }]);
  });
  it("cuts the text at the limit", () => {
    const [block] = parseMarkdown("a".repeat(MAX_MARKDOWN + 500));
    expect(block).toEqual({ type: "paragraph", children: [text("a".repeat(MAX_MARKDOWN))] });
  });
});

describe("parseMarkdown details", () => {
  const kinds = (source: string) => parseMarkdown(source).map((b) => b.type);
  it("ends a paragraph at any block that starts without a blank line", () => {
    expect(kinds("a\n# H")).toEqual(["paragraph", "heading"]);
    expect(kinds("a\n---")).toEqual(["paragraph", "rule"]);
    expect(kinds("a\n- x")).toEqual(["paragraph", "list"]);
    expect(kinds("a\n1. x")).toEqual(["paragraph", "list"]);
    expect(kinds("a\n> q")).toEqual(["paragraph", "quote"]);
    expect(kinds("a\n```\nx\n```")).toEqual(["paragraph", "code"]);
  });
  it("accepts a lone \\r as a line break, trailing spaces after a rule, and indented continuation lines", () => {
    expect(kinds("# h\r- a")).toEqual(["heading", "list"]);
    expect(kinds("---   ")).toEqual(["rule"]);
    expect(parseMarkdown("a\n    b")).toEqual([{ type: "paragraph", children: [{ type: "text", text: "a b" }] }]);
  });
  it("closes a fence only on a line that starts with it", () => {
    expect(parseMarkdown("```\nabc```\nz\n```")).toEqual([{ type: "code", text: "abc```\nz" }]);
  });
  it("needs a number and a dot for an ordered item, up to nine digits", () => {
    expect(kinds("12. x")).toEqual(["list"]);
    expect(kinds("123456789. x")).toEqual(["list"]);
    expect(kinds("1234567890. x")).toEqual(["paragraph"]);
    expect(kinds("a 1. x")).toEqual(["paragraph"]);
  });
});

describe("parseMarkdown inline", () => {
  const one = (source: string) => (parseMarkdown(source)[0] as { children: Inline[] }).children;
  it("parses bold, italic, code and links, nested", () => {
    expect(one("a **b *c* d** `e` [f **g**](https://x.test)")).toEqual([
      text("a "),
      { type: "strong", children: [text("b "), { type: "em", children: [text("c")] }, text(" d")] },
      text(" "),
      { type: "code", text: "e" },
      text(" "),
      { type: "link", href: "https://x.test/", children: [text("f "), { type: "strong", children: [text("g")] }] },
    ]);
  });
  it("shows an unsafe link as its label, with nothing to click", () => {
    expect(one("[click](javascript:alert(1))")).toEqual([text("click"), text(")")]);
    expect(JSON.stringify(parseMarkdown("[x](data:text/html,<script>)"))).not.toContain("href");
  });
  it("never turns HTML or images into elements: they stay text", () => {
    expect(one("<script>alert(1)</script> <img src=x onerror=y>")).toEqual([text("<script>alert(1)</script> <img src=x onerror=y>")]);
    expect(one("![alt](https://x.test/i.png)")).toEqual([text("!"), { type: "link", href: "https://x.test/i.png", children: [text("alt")] }]);
  });
  it("handles a label containing a bracket or paren, a spaced address and an empty label", () => {
    expect(one("[a)](https://x.test)")).toEqual([{ type: "link", href: "https://x.test/", children: [text("a)")] }]);
    expect(one("[a]( https://x.test )")).toEqual([{ type: "link", href: "https://x.test/", children: [text("a")] }]);
    expect(one("[](https://x.test)")).toEqual([text("[](https://x.test)")]);
  });
  it("leaves unmatched marks as text", () => {
    expect(one("2 * 3 and **open and `tick and [a](b and [c]")).toEqual([text("2 * 3 and **open and `tick and [a](b and [c]")]);
    expect(one("**** `` []()")).toEqual([text("**** `` []()")]);
    expect(one("[a]()")).toEqual([text("a")]);
  });
  it("never nests a mark inside the same mark, so nesting stays shallow", () => {
    expect(one("**a **b** c**")).toEqual([{ type: "strong", children: [text("a ")] }, text("b** c**")]);
    expect(() => parseMarkdown("[".repeat(5000) + "](x)".repeat(5000))).not.toThrow();
  });
  it("stays fast on a long run of unmatched marks", () => {
    const start = performance.now();
    parseMarkdown("*".repeat(MAX_MARKDOWN));
    parseMarkdown("[a](".repeat(MAX_MARKDOWN / 4));
    parseMarkdown("**a".repeat(MAX_MARKDOWN / 3));
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
