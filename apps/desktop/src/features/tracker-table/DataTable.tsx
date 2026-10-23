/**
 * `DataTable` (components.md): the Tracker table's grid of applications. TanStack Table owns the
 * sort and column-visibility state, TanStack Virtual renders only the rows in view (60 fps with
 * 1,000 applications, PRD M3-TR-2); the markup stays a real `<table>` with a sticky header and a
 * sticky selection + company column. Each row's company cell is a button (the row's focus stop):
 * J / K or ↑ / ↓ move between rows, Enter opens the detail, X selects, M opens "Move to…".
 */
import type { ApplicationStatus } from "@bfhr/core";
import {
  type Column,
  createColumnHelper,
  createSortedRowModel,
  columnVisibilityFeature,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Monogram } from "../../shared/ui/Company";
import { InteractiveStatusPill } from "../../shared/ui/StatusPill";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import {
  COLUMN_MESSAGES,
  TABLE_COLUMNS,
  type TableColumnId,
  type TableDateVM,
  type TableRowVM,
} from "./model";

const messages = defineMessages({
  table: {
    id: "tracker-table.grid.label",
    defaultMessage: "Applications",
    description: "Accessible name of the Tracker table",
  },
  selectAll: {
    id: "tracker-table.grid.selectAll",
    defaultMessage: "Select all {count, plural, one {# application} other {# applications}}",
  },
  selectRow: {
    id: "tracker-table.grid.selectRow",
    defaultMessage: "Select {company}, {role}",
  },
  openRow: {
    id: "tracker-table.grid.roleSuffix",
    defaultMessage: ", {role}",
    description: "Screen-reader suffix after the company name in the button that opens the application",
  },
  sortBy: {
    id: "tracker-table.grid.sortBy",
    defaultMessage: "Sort by {column}",
  },
  none: {
    id: "tracker-table.grid.none",
    defaultMessage: "None",
    description: "Screen-reader text of an empty table cell (shown as a dash)",
  },
});

/** Row height in px; rows are one line so virtual sizes stay exact. */
export const ROW_HEIGHT = 40;

/** Column widths in px (DE labels fit; long values truncate with the full text in `title`). */
const WIDTH: Readonly<Record<TableColumnId, number>> = {
  company: 232,
  role: 248,
  status: 168,
  appliedAt: 116,
  lastActivity: 132,
  nextAction: 232,
  source: 136,
  cv: 168,
  location: 156,
  channel: 132,
  priority: 104,
  added: 116,
};
const SELECT_WIDTH = 44;

const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
});
const helper = createColumnHelper<typeof features, TableRowVM>();

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const text = (value: (row: TableRowVM) => string | null) => ({
  accessorFn: (row: TableRowVM) => value(row) ?? undefined,
  sortUndefined: "last" as const,
  sortFn: (a: { getValue: (id: string) => unknown }, b: { getValue: (id: string) => unknown }, id: string) =>
    collator.compare(String(a.getValue(id)), String(b.getValue(id))),
});
const date = (value: (row: TableRowVM) => TableDateVM | null | undefined) => ({
  accessorFn: (row: TableRowVM) => value(row)?.sort,
  sortUndefined: "last" as const,
  sortDescFirst: false,
});

/** Sort keys per column; the cells render from the row VM directly. */
const columns = helper.columns(
  TABLE_COLUMNS.map((id) => {
    switch (id) {
      case "company":
        return helper.accessor((row) => row.company.name, { id, ...text((row) => row.company.name) });
      case "role":
        return helper.accessor((row) => row.role, { id, ...text((row) => row.role) });
      case "status":
        // Progress order (Saved → Offer, then outcomes) rather than alphabetical labels.
        return helper.accessor((row) => STATUS_ORDER[row.status.key], { id });
      case "appliedAt":
        return helper.accessor((row) => row.appliedAt?.sort, { id, ...date((row) => row.appliedAt) });
      case "lastActivity":
        return helper.accessor((row) => row.lastActivity.sort, {
          id,
          ...date((row) => row.lastActivity),
          sortDescFirst: true,
        });
      case "nextAction":
        return helper.accessor((row) => row.nextAction?.due?.sort, {
          id,
          ...date((row) => row.nextAction?.due),
        });
      case "source":
        return helper.accessor((row) => row.source, { id, ...text((row) => row.source) });
      case "cv":
        return helper.accessor((row) => row.cv, { id, ...text((row) => row.cv) });
      case "location":
        return helper.accessor((row) => row.location, { id, ...text((row) => row.location) });
      case "channel":
        return helper.accessor((row) => row.channel, { id, ...text((row) => row.channel) });
      case "priority":
        return helper.accessor((row) => PRIORITY_ORDER[row.priority.key], { id, sortDescFirst: false });
      case "added":
        return helper.accessor((row) => row.added.sort, {
          id,
          ...date((row) => row.added),
          sortDescFirst: true,
        });
    }
  }),
);

