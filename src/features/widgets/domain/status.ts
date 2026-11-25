import { extractPath } from "@/features/config/domain/json-path";
import type { WidgetOf } from "./types";

export type Health = "up" | "degraded" | "down";

/** `null` when the source gave nothing at the path. Values are compared exactly: `"OK"` is not `"ok"`. Anything not listed as up or degraded is down. */
export function healthOf(widget: WidgetOf<"status">, data: unknown): Health | null {
  const value = extractPath(data, widget.path);
  if (value === undefined || value === null) return null;
  if (widget.up.includes(value as never)) return "up";
  return widget.degraded?.includes(value as never) ? "degraded" : "down";
}
