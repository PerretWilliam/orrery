import { ArrowDown, ArrowUp, Minus, TriangleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { kpiView } from "../../domain/kpi";
import type { WidgetProps } from "../../domain/types";
import { WidgetEmpty } from "../widget-states";

/** One value, with an optional trend and unit. The alert only changes colour and icon, and says so in words: nothing is ever sent. Everything is text. */
export default function Kpi({ widget, data }: WidgetProps<"kpi">) {
  const t = useTranslations("Widgets");
  const format = useFormatter();
  const view = kpiView(widget, data);
  if (view.kind === "empty") return <WidgetEmpty title={widget.title ?? widget.label} />;
  const { value, trend, alert } = view;
  const Arrow = trend === null || trend === 0 ? Minus : trend > 0 ? ArrowUp : ArrowDown;
  return (
    <Card className={cn("h-full", alert && "border-destructive/60")}>
      <CardHeader>
        <CardTitle>{widget.title ?? widget.label}</CardTitle>
        {widget.title ? <CardDescription>{widget.label}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-3xl font-semibold tabular-nums">
          {typeof value === "number" ? format.number(value) : value}
          {widget.unit ? <span className="ml-1 text-lg font-normal text-muted-foreground">{widget.unit}</span> : null}
        </p>
        {trend === null ? null : (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Arrow aria-hidden className="size-4" />
            <span>{t("trend", { value: format.number(trend, { signDisplay: "exceptZero" }) })}</span>
          </p>
        )}
        {alert ? (
          <p role="status" className="flex items-center gap-1 text-sm font-medium text-destructive">
            <TriangleAlert aria-hidden className="size-4" />
            {t(alert.side === "below" ? "alertBelow" : "alertAbove", { limit: format.number(alert.limit) })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
