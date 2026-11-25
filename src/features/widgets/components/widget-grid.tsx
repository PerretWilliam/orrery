import { useTranslations } from "next-intl";
import { Suspense } from "react";
import type { ConfigV1 } from "@/features/config/domain/schema-v1";
import { GRID_COLUMNS, layoutFor } from "../domain/grid";
import type { Widget } from "../domain/types";
import { WidgetBoundary } from "./widget-boundary";
import { WidgetFrame } from "./widget-frame";
import { WidgetCrashed, WidgetLoading } from "./widget-states";

/**
 * The widgets of a page on a 12-column CSS grid, in the order of the file. Each widget has its own error boundary and
 * Suspense: it loads, fails and shows its age on its own. Renderers come from the registry, only when needed. Below `md` the grid is one column.
 */
export function WidgetGrid({ project, widgets }: { project: { id: string; config: ConfigV1 }; widgets: readonly Widget[] }) {
  const t = useTranslations("Shell");
  if (widgets.length === 0) return <p className="text-sm text-muted-foreground">{t("noWidgets")}</p>;
  const placed = layoutFor(widgets.map((widget) => widget.type)).map((item, index) => ({ ...item, widget: widgets.at(index) as Widget }));
  return (
    <ul className="grid auto-rows-[3.5rem] grid-cols-1 gap-4 md:grid-cols-(--cols)" style={{ "--cols": `repeat(${GRID_COLUMNS}, minmax(0, 1fr))` } as React.CSSProperties}>
      {placed.map(({ i, x, y, w, h, widget }) => {
        const title = "title" in widget ? widget.title : undefined;
        return (
          <li
            key={i}
            className="min-h-28 md:[grid-column:var(--col)] md:[grid-row:var(--row)]"
            style={{ "--col": `${x + 1} / span ${w}`, "--row": `${y + 1} / span ${h}` } as React.CSSProperties}
          >
            <WidgetBoundary fallback={<WidgetCrashed title={title} />}>
              <Suspense fallback={<WidgetLoading />}>
                <WidgetFrame project={project} widget={widget} />
              </Suspense>
            </WidgetBoundary>
          </li>
        );
      })}
    </ul>
  );
}
