import type { ActivityKind } from "@/features/repos/domain/activity";

export type ListEntry<W> = { id: string; kind: ActivityKind; widget: W };

/** A page made only of GitHub lists is browsed one list at a time. Any other page, and a page with a single list, has none. */
export function listsOf<W extends { type: string }>(widgets: readonly W[]): ListEntry<W>[] {
  if (widgets.length < 2 || !widgets.every((widget) => widget.type.startsWith("github."))) return [];
  const seen = new Map<ActivityKind, number>();
  return widgets.map((widget) => {
    const kind = widget.type.slice("github.".length) as ActivityKind;
    const count = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, count);
    const slug = kind.replaceAll("_", "-");
    return { id: count === 1 ? slug : `${slug}-${count}`, kind, widget };
  });
}
