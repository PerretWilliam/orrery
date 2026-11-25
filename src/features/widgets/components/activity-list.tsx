"use client";

import { createColumnHelper, useTable } from "@tanstack/react-table";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import type { ActivityItem } from "@/features/repos/domain/activity";
import { activityItems, safeGithubUrl, toneOf, type Tone } from "../domain/activity";
import { SortHead, TableSearch, tableConfig } from "./data-table";
import { WidgetEmpty } from "./widget-states";

const BADGE = { success: "success", warning: "warning", destructive: "destructive", done: "secondary", neutral: "outline" } as const satisfies Record<Tone, string>;
/** The title takes the room left; author and date give way in a narrow card. */
const CELL = { title: "w-full max-w-0 truncate", by: "hidden @xl:table-cell", at: "hidden @md:table-cell", state: "" };
const LABELS = { title: "columns.title", by: "columns.author", at: "columns.updated", state: "columns.state" } as const;
const helper = createColumnHelper<typeof tableConfig, ActivityItem>();

/** The table every GitHub widget shows, sortable and searchable. All of it is text; the link only on github.com. */
export function ActivityList({ title, data }: { title: string | undefined; data: unknown }) {
  "use no memo"; // TanStack Table hands back stable objects that mutate: the React Compiler would freeze their output.
  const t = useTranslations("Widgets");
  const format = useFormatter();
  const [search, setSearch] = useState("");
  const items = useMemo(() => activityItems(data), [data]);
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor((item) => `${item.key} ${item.title}`.trim(), {
          id: "title",
          sortFn: "alphanumeric",
          cell: (info) => {
            const href = safeGithubUrl(info.row.original.url);
            return href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                {info.getValue()}
              </a>
            ) : (
              <span className="font-medium">{info.getValue()}</span>
            );
          },
        }),
        helper.accessor((item) => item.by ?? undefined, { id: "by", sortFn: "text", sortUndefined: "last", cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span> }),
        // ISO dates sort as text.
        helper.accessor((item) => (item.at && !Number.isNaN(Date.parse(item.at)) ? item.at : undefined), {
          id: "at",
          sortFn: "basic",
          sortUndefined: "last",
          cell: (info) => {
            const at = info.getValue();
            return at ? (
              <time dateTime={at} className="text-muted-foreground tabular-nums">
                {format.dateTime(new Date(at), { dateStyle: "medium", timeZone: "UTC" })}
              </time>
            ) : null;
          },
        }),
        helper.accessor("state", { id: "state", sortFn: "text", cell: (info) => <Badge variant={BADGE[toneOf(info.getValue())]}>{info.getValue()}</Badge> }),
      ]),
    [format],
  );
  const table = useTable({ features: tableConfig, columns, data: items, globalFilterFn: "includesString", getColumnCanGlobalFilter: () => true });
  if (items.length === 0) return <WidgetEmpty title={title} />;
  const rows = table.getRowModel().rows;
  return (
    <Card className="h-full">
      <CardHeader>
        {title ? <CardTitle>{title}</CardTitle> : null}
        <div className="flex items-center justify-between gap-2">
          <TableSearch
            value={search}
            onChange={(value) => {
              setSearch(value);
              table.setGlobalFilter(value);
            }}
          />
          <p className="text-sm text-muted-foreground">{t("rows", { count: rows.length })}</p>
        </div>
      </CardHeader>
      <CardContent className="@container min-h-0 flex-1 overflow-auto md:in-data-[layout=grid]:[contain:size]">
        <Table>
          <TableHeader>
            <TableRow>
              {table.getHeaderGroups()[0].headers.map((header) => (
                <SortHead
                  key={header.id}
                  label={t(LABELS[header.id as keyof typeof CELL])}
                  sorted={header.column.getIsSorted()}
                  onSort={header.column.getToggleSortingHandler()}
                  className={CELL[header.id as keyof typeof CELL]}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  {t("noMatch")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={CELL[cell.column.id as keyof typeof CELL]}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
