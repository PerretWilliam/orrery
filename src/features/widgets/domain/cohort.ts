import { extractPath } from "@/features/config/domain/json-path";
import type { WidgetOf } from "./types";

export type CohortRow = { name: string; /** One per day: a share (0.25 is 25%), or `null` where the source has no number. */ values: (number | null)[] };

export const MAX_COHORTS = 200;
export const MAX_DAYS = 90;
const MAX_NAME = 64;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Retention rows from the source's list. Sources send shares (0.25) or percentages (25): when no value of the whole
 * matrix is above 1 they are shares, otherwise percentages. Rows without a name or without any list of values are left out.
 */
export function cohortRows(widget: WidgetOf<"cohort">, data: unknown): CohortRow[] {
  const list = extractPath(data, widget.path);
  if (!Array.isArray(list)) return [];
  const raw: { name: string; values: (number | null)[] }[] = [];
  for (const item of list.slice(0, MAX_COHORTS)) {
    const name = extractPath(item, widget.cohort);
    const values = extractPath(item, widget.values);
    if (typeof name !== "string" || name.length === 0 || !Array.isArray(values)) continue;
    raw.push({ name: name.slice(0, MAX_NAME), values: values.slice(0, MAX_DAYS).map((v) => (finite(v) ? v : null)) });
  }
  const max = Math.max(0, ...raw.flatMap((row) => row.values.filter(finite)));
  const scale = max > 1 ? 100 : 1;
  return raw.map((row) => ({ name: row.name, values: row.values.map((v) => (v === null ? null : v / scale)) }));
}
