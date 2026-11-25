import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { GRID_COLUMNS, layoutFor } from "../domain/grid";
import type { Widget, WidgetProject } from "../domain/types";
import { WidgetBoundary } from "./widget-boundary";
import { WidgetFrame } from "./widget-frame";
import { WidgetCrashed, WidgetLoading } from "./widget-states";

/**
 * The widgets of a page on a 12-column CSS grid, in the order of the file. Each widget has its own error boundary and
 * Suspense: it loads and fails on its own. Renderers come from the registry, only when needed. Below `md` the grid is one column.
 * `single` shows its one widget at full width, as tall as its content.
 */
export function WidgetGrid({ project, widgets, single = false }: { project: WidgetProject; widgets: readonly Widget[]; single?: boolean }) {
  const t = useTranslations("Shell");
  if (widgets.length === 0) return <p className="text-sm text-muted-foreground">{t("noWidgets")}</p>;
  const placed = layoutFor(widgets.map((widget) => widget.type)).map((item, index) => ({ ...item, widget: widgets.at(index) as Widget }));
  return (
    <ul
      data-layout={single ? "single" : "grid"}
      className={single ? "flex flex-col" : "grid auto-rows-[minmax(3.5rem,auto)] grid-cols-1 gap-4 md:grid-cols-(--cols)"}
      style={{ "--cols": `repeat(${GRID_COLUMNS}, minmax(0, 1fr))` } as React.CSSProperties}
    >
      {placed.map(({ i, x, y, w, h, widget }) => {
        const title = "title" in widget ? widget.title : undefined;
        return (
          <li
            key={i}
            className={single ? "min-h-28" : "min-h-28 md:[grid-column:var(--col)] md:[grid-row:var(--row)]"}
            style={{ "--col": `${x + 1} / span ${w}`, "--row": `${y + 1} / span ${h}` } as React.CSSProperties}
          >
            <WidgetBoundary fallback={<WidgetCrashed title={title} />}>
              <Suspense fallback={<WidgetLoading type={widget.type} />}>
                <WidgetFrame project={project} widget={widget} />
              </Suspense>
            </WidgetBoundary>
          </li>
        );
      })}
    </ul>
  );
}
