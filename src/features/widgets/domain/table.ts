import { extractPath } from "@/features/config/domain/json-path";
import type { WidgetOf } from "./types";

/** A cell holds text, a finite number or nothing; anything else the source sends (objects, lists, NaN) is nothing. */
export type CellValue = string | number | null;
export type TableRow = Record<string, CellValue>;

/** Tables hold at most this many rows (the virtual list keeps drawing cheap beyond that, the browser's memory does not). */
export const MAX_ROWS = 10_000;
const MAX_TEXT = 200;

/** The id of column `index`: the config has no ids, and a header is not unique. */
export const columnId = (index: number) => `c${index}`;

function cellOf(value: unknown): CellValue {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return value.slice(0, MAX_TEXT);
  return null;
}

/** One row per item of the list at `path`, one cell per column. A path that is not a list gives no rows. */
export function tableRows(widget: WidgetOf<"table">, data: unknown): TableRow[] {
  const list = extractPath(data, widget.path);
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_ROWS).map((item) =>
    Object.fromEntries(widget.columns.map((column, i) => [columnId(i), cellOf(extractPath(item, column.path))])),
  );
}
