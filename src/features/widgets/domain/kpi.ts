import { extractPath } from "@/features/config/domain/json-path";
import type { WidgetOf } from "./types";

export type KpiView =
  | { kind: "empty" }
  | { kind: "value"; value: number | string; trend: number | null; alert: { side: "below" | "above"; limit: number } | null };

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const MAX_TEXT = 64;

/**
 * What a kpi shows, read from the source's answer with the safe path extractor. The value is a finite number or short
 * text (anything else is "nothing to show"). The alert threshold only changes how the widget looks: it needs a number.
 */
export function kpiView(widget: WidgetOf<"kpi">, data: unknown): KpiView {
  const found = extractPath(data, widget.path);
  const value = finite(found) ? found : typeof found === "string" && found.length > 0 ? found.slice(0, MAX_TEXT) : undefined;
  if (value === undefined) return { kind: "empty" };
  const trend = widget.trend === undefined ? undefined : extractPath(data, widget.trend);
  const { below, above } = widget.alert ?? {};
  let alert: { side: "below" | "above"; limit: number } | null = null;
  if (typeof value === "number") {
    if (below !== undefined && value < below) alert = { side: "below", limit: below };
    else if (above !== undefined && value > above) alert = { side: "above", limit: above };
  }
  return { kind: "value", value, trend: finite(trend) ? trend : null, alert };
}
