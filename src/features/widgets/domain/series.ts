import { extractPath } from "@/features/config/domain/json-path";
import type { WidgetOf } from "./types";

export type Point = { x: string; y: number };
export type Slice = { name: string; value: number };

/** Charts draw at most this many points or slices; the rest of a long list is left out. */
export const MAX_POINTS = 500;
const MAX_LABEL = 64;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const label = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value.slice(0, MAX_LABEL) : finite(value) ? String(value) : undefined;

/** The items of the list at `path`, each mapped by `pick`; items that do not give a usable pair are skipped. */
function collect<T>(data: unknown, path: string, pick: (item: unknown) => T | undefined): T[] {
  const list = extractPath(data, path);
  if (!Array.isArray(list)) return [];
  const out: T[] = [];
  for (const item of list) {
    const picked = pick(item);
    if (picked !== undefined) out.push(picked);
    if (out.length === MAX_POINTS) break;
  }
  return out;
}

/** X/Y points of a line or bar widget: x is shown as text, y must be a finite number. */
export function seriesOf(widget: WidgetOf<"line"> | WidgetOf<"bar">, data: unknown): Point[] {
  return collect(data, widget.path, (item) => {
    const x = label(extractPath(item, widget.x));
    const y = extractPath(item, widget.y);
    return x !== undefined && finite(y) ? { x, y } : undefined;
  });
}

/** Slices of a donut: a name and a positive finite value (a zero or negative slice cannot be drawn). */
export function slicesOf(widget: WidgetOf<"donut">, data: unknown): Slice[] {
  return collect(data, widget.path, (item) => {
    const name = label(extractPath(item, widget.name));
    const value = extractPath(item, widget.value);
    return name !== undefined && finite(value) && value > 0 ? { name, value } : undefined;
  });
}
