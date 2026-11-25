import { useTranslations } from "next-intl";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Widget } from "../../domain/types";

/** Stands in for a widget type whose renderer has not landed yet. Titles come from the repository: text, never markup. */
export default function Placeholder({ widget }: { widget: Widget }) {
  const t = useTranslations("Shell");
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{"title" in widget ? widget.title : widget.type}</CardTitle>
        <CardDescription>
          {widget.type} · {t("widgetSoon")}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