const STATUS_ORDER: Readonly<Record<ApplicationStatus, number>> = {
  saved: 0,
  preparing: 1,
  applied: 2,
  acknowledged: 3,
  screening: 4,
  interviewing: 5,
  offer: 6,
  accepted: 7,
  declined: 8,
  rejected: 9,
  withdrawn: 10,
  ghosted: 11,
};
const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 } as const;

/**
 * Sorts `rows` with TanStack Table. Returns the rows in display order (export, J / K, Shift-click
 * ranges and "n of N" all follow it) and the visible header columns.
 */
export function useSortedRows(
  rows: readonly TableRowVM[],
  visible: readonly TableColumnId[],
  sorting: SortingState,
  onSortingChange: (sorting: SortingState) => void,
) {
  const columnVisibility = useMemo(
    () => Object.fromEntries(TABLE_COLUMNS.map((id) => [id, visible.includes(id)])),
    [visible],
  );
  const data = useMemo(() => [...rows], [rows]);
  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row) => row.applicationId,
    state: { sorting, columnVisibility },
    onSortingChange: (updater) => onSortingChange(typeof updater === "function" ? updater(sorting) : updater),
    enableSortingRemoval: false,
  });
  const sorted = table.getRowModel().rows.map((row) => row.original);
  // Columns in the user's chosen order (the chooser's order), not TABLE_COLUMNS order.
  const headers = visible.flatMap((id) => {
    const column = table.getColumn(id);
    return column ? [column] : [];
  });
  return { sorted, headers };
}

export interface DataTableProps {
  /** Rows in display order (`useSortedRows`). */
  readonly rows: readonly TableRowVM[];
  readonly headers: readonly Column<typeof features, TableRowVM, unknown>[];
  readonly selected: ReadonlySet<string>;
  /** Click toggles one row; Shift-click selects the range from the last toggled row. */
  readonly onToggleSelected: (applicationId: string, range: boolean) => void;
  readonly onToggleAll: () => void;
  readonly focusedId: string | null;
  readonly onFocusedChange: (applicationId: string) => void;
  readonly openId: string | null;
  readonly onOpen: (applicationId: string) => void;
  readonly onMove: (applicationId: string, to: ApplicationStatus) => void;
  /** Row whose "Move to…" menu is open (M on the focused row). */
  readonly statusMenuId: string | null;
  readonly onStatusMenuChange: (applicationId: string | null) => void;
}

