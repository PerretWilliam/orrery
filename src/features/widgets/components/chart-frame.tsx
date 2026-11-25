import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReactNode } from "react";

/** The card around a chart: title from the file, the chart below. Text only; the chart itself comes in as children. */
export function ChartFrame({ title, children }: { title: string | undefined; children: ReactNode }) {
  return (
    <Card className="h-full">
      {title ? (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      ) : null}
      {/* The chart fills the cell: a fixed aspect ratio would stretch the grid's rows to match its width. */}
      <CardContent className="min-h-0 flex-1 *:aspect-auto *:min-h-40">{children}</CardContent>
    </Card>
  );
}
