"use client";

import { createColumnHelper, createFilteredRowModel, createSortedRowModel, columnFilteringFeature, filterFn_includesString, globalFilteringFeature, rowSortingFeature, sortFn_basic, sortFn_text, tableFeatures, useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { columnId, tableRows, type CellValue, type TableRow as Row } from "../../domain/table";
import type { WidgetProps } from "../../domain/types";
import { WidgetEmpty } from "../widget-states";

const ROW_HEIGHT = 40;
const VIEWPORT = 384;
const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns: { basic: sortFn_basic, text: sortFn_text },
  filterFns: { includesString: filterFn_includesString },
});
const helper = createColumnHelper<typeof features, Row>();

/**
 * Rows from the source's list, sortable, searchable and virtualised (only the rows in view are in the page, so thousands
 * of rows stay cheap). Every cell is text: the source is untrusted and nothing is ever rendered as markup.
 */
export default function TableWidget({ widget, data }: WidgetProps<"table">) {
  "use no memo"; // TanStack Virtual and Table hand back stable objects that mutate: the React Compiler would freeze their output.
  const t = useTranslations("Widgets");
  const format = useFormatter();
  const [search, setSearch] = useState("");
  const rows = useMemo(() => tableRows(widget, data), [widget, data]);
  const columns = useMemo(
    () =>
      helper.columns(widget.columns.map((column, i) =>
        helper.accessor((row) => row[columnId(i)] ?? undefined, {
          id: columnId(i),
          header: column.header,
          sortFn: column.format === "number" ? "basic" : "text",
          sortUndefined: "last",
          cell: (info) => renderCell(info.getValue() ?? null, column.format, format),
        }),
      )),
    [widget.columns, format],
  );
  const table = useTable({ features, columns, data: rows, globalFilterFn: "includesString", getColumnCanGlobalFilter: () => true });
  const body = table.getRowModel().rows;
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: body.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    initialRect: { width: 0, height: VIEWPORT },
  });
  if (rows.length === 0) return <WidgetEmpty title={widget.title} />;
  const items = virtual.getVirtualItems();
  const before = items.length > 0 ? items[0].start : 0;
  const after = items.length > 0 ? virtual.getTotalSize() - items[items.length - 1].end : 0;
  const span = widget.columns.length;
  return (
    <Card className="h-full">
      <CardHeader>
        {widget.title ? <CardTitle>{widget.title}</CardTitle> : null}
        <div className="flex items-center justify-between gap-2">
          {widget.searchable ? (
            <Input
              type="search"
              aria-label={t("search")}
              placeholder={t("search")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                table.setGlobalFilter(event.target.value);
              }}
              className="max-w-xs"
            />
          ) : null}
          <p className="text-sm text-muted-foreground">{t("rows", { count: body.length })}</p>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <div ref={scroller} className="overflow-y-auto" style={{ maxHeight: VIEWPORT }}>
          <Table>
            <TableHeader>
              <TableRow>
                {table.getHeaderGroups()[0].headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
                  return (
                    <TableHead key={header.id} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}>
                      <button type="button" className="inline-flex items-center gap-1" aria-label={t("sortBy", { column: widget.columns[Number(header.id.slice(1))].header })} onClick={header.column.getToggleSortingHandler()}>
                        {widget.columns[Number(header.id.slice(1))].header}
                        <Icon aria-hidden className="size-3.5" />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {body.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={span} className="text-muted-foreground">
                    {t("noMatch")}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {before > 0 ? <PadRow height={before} span={span} /> : null}
                  {items.map((item) => (
                    <TableRow key={body[item.index].id} style={{ height: ROW_HEIGHT }}>
                      {body[item.index].getAllCells().map((cell) => (
                        <TableCell key={cell.id} className="truncate">
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {after > 0 ? <PadRow height={after} span={span} /> : null}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Stands in for the rows outside the window, so the scroll bar keeps the size of the whole list. */
function PadRow({ height, span }: { height: number; span: number }) {
  return (
    <TableRow aria-hidden style={{ height }}>
      <TableCell colSpan={span} className="p-0" />
    </TableRow>
  );
}

function renderCell(value: CellValue, kind: "text" | "number" | "date" | "badge", format: ReturnType<typeof useFormatter>) {
  if (value === null) return null;
  if (kind === "badge") return <Badge variant="secondary">{String(value)}</Badge>;
  if (kind === "number" && typeof value === "number") return <span className="tabular-nums">{format.number(value)}</span>;
  if (kind === "date") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : format.dateTime(date, { dateStyle: "medium", timeZone: "UTC" });
  }
  return String(value);
}