export function DataTable({
  rows,
  headers,
  selected,
  onToggleSelected,
  onToggleAll,
  focusedId,
  onFocusedChange,
  openId,
  onOpen,
  onMove,
  statusMenuId,
  onStatusMenuChange,
}: DataTableProps) {
  const intl = useIntl();
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => rows[index]?.applicationId ?? index,
    overscan: 8,
  });

  const focusedIndex = rows.findIndex((row) => row.applicationId === focusedId);
  const tabStop = focusedIndex >= 0 ? focusedIndex : 0;

  // Keep the focused row rendered and in view, then move DOM focus to it when focus is in the table.
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (focusedIndex < 0) return;
    virtualizer.scrollToIndex(focusedIndex, { align: "auto" });
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    requestAnimationFrame(() =>
      scrollRef.current
        ?.querySelector<HTMLElement>(
          `[data-open-id="${CSS.escape(rows[focusedIndex]?.applicationId ?? "")}"]`,
        )
        ?.focus(),
    );
  }, [focusedIndex, rows, virtualizer]);

  const moveFocus = (delta: number) => {
    const next = rows[Math.min(rows.length - 1, Math.max(0, tabStop + delta))];
    if (!next) return;
    pendingFocus.current = true;
    onFocusedChange(next.applicationId);
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const page = Math.max(
      1,
      Math.floor((scrollRef.current?.clientHeight ?? ROW_HEIGHT * 10) / ROW_HEIGHT) - 1,
    );
    const steps: Readonly<Record<string, number>> = {
      ArrowDown: 1,
      j: 1,
      ArrowUp: -1,
      k: -1,
      PageDown: page,
      PageUp: -page,
      Home: -rows.length,
      End: rows.length,
    };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    moveFocus(step);
  };

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.applicationId));
  const someSelected = !allSelected && rows.some((row) => selected.has(row.applicationId));
  const items = virtualizer.getVirtualItems();
  const before = items[0]?.start ?? 0;
  const after = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);
  const width = SELECT_WIDTH + headers.reduce((sum, column) => sum + WIDTH[column.id as TableColumnId], 0);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" data-testid="tracker-table-scroll">
      <table
        aria-label={intl.formatMessage(messages.table)}
        aria-rowcount={rows.length + 1}
        className="text-callout table-fixed border-separate border-spacing-0"
        style={{ width, minWidth: "100%" }}
      >
        <colgroup>
          <col style={{ width: SELECT_WIDTH }} />
          {headers.map((column) => (
            <col key={column.id} style={{ width: WIDTH[column.id as TableColumnId] }} />
          ))}
        </colgroup>
        <thead className="bg-surface-base sticky top-0 z-(--bfhr-layer-sticky)">
          <tr aria-rowindex={1}>
            <th scope="col" className={cx(headCell, stickyStart, "bg-surface-base ps-4")} style={{ left: 0 }}>
              <Checkbox
                checked={allSelected}
                mixed={someSelected}
                label={intl.formatMessage(messages.selectAll, { count: rows.length })}
                onChange={onToggleAll}
              />
            </th>
            {headers.map((column) => {
              const id = column.id as TableColumnId;
              const sortedDir = column.getIsSorted();
              const label = intl.formatMessage(COLUMN_MESSAGES[id]);
              const SortIcon = sortedDir === "asc" ? ArrowUp : sortedDir === "desc" ? ArrowDown : ArrowUpDown;
              return (
                <th
                  key={id}
                  scope="col"
                  aria-sort={sortedDir === "asc" ? "ascending" : sortedDir === "desc" ? "descending" : "none"}
                  className={cx(headCell, id === "company" && cx(stickyStart, "bg-surface-base"))}
                  style={id === "company" ? { left: SELECT_WIDTH } : undefined}
                >
                  <button
                    type="button"
                    aria-label={intl.formatMessage(messages.sortBy, { column: label })}
                    onClick={column.getToggleSortingHandler()}
                    className={cx(
                      "hover:text-fg-primary -mx-1.5 inline-flex h-7 max-w-full cursor-default items-center gap-1 rounded-sm px-1.5",
                      sortedDir ? "text-fg-primary" : "text-fg-secondary",
                    )}
                  >
                    <span className="truncate">{label}</span>
                    <SortIcon
                      aria-hidden="true"
                      className={cx("size-3.5 shrink-0", !sortedDir && "opacity-50")}
                      strokeWidth={1.75}
                    />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {before > 0 && <tr aria-hidden="true" style={{ height: before }} />}
          {items.map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            const isSelected = selected.has(row.applicationId);
            const isOpen = row.applicationId === openId;
            const rowBg = isOpen
              ? "bg-surface-selected"
              : isSelected
                ? "bg-accent-subtle"
                : "bg-surface-base";
            return (
              <tr
                key={row.applicationId}
                aria-rowindex={item.index + 2}
                data-row-id={row.applicationId}
                className={cx("group", rowBg)}
                style={{ height: ROW_HEIGHT }}
                onClick={(event: MouseEvent) => {
                  if (event.target === event.currentTarget) onOpen(row.applicationId);
                }}
              >
                <td className={cx(bodyCell, stickyStart, rowBg, "ps-4")} style={{ left: 0 }}>
                  <Checkbox
                    checked={isSelected}
                    label={intl.formatMessage(messages.selectRow, {
                      company: row.company.name,
                      role: row.role,
                    })}
                    onChange={(range) => onToggleSelected(row.applicationId, range)}
                  />
                </td>
                {headers.map((column) => (
                  <BodyCell
                    key={column.id}
                    id={column.id as TableColumnId}
                    row={row}
                    rowBg={rowBg}
                    tabbable={item.index === tabStop}
                    onOpen={onOpen}
                    onFocusRow={onFocusedChange}
                    onKeyDown={onRowKeyDown}
                    onMove={onMove}
                    statusMenuOpen={statusMenuId === row.applicationId}
                    onStatusMenuChange={onStatusMenuChange}
                  />
                ))}
              </tr>
            );
          })}
          {after > 0 && <tr aria-hidden="true" style={{ height: after }} />}
        </tbody>
      </table>
    </div>
  );
}

