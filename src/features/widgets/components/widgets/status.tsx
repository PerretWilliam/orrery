import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { healthOf, type Health } from "../../domain/status";
import type { WidgetProps } from "../../domain/types";
import { WidgetEmpty } from "../widget-states";

const LOOK: Record<Health, { icon: typeof CircleCheck; tone: string }> = {
  up: { icon: CircleCheck, tone: "text-emerald-600 dark:text-emerald-400" },
  degraded: { icon: TriangleAlert, tone: "text-amber-600 dark:text-amber-400" },
  down: { icon: CircleX, tone: "text-destructive" },
};

/** Up, degraded or down, by icon and word, never by colour alone. */
export default function Status({ widget, data }: WidgetProps<"status">) {
  const t = useTranslations("Widgets");
  const health = healthOf(widget, data);
  if (health === null) return <WidgetEmpty title={widget.title} />;
  const { icon: Icon, tone } = LOOK[health];
  return (
    <Card className="h-full">
      <CardHeader>{widget.title ? <CardTitle>{widget.title}</CardTitle> : null}</CardHeader>
      <CardContent>
        <p role="status" className={cn("flex items-center gap-2 text-xl font-semibold", tone)}>
          <Icon aria-hidden className="size-6" />
          {t(`health.${health}`)}
        </p>
      </CardContent>
    </Card>
  );
}
