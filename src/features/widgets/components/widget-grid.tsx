import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ConfigV1 } from "@/features/config/domain/schema-v1";
import { GRID_COLUMNS, layoutFor } from "../domain/grid";

type Widget = ConfigV1["pages"][number]["widgets"][number];

/**
 * The widgets of a page on a 12-column CSS grid, in the order of the file. Each draws a placeholder until its
 * renderer lands. Titles come from the repository: they are text, never markup. Below `md` the grid is one column.
 */
export function WidgetGrid({ widgets }: { widgets: readonly Widget[] }) {
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
            <Card className="h-full">
              <CardHeader>
                <CardTitle>{title ?? widget.type}</CardTitle>
                <CardDescription>
                  {widget.type} · {t("widgetSoon")}
                </CardDescription>
              </CardHeader>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