const headCell =
  "border-line-subtle h-9 border-b px-3 text-start align-middle text-footnote font-medium whitespace-nowrap";
const bodyCell = "border-line-subtle h-10 truncate border-b px-3 align-middle";
const stickyStart = "sticky z-[1]";

function BodyCell({
  id,
  row,
  rowBg,
  tabbable,
  onOpen,
  onFocusRow,
  onKeyDown,
  onMove,
  statusMenuOpen,
  onStatusMenuChange,
}: {
  id: TableColumnId;
  row: TableRowVM;
  rowBg: string;
  tabbable: boolean;
  onOpen: (applicationId: string) => void;
  onFocusRow: (applicationId: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onMove: (applicationId: string, to: ApplicationStatus) => void;
  statusMenuOpen: boolean;
  onStatusMenuChange: (applicationId: string | null) => void;
}) {
  const intl = useIntl();
  const none = (
    <>
      <span aria-hidden="true" className="text-fg-tertiary">
        –
      </span>
      <span className="sr-only">{intl.formatMessage(messages.none)}</span>
    </>
  );
  const plain = (value: string | null) => (
    <td className={cx(bodyCell, "text-fg-secondary")} title={value ?? undefined}>
      {value ?? none}
    </td>
  );
  const dateCell = (value: TableDateVM | null) => (
    <td className={cx(bodyCell, "text-fg-secondary tabular-nums")}>
      {value ? (
        <time dateTime={value.iso} title={value.absolute}>
          {value.label}
        </time>
      ) : (
        none
      )}
    </td>
  );

  switch (id) {
    case "company":
      return (
        <td className={cx(bodyCell, stickyStart, rowBg, "font-medium")} style={{ left: SELECT_WIDTH }}>
          <button
            type="button"
            data-open-id={row.applicationId}
            tabIndex={tabbable ? 0 : -1}
            onFocus={() => onFocusRow(row.applicationId)}
            onKeyDown={onKeyDown}
            onClick={() => onOpen(row.applicationId)}
            className="-mx-1 flex w-[calc(100%+0.5rem)] min-w-0 cursor-default items-center gap-2 rounded-sm px-1 py-1 text-start"
          >
            <Monogram company={row.company} size="sm" />
            <span className="min-w-0 truncate" title={row.company.name}>
              {row.company.name}
              <span className="sr-only">{intl.formatMessage(messages.openRow, { role: row.role })}</span>
            </span>
            {row.pendingSync && <SyncGlyph />}
          </button>
        </td>
      );
    case "role":
      return (
        <td className={bodyCell} title={row.role}>
          {row.role}
        </td>
      );
    case "status":
      return (
        <td className={bodyCell}>
          <InteractiveStatusPill
            status={row.status}
            size="sm"
            onSelect={(to) => onMove(row.applicationId, to)}
            open={statusMenuOpen}
            onOpenChange={(open) => onStatusMenuChange(open ? row.applicationId : null)}
          />
        </td>
      );
    case "appliedAt":
      return dateCell(row.appliedAt);
    case "lastActivity":
      return dateCell(row.lastActivity);
    case "nextAction":
      return (
        <td className={bodyCell} title={row.nextAction?.label}>
          {row.nextAction ? (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 truncate">{row.nextAction.label}</span>
              {row.nextAction.due && (
                <time
                  dateTime={row.nextAction.due.iso}
                  title={row.nextAction.due.absolute}
                  className="text-fg-secondary shrink-0 text-footnote tabular-nums"
                >
                  {row.nextAction.due.label}
                </time>
              )}
            </span>
          ) : (
            none
          )}
        </td>
      );
    case "source":
      return plain(row.source);
    case "cv":
      return plain(row.cv);
    case "location":
      return plain(row.location);
    case "channel":
      return plain(row.channel);
    case "priority":
      return plain(row.priority.label);
    case "added":
      return dateCell(row.added);
  }
}

/** 16 px checkbox in a 24 px target; `mixed` for a partly selected header. */
function Checkbox({
  checked,
  mixed = false,
  label,
  onChange,
}: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  /** `range` is true when Shift was held. */
  onChange: (range: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <label className="-m-1 inline-flex size-6 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={() => undefined}
        onClick={(event) => {
          event.stopPropagation();
          onChange(event.shiftKey);
        }}
        className="accent-accent-solid size-4"
      />
    </label>
  );
}
