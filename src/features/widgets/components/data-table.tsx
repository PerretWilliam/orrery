"use client";

import { columnFilteringFeature, createFilteredRowModel, createSortedRowModel, filterFn_includesString, globalFilteringFeature, rowSortingFeature, sortFn_alphanumeric, sortFn_basic, sortFn_text, tableFeatures } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { TableHead } from "@/components/ui/table";

/** What every data table of the widgets can do: sort by a column and search all of them. */
export const tableConfig = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
  filterFns: { includesString: filterFn_includesString },
});

export function TableSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations("Widgets");
  return <Input type="search" aria-label={t("search")} placeholder={t("search")} value={value} onChange={(event) => onChange(event.target.value)} className="max-w-xs" />;
}

type Props = { label: string; sorted: false | "asc" | "desc"; onSort: ((event: unknown) => void) | undefined; className?: string };

/** A column's heading, which sorts by that column. */
export function SortHead({ label, sorted, onSort, className }: Props) {
  const t = useTranslations("Widgets");
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <TableHead className={className} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}>
      <button type="button" className="inline-flex items-center gap-1" aria-label={t("sortBy", { column: label })} onClick={onSort}>
        {label}
        <Icon aria-hidden className="size-3.5" />
      </button>
    </TableHead>
  );
}
