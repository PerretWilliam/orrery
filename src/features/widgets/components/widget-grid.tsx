import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { GRID_COLUMNS, layoutFor } from "../domain/grid";
import type { Widget } from "../domain/types";
import { widgetComponent } from "./registry";

/**
 * The widgets of a page on a 12-column CSS grid, in the order of the file. Each renderer is loaded by the registry,
 * only when a widget of its type is on the page. Below `md` the grid is one column.
 */
export function WidgetGrid({ widgets }: { widgets: readonly Widget[] }) {
  const t = useTranslations("Shell");
  if (widgets.length === 0) return <p className="text-sm text-muted-foreground">{t("noWidgets")}</p>;
  const placed = layoutFor(widgets.map((widget) => widget.type)).map((item, index) => ({ ...item, widget: widgets.at(index) as Widget }));
  return (
    <ul className="grid auto-rows-[3.5rem] grid-cols-1 gap-4 md:grid-cols-(--cols)" style={{ "--cols": `repeat(${GRID_COLUMNS}, minmax(0, 1fr))` } as React.CSSProperties}>
      {placed.map(({ i, x, y, w, h, widget }) => {
        const Component = widgetComponent(widget.type);
        return (
          <li
            key={i}
            className="min-h-28 md:[grid-column:var(--col)] md:[grid-row:var(--row)]"
            style={{ "--col": `${x + 1} / span ${w}`, "--row": `${y + 1} / span ${h}` } as React.CSSProperties}
          >
            <Suspense fallback={<Card className="h-full" aria-busy="true" aria-label={t("loading")} />}>
              <Component widget={widget} />
            </Suspense>
          </li>
        );
      })}
    </ul>
  );
}
