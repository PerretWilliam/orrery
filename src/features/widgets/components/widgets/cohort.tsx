import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cohortRows } from "../../domain/cohort";
import type { WidgetProps } from "../../domain/types";
import { WidgetEmpty } from "../widget-states";

/** The darkest cell, in percent of the primary colour: beyond this the number on it stops being readable (4.5:1) in either theme. */
const MAX_SHADE = 40;

/** Retention matrix: a row per cohort, a column per day. The number is always written; the shade only helps the eye. */
export default function Cohort({ widget, data }: WidgetProps<"cohort">) {
  const t = useTranslations("Widgets");
  const format = useFormatter();
  const rows = cohortRows(widget, data);
  const days = Math.max(0, ...rows.map((row) => row.values.length));
  if (rows.length === 0 || days === 0) return <WidgetEmpty title={widget.title} />;
  return (
    <Card className="h-full">
      <CardHeader>{widget.title ? <CardTitle>{widget.title}</CardTitle> : null}</CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto md:[contain:size]">
        <table className="w-full border-separate border-spacing-0.5 text-xs tabular-nums">
          <thead>
            <tr>
              <th scope="col" className="text-left font-medium">
                {t("cohort")}
              </th>
              {Array.from({ length: days }, (_, day) => (
                <th key={day} scope="col" className="px-1 font-medium text-muted-foreground">
                  {t("day", { day })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={`${row.name}-${r}`}>
                <th scope="row" className="pr-2 text-left font-medium whitespace-nowrap">
                  {row.name}
                </th>
                {Array.from({ length: days }, (_, day) => {
                  const value = row.values[day] ?? null;
                  return (
                    <td
                      key={day}
                      className="rounded-sm px-1 py-0.5 text-center"
                      style={value === null ? undefined : { backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(Math.min(Math.max(value, 0), 1) * MAX_SHADE)}%, transparent)` }}
                    >
                      {value === null ? "–" : format.number(value, { style: "percent", maximumFractionDigits: 1 })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
