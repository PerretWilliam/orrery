"use client";

import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { slicesOf } from "../../domain/series";
import type { WidgetProps } from "../../domain/types";
import { ChartFrame } from "../chart-frame";
import { WidgetEmpty } from "../widget-states";

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** A donut of `value` by `name`; colours cycle over the theme's chart palette. Names and values are drawn as text. */
export default function DonutWidget({ widget, data }: WidgetProps<"donut">) {
  const slices = slicesOf(widget, data);
  if (slices.length === 0) return <WidgetEmpty title={widget.title} />;
  const config: ChartConfig = Object.fromEntries(slices.map((slice, i) => [slice.name, { label: slice.name, color: PALETTE[i % PALETTE.length] }]));
  return (
    <ChartFrame title={widget.title}>
      <ChartContainer config={config} className="h-full w-full">
        <PieChart accessibilityLayer>
          <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="name" />} />
          <Pie data={slices} dataKey="value" nameKey="name" innerRadius="55%" isAnimationActive={false}>
            {slices.map((slice, i) => (
              <Cell key={slice.name} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey="name" />} />
        </PieChart>
      </ChartContainer>
    </ChartFrame>
  );
}
