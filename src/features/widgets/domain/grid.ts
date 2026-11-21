export const GRID_COLUMNS = 12;

export type GridItem = { i: string; x: number; y: number; w: number; h: number };
type Size = { w: number; h: number };

/** Default footprint of each widget type, in columns and rows of a 12-column grid. Small figures are narrow, tables and matrices span the row. */
const SIZES = new Map<string, Size>([
  ["kpi", { w: 3, h: 2 }],
  ["status", { w: 3, h: 2 }],
  ["line", { w: 6, h: 4 }],
  ["bar", { w: 6, h: 4 }],
  ["donut", { w: 4, h: 4 }],
  ["table", { w: 12, h: 5 }],
  ["cohort", { w: 12, h: 5 }],
  ["markdown", { w: 6, h: 3 }],
  ["github.issues", { w: 6, h: 4 }],
  ["github.pull_requests", { w: 6, h: 4 }],
  ["github.workflow_runs", { w: 6, h: 4 }],
  ["github.releases", { w: 6, h: 4 }],
]);
const FALLBACK: Size = { w: 6, h: 4 };

/** Every widget type of schema v1 has a size: a test compares this list with the schema. */
export const SIZED_TYPES: readonly string[] = [...SIZES.keys()];
export const sizeOf = (type: string): Size => SIZES.get(type) ?? FALLBACK;

/**
 * The layout of a page: widgets in the order of the file, left to right, wrapping when the row is full. The schema
 * declares no coordinates, so the order is the layout. Items are shaped like react-grid-layout's, so a drag-and-drop
 * editor could take over later.
 */
export function layoutFor(types: readonly string[]): GridItem[] {
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  return types.map((type, index) => {
    const { w, h } = sizeOf(type);
    if (x + w > GRID_COLUMNS) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    const item = { i: `w${index}`, x, y, w, h };
    x += w;
    rowHeight = Math.max(rowHeight, h);
    return item;
  });
}
