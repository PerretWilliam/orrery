import { Fragment, type ReactNode } from "react";
import { extractPath } from "@/features/config/domain/json-path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseMarkdown, type Block, type Inline } from "../../domain/markdown";
import type { WidgetProps } from "../../domain/types";
import { WidgetEmpty } from "../widget-states";

const inlines = (nodes: readonly Inline[]): ReactNode =>
  nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.text}</Fragment>;
      case "strong":
        return <strong key={index}>{inlines(node.children)}</strong>;
      case "em":
        return <em key={index}>{inlines(node.children)}</em>;
      case "code":
        return <code key={index} className="rounded bg-muted px-1">{node.text}</code>;
      case "link":
        return (
          <a key={index} href={node.href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
            {inlines(node.children)}
          </a>
        );
    }
  });

const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

function block(node: Block, index: number): ReactNode {
  switch (node.type) {
    case "heading": {
      const Tag = HEADINGS[node.level - 1];
      return <Tag key={index} className="font-semibold">{inlines(node.children)}</Tag>;
    }
    case "paragraph":
      return <p key={index}>{inlines(node.children)}</p>;
    case "quote":
      return <blockquote key={index} className="border-l-2 pl-3 text-muted-foreground">{inlines(node.children)}</blockquote>;
    case "list": {
      const Tag = node.ordered ? "ol" : "ul";
      return (
        <Tag key={index} className={node.ordered ? "list-decimal pl-5" : "list-disc pl-5"}>
          {node.items.map((item, at) => (
            <li key={at}>{inlines(item)}</li>
          ))}
        </Tag>
      );
    }
    case "code":
      return <pre key={index} className="overflow-x-auto rounded bg-muted p-2 text-xs"><code>{node.text}</code></pre>;
    case "rule":
      return <hr key={index} />;
  }
}

/** Sanitized by construction: the text becomes a tree of known elements (see `parseMarkdown`), never HTML, so a source cannot inject markup. */
export default function Markdown({ widget, data }: WidgetProps<"markdown">) {
  const found = widget.content ?? (widget.path === undefined ? undefined : extractPath(data, widget.path));
  const blocks = typeof found === "string" ? parseMarkdown(found) : [];
  if (blocks.length === 0) return <WidgetEmpty title={widget.title} />;
  return (
    <Card className="h-full overflow-auto">
      {widget.title ? (
        <CardHeader>
          <CardTitle>{widget.title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className="flex flex-col gap-2 text-sm">{blocks.map(block)}</CardContent>
    </Card>
  );
}
