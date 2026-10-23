/**
 * Table preferences kept on this device (research/tracker.md: "Filters and display options
 * persist per view on the device"): scope and status filters, visible columns and the sort. The
 * search text and the selection are not kept.
 */
import { ApplicationStatusSchema } from "@bfhr/core";
import type { SortingState } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DEFAULT_HIDDEN_COLUMNS, TABLE_COLUMNS, type TableColumnId, type TableScope } from "./model";

const STORAGE_KEY = "bfhr.tracker.table.v1";

const ColumnSchema = z.enum(TABLE_COLUMNS);
const PrefsSchema = z.object({
  scope: z.enum(["active", "closed", "all"]),
  statuses: z.array(ApplicationStatusSchema),
  columns: z.array(ColumnSchema),
  sorting: z.array(z.object({ id: ColumnSchema, desc: z.boolean() })).max(1),
});

export interface TablePrefs {
  readonly scope: TableScope;
  readonly statuses: z.infer<typeof PrefsSchema>["statuses"];
  /** Visible columns in display order; `company` is always first. */
  readonly columns: readonly TableColumnId[];
  readonly sorting: SortingState;
}

export const DEFAULT_COLUMNS: readonly TableColumnId[] = TABLE_COLUMNS.filter(
  (column) => !DEFAULT_HIDDEN_COLUMNS.includes(column),
);

/** Next action first (soonest due on top), the research's default sort. */
export const DEFAULT_SORTING: SortingState = [{ id: "nextAction", desc: false }];

export const DEFAULT_PREFS: TablePrefs = {
  scope: "active",
  statuses: [],
  columns: DEFAULT_COLUMNS,
  sorting: DEFAULT_SORTING,
};

function load(): TablePrefs {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? PrefsSchema.safeParse(JSON.parse(raw)) : null;
    if (!parsed?.success) return DEFAULT_PREFS;
    const columns = ["company" as const, ...parsed.data.columns.filter((column) => column !== "company")];
    return { ...parsed.data, columns };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** The preferences, saved whenever they change. */
export function useTablePrefs(): [TablePrefs, (update: (prefs: TablePrefs) => TablePrefs) => void] {
  const [prefs, setPrefs] = useState(load);
  useEffect(() => {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);
  return [prefs, setPrefs];
}
