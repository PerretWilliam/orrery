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
      <CardContent className="min-h-0 flex-1">{children}</CardContent>
    </Card>
  );
}
