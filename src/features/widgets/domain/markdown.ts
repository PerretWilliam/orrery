/**
 * A small Markdown subset turned into a tree, never into HTML: the renderer builds elements from the tree, so raw
 * HTML, images and scripts in the text are only ever shown as text. Links keep http, https and mailto addresses.
 * Supported: headings, paragraphs, bullet and numbered lists, quotes, fenced code, rules, bold, italic, code, links.
 */
export type Inline =
  | { type: "text"; text: string }
  | { type: "strong" | "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] };
export type Block =
  | { type: "heading"; level: number; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "quote"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "code"; text: string }
  | { type: "rule" };

/** Text longer than this is cut: a source can answer with megabytes. */
export const MAX_MARKDOWN = 20_000;

/** `https://…` or `mailto:…` as the URL parser writes it; `null` for any other scheme (javascript:, data:…) and for relative links. */
export function safeHref(href: string): string | null {
  if (!URL.canParse(href)) return null;
  const url = new URL(href);
  return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
}

function inline(text: string): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  // A delimiter with no closing mark anywhere after it has none further on either: remembered so a long run of them stays linear.
  const hopeless = new Set<string>();
  const flush = () => {
    if (buffer) out.push({ type: "text", text: buffer });
    buffer = "";
  };
  // Stryker disable next-line all: only keeps a long run of unmatched marks linear; the tests check the speed, not the structure.
  const find = (mark: string, from: number) => {
    if (hopeless.has(mark)) return -1;
    const at = text.indexOf(mark, from);
    if (at < 0) hopeless.add(mark);
    return at;
  };
  let i = 0;
  while (i < text.length) {
    // An opening `*` or `**` must touch the text it marks: `2 * 3` is arithmetic, not emphasis.
    const touches = (length: number) => /\S/.test(text[i + length] ?? "");
    if (text.startsWith("**", i) && touches(2)) {
      const end = find("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "strong", children: inline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    } else if (text[i] === "`") {
      const end = find("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    } else if (text[i] === "*" && touches(1)) {
      const end = find("*", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: "em", children: inline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    } else if (text[i] === "[") {
      const middle = find("](", i + 1);
      const end = middle > i + 1 ? find(")", middle + 2) : -1;
      if (end > 0) {
        const label = inline(text.slice(i + 1, middle));
        const href = safeHref(text.slice(middle + 2, end).trim());
        flush();
        // An unsafe address leaves the label as plain text: nothing to click.
        if (href) out.push({ type: "link", href, children: label });
        else out.push(...label);
        i = end + 1;
        continue;
      }
    }
    buffer += text[i];
    i += 1;
  }
  flush();
  return out;
}

const HEADING = /^(#{1,6}) (.*)/;
const BULLET = /^[-*] (.*)/;
const NUMBERED = /^\d{1,9}\. (.*)/;
const RULE = /^(-{3,}|\*{3,})$/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.slice(0, MAX_MARKDOWN).replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", children: inline(paragraph.join(" ")) });
    paragraph = [];
  };
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n].trimEnd();
    if (line.startsWith("```")) {
      endParagraph();
      const code: string[] = [];
      for (n += 1; n < lines.length && !lines[n].startsWith("```"); n += 1) code.push(lines[n]);
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (line === "") endParagraph();
    else if (RULE.test(line)) {
      endParagraph();
      blocks.push({ type: "rule" });
    } else if (heading) {
      endParagraph();
      blocks.push({ type: "heading", level: heading[1].length, children: inline(heading[2]) });
    } else if (bullet || numbered) {
      endParagraph();
      const ordered = numbered !== null;
      const item = inline(((bullet ?? numbered) as RegExpExecArray)[1]);
      const last = blocks.at(-1);
      if (last?.type === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ type: "list", ordered, items: [item] });
    } else if (line.startsWith("> ")) {
      endParagraph();
      blocks.push({ type: "quote", children: inline(line.slice(2)) });
    } else paragraph.push(line.trim());
  }
  endParagraph();
  return blocks;
}
