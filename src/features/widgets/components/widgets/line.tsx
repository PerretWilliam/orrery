"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { seriesOf } from "../../domain/series";
import type { WidgetProps } from "../../domain/types";
import { ChartFrame } from "../chart-frame";
import { WidgetEmpty } from "../widget-states";

const CONFIG = { y: { color: "var(--chart-1)" } } satisfies ChartConfig;

/** A line of `y` over `x`, both read from each item of the source's list. Axis and tooltip values are drawn as text. */
export default function LineWidget({ widget, data }: WidgetProps<"line">) {
  const points = seriesOf(widget, data);
  if (points.length === 0) return <WidgetEmpty title={widget.title} />;
  return (
    <ChartFrame title={widget.title}>
      <ChartContainer config={CONFIG} className="h-full w-full">
        <LineChart data={points} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="x" tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} width={40} />
          <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} />
          <Line dataKey="y" type="monotone" stroke="var(--color-y)" strokeWidth={2} dot={points.length < 40} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
    </ChartFrame>
  );
}
