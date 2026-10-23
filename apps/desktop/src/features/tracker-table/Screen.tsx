/**
 * Tracker › Table (`/tracker?view=table`, research/tracker.md "Decision — Desktop › Table"):
 * toolbar (title, Board · Table · Calendar, count, search, Columns, Import CSV, Export…), a filter
 * row (Active · Closed · All, status chips, an Insights drill-down chip), the virtualized table
 * and, while rows are selected, the bulk bar. Rows open in the right detail panel (Enter);
 * statuses change in place through `@bfhr/core`, singly or in bulk, with one Undo per action.
 */
import { ACTIVE_STATUSES, type ApplicationStatus, statusPhase, TERMINAL_STATUSES } from "@bfhr/core";
import type { SortingState } from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import { Columns3, FileUp, ListFilter, Search, Table2, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Fragment, type ReactNode, useMemo, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useTrackerData } from "../../data/tracker/live";
import { useTrackerActions } from "../../data/tracker/useTrackerActions";
import { saveExportFile } from "../../lib/cvExport";
import { destinationMessages } from "../../lib/destinations";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { PHASE_MESSAGES, STATUS_MESSAGES } from "../../shared/model/vocabulary";
import type { ScreenProps } from "../../shared/screen";
import { Button, IconButton } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ExportButton } from "../../shared/ui/ExportButton";
import { MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator } from "../../shared/ui/Menu";
import { PaneError } from "../../shared/ui/PaneError";
import { ScreenTitle } from "../../shared/ui/ScreenTitle";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { TableRowSkeleton, useSkeletonGate } from "../../shared/ui/Skeleton";
import { StaleStamp } from "../../shared/ui/StaleStamp";
import { useToast } from "../../shared/ui/Toast";
import { openAddApplication } from "../application-add";
import { ApplicationPanel } from "../application-detail/ApplicationPanel";
import { openCsvImport } from "../tracker-csv";
import { BulkActionBar } from "./BulkActionBar";
import { ColumnChooser } from "./ColumnChooser";
import { DataTable, useSortedRows } from "./DataTable";
import {
  filterRows,
  planBulkMove,
  type TableFilters,
  type TableScope,
  tableCsv,
  type TrackerTableModel,
} from "./model";
import { useTablePrefs } from "./prefs";
import { useInsightsDrillDown } from "./drillDown";
import { TrackerViewSwitch } from "./ViewSwitch";

const messages = defineMessages({
  errorTitle: { id: "tracker-table.error.title", defaultMessage: "We couldn't load your applications" },
  errorBody: {
    id: "tracker-table.error.body",
    defaultMessage: "Our server didn't respond. Your saved data is safe. Try again in a moment.",
  },
  count: {
    id: "tracker-table.count",
    defaultMessage: "{count, plural, one {# application} other {# applications}}",
  },
  countFiltered: {
    id: "tracker-table.countFiltered",
    defaultMessage: "{shown} of {count, plural, one {# application} other {# applications}}",
  },
  search: { id: "tracker-table.search", defaultMessage: "Search applications" },
  searchPlaceholder: {
    id: "tracker-table.searchPlaceholder",
    defaultMessage: "Search company, role, notes",
  },
  columns: { id: "tracker-table.columnsButton", defaultMessage: "Columns" },
  importCsv: { id: "tracker-table.importCsv", defaultMessage: "Import CSV" },
  addApplication: { id: "tracker-table.addApplication", defaultMessage: "Add application" },
  exportCsv: {
    id: "tracker-table.exportFormat",
    defaultMessage: "CSV · {count, plural, one {# row} other {# rows}} in this view",
  },
  scope: {
    id: "tracker-table.scope",
    defaultMessage: "Show",
    description: "Accessible name of Active/Closed/All",
  },
  scopeActive: { id: "tracker-table.scope.active", defaultMessage: "Active" },
  scopeClosed: { id: "tracker-table.scope.closed", defaultMessage: "Closed" },
  scopeAll: { id: "tracker-table.scope.all", defaultMessage: "All" },
  statusFilter: { id: "tracker-table.statusFilter", defaultMessage: "Status" },
  statusFilterMenu: { id: "tracker-table.statusFilterMenu", defaultMessage: "Filter by status" },
  statusChip: {
    id: "tracker-table.statusChip",
    defaultMessage: "Status is {statuses}",
    description: "Filter chip sentence; {statuses} is a list like 'Screening, Interviewing'",
  },
  removeStatusFilter: { id: "tracker-table.removeStatusFilter", defaultMessage: "Remove status filter" },
  resetStatuses: { id: "tracker-table.resetStatuses", defaultMessage: "Reset" },
  clearFilters: { id: "tracker-table.clearFilters", defaultMessage: "Clear filters" },
  emptyTitle: { id: "tracker-table.empty.title", defaultMessage: "Nothing tracked yet" },
  emptyBody: {
    id: "tracker-table.empty.body",
    defaultMessage:
      "Save a job or add an application you've already sent. Tracking in a spreadsheet? Bring it in.",
  },
  noResults: {
    id: "tracker-table.noResults",
    defaultMessage: "No applications match these filters.",
  },
  nothingToMove: {
    id: "tracker-table.toast.nothingToMove",
    defaultMessage: "Nothing moved: the selected applications are already {status} or can't move there yet.",
  },
  exported: {
    id: "tracker-table.toast.exported",
    defaultMessage: "Saved {fileName}",
  },
  exportFailed: {
    id: "tracker-table.toast.exportFailed",
    defaultMessage: "Couldn't save the CSV file. Try again, or choose another folder.",
  },
  fileName: {
    id: "tracker-table.export.fileName",
    defaultMessage: "BruteForceHR applications {date}",
    description: "CSV export file name without extension; {date} is YYYY-MM-DD",
  },
  group: { id: "tracker-table.keys.group", defaultMessage: "Tracker table" },
  keySearch: { id: "tracker-table.keys.search", defaultMessage: "Search" },
  keySelect: { id: "tracker-table.keys.select", defaultMessage: "Select or deselect the row" },
  keySelectAll: { id: "tracker-table.keys.selectAll", defaultMessage: "Select all rows" },
  keyMove: { id: "tracker-table.keys.move", defaultMessage: "Move to…" },
  keyClear: { id: "tracker-table.keys.clear", defaultMessage: "Clear selection" },
  keyOpenPage: { id: "tracker-table.keys.openPage", defaultMessage: "Open full page" },
  panelNav: {
    id: "tracker-table.panelNav",
    defaultMessage: "{index} of {count} in Table",
    description: "Detail panel position label",
  },
});

const ALL_STATUSES: readonly ApplicationStatus[] = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES];
const SKELETON_COLUMNS = ["w-60", "w-64", "w-40", "w-28", "w-32", "flex-1"] as const;

export default function TrackerTableScreen({ model, params }: ScreenProps<TrackerTableModel>) {
  const intl = useIntl();
  const title = intl.formatMessage(destinationMessages.tracker);
  const showSkeleton = useSkeletonGate(model.status === "loading");
  return (
    <div className="relative flex min-h-0 flex-1">
      {model.status === "ready" ? (
        <ReadyTable key="ready" model={model.data} params={params} stamp={model.fromCache ? model : null} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" aria-busy={model.status === "loading"}>
          <Toolbar title={title} />
          {model.status === "error" ? (
            <PaneError
              title={intl.formatMessage(messages.errorTitle)}
              body={intl.formatMessage(messages.errorBody)}
              onRetry={model.retry}
            />
          ) : (
            showSkeleton && (
              <div className="border-line-subtle border-t">
                {Array.from({ length: 10 }, (_, index) => (
                  <TableRowSkeleton key={index} columns={SKELETON_COLUMNS} />
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function Toolbar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-6 pt-5 pb-3">
      <ScreenTitle title={title} />
      <TrackerViewSwitch current="table" />
      {children}
    </div>
  );
}

type Stamp = Extract<ScreenProps<TrackerTableModel>["model"], { status: "ready" }>;

function ReadyTable({
  model,
  params,
  stamp,
}: {
  model: TrackerTableModel;
  params: ScreenProps<TrackerTableModel>["params"];
  stamp: Stamp | null;
}) {
  const intl = useIntl();
  const toast = useToast();
  const navigate = useNavigate();
  const live = useTrackerData();
  const actions = useTrackerActions();
  const [prefs, setPrefs] = useTablePrefs();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(params["applicationId"] ?? null);
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const drill = useInsightsDrillDown(live);

  const filters: TableFilters = { scope: prefs.scope, statuses: prefs.statuses, query };
  // A drill-down from Insights shows exactly its applications, whatever the scope.
  const effectiveFilters: TableFilters = drill ? { ...filters, scope: "all" } : filters;
  const filtered = useMemo(
    () => filterRows(model.rows, effectiveFilters, drill?.ids ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the filter values
    [model.rows, effectiveFilters.scope, effectiveFilters.statuses, query, drill],
  );
  const { sorted, headers } = useSortedRows(filtered, prefs.columns, prefs.sorting, (sorting: SortingState) =>
    setPrefs((current) => ({ ...current, sorting })),
  );

  const visibleSelected = sorted.filter((row) => selected.has(row.applicationId));
  const selectedIds = visibleSelected.map((row) => row.applicationId);
  const focused = sorted.find((row) => row.applicationId === focusedId) ?? null;
  const filtersActive = prefs.statuses.length > 0 || query !== "" || drill !== null;

  const setScope = (scope: TableScope) => setPrefs((current) => ({ ...current, scope }));
  const setStatuses = (statuses: readonly ApplicationStatus[]) =>
    setPrefs((current) => ({ ...current, statuses: [...statuses] }));
  const clearFilters = () => {
    setStatuses([]);
    setQuery("");
    drill?.dismiss();
  };

  const toggleSelected = (applicationId: string, range: boolean) => {
    const next = new Set(selected);
    const from =
      anchor.current === null ? -1 : sorted.findIndex((row) => row.applicationId === anchor.current);
    const to = sorted.findIndex((row) => row.applicationId === applicationId);
    if (range && from >= 0 && to >= 0) {
      const select = !selected.has(applicationId) || selected.has(anchor.current ?? "");
      for (const row of sorted.slice(Math.min(from, to), Math.max(from, to) + 1))
        if (select) next.add(row.applicationId);
        else next.delete(row.applicationId);
    } else if (next.has(applicationId)) next.delete(applicationId);
    else next.add(applicationId);
    anchor.current = applicationId;
    setSelected(next);
  };
  const toggleAll = () =>
    setSelected(
      sorted.length > 0 && sorted.every((row) => selected.has(row.applicationId))
        ? new Set()
        : new Set(sorted.map((row) => row.applicationId)),
    );

  const byId = useMemo(
    () =>
      new Map(
        (live.status === "ready" ? live.data.applications : []).map((application) => [
          application.id,
          application,
        ]),
      ),
    [live],
  );
  const movableCount = (to: ApplicationStatus) =>
    planBulkMove(
      selectedIds.flatMap((id) => byId.get(id) ?? []),
      to,
    ).movable.length;

  const exportRows = async (rows: typeof sorted) => {
    if (exporting) return;
    setExporting(true);
    const fileName = `${intl.formatMessage(messages.fileName, { date: model.today })}.csv`;
    try {
      const csv = tableCsv(rows, prefs.columns, intl);
      const path = await saveExportFile(new TextEncoder().encode(csv), fileName, "csv");
      if (path !== null)
        toast.show({ variant: "info", message: intl.formatMessage(messages.exported, { fileName }) });
    } catch {
      toast.show({ variant: "info", message: intl.formatMessage(messages.exportFailed) });
    } finally {
      setExporting(false);
    }
  };

  const inTable = (event: KeyboardEvent) =>
    event.target instanceof Element && event.target.closest("[data-testid=tracker-table-scroll]") !== null;
  const group = intl.formatMessage(messages.group);
  useKeyBindings([
    {
      id: "tracker-table.search",
      keys: "/",
      label: intl.formatMessage(messages.keySearch),
      group,
      run: () => searchRef.current?.focus(),
    },
    {
      id: "tracker-table.select",
      keys: "X",
      label: intl.formatMessage(messages.keySelect),
      group,
      enabled: focused !== null,
      when: inTable,
      run: () => focused && toggleSelected(focused.applicationId, false),
    },
    {
      id: "tracker-table.selectAll",
      keys: "Mod+A",
      label: intl.formatMessage(messages.keySelectAll),
      group,
      inTextFields: false,
      run: (event) => {
        event.preventDefault();
        setSelected(new Set(sorted.map((row) => row.applicationId)));
      },
    },
    {
      id: "tracker-table.move",
      keys: "M",
      label: intl.formatMessage(messages.keyMove),
      group,
      enabled: selectedIds.length > 0 || focused !== null,
      run: () => {
        if (selectedIds.length > 0) setBulkMenuOpen(true);
        else if (focused) setStatusMenuId(focused.applicationId);
      },
    },
    {
      id: "tracker-table.clear",
      keys: "Escape",
      label: intl.formatMessage(messages.keyClear),
      group,
      enabled: selected.size > 0,
      run: () => setSelected(new Set()),
    },
    {
      id: "tracker-table.openPage",
      keys: "Mod+Enter",
      label: intl.formatMessage(messages.keyOpenPage),
      group,
      enabled: focused !== null || openId !== null,
      run: () => {
        const applicationId = openId ?? focused?.applicationId;
        if (applicationId)
          void navigate({ to: "/tracker/applications/$applicationId", params: { applicationId } });
      },
    },
  ]);

  const openIndex = sorted.findIndex((row) => row.applicationId === openId);
  const count = model.rows.length;

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Toolbar title={intl.formatMessage(destinationMessages.tracker)}>
          {!model.firstUse && (
            <p className="text-fg-secondary text-callout tabular-nums" aria-live="polite">
              {sorted.length === count
                ? intl.formatMessage(messages.count, { count })
                : intl.formatMessage(messages.countFiltered, { shown: sorted.length, count })}
            </p>
          )}
          <div className="ms-auto flex items-center gap-2">
            {stamp && <StaleStamp prefix="updated" time={stamp.updatedAt} clock={stamp.updatedClock} />}
            {!model.firstUse && (
              <label className="border-line-control bg-surface-base focus-within:outline-line-focus flex h-8 w-60 items-center gap-2 rounded-md border px-2 focus-within:outline-2">
                <Search aria-hidden="true" className="text-fg-tertiary size-4 shrink-0" strokeWidth={1.75} />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && query !== "") {
                      event.stopPropagation();
                      setQuery("");
                    }
                  }}
                  aria-label={intl.formatMessage(messages.search)}
                  aria-keyshortcuts="/"
                  placeholder={intl.formatMessage(messages.searchPlaceholder)}
                  className="placeholder:text-fg-tertiary min-w-0 flex-1 bg-transparent text-callout outline-none"
                />
              </label>
            )}
            <Button icon={Columns3} onClick={() => setChooserOpen(true)}>
              {intl.formatMessage(messages.columns)}
            </Button>
            <Button icon={FileUp} onClick={() => openCsvImport()}>
              {intl.formatMessage(messages.importCsv)}
            </Button>
            <ExportButton
              formats={[
                { id: "csv", label: intl.formatMessage(messages.exportCsv, { count: sorted.length }) },
              ]}
              onExport={() => void exportRows(sorted)}
              exporting={exporting}
              disabledReason={sorted.length === 0 ? intl.formatMessage(messages.noResults) : null}
            />
          </div>
        </Toolbar>

        {!model.firstUse && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pb-3">
            <SegmentedControl
              size="sm"
              label={intl.formatMessage(messages.scope)}
              value={drill ? "all" : prefs.scope}
              onValueChange={setScope}
              options={[
                { value: "active", label: intl.formatMessage(messages.scopeActive) },
                { value: "closed", label: intl.formatMessage(messages.scopeClosed) },
                { value: "all", label: intl.formatMessage(messages.scopeAll) },
              ]}
            />
            <StatusFilter statuses={prefs.statuses} onChange={setStatuses} />
            {prefs.statuses.length > 0 && (
              <FilterChip
                label={intl.formatMessage(messages.statusChip, {
                  statuses: intl.formatList(
                    prefs.statuses.map((status) => intl.formatMessage(STATUS_MESSAGES[status])),
                  ),
                })}
                removeLabel={intl.formatMessage(messages.removeStatusFilter)}
                onRemove={() => setStatuses([])}
              />
            )}
            {drill && (
              <FilterChip label={drill.label} removeLabel={drill.dismissLabel} onRemove={drill.dismiss} />
            )}
            {filtersActive && (
              <Button variant="plain" size="sm" onClick={clearFilters}>
                {intl.formatMessage(messages.clearFilters)}
              </Button>
            )}
          </div>
        )}

        {model.firstUse ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              kind="firstUse"
              glyph={Table2}
              title={intl.formatMessage(messages.emptyTitle)}
              body={intl.formatMessage(messages.emptyBody)}
              primary={{
                label: intl.formatMessage(messages.addApplication),
                onClick: () => openAddApplication(),
                keys: "Mod+N",
              }}
              secondary={{ label: intl.formatMessage(messages.importCsv), onClick: () => openCsvImport() }}
            />
          </div>
        ) : sorted.length === 0 ? (
          <div className="border-line-subtle flex flex-1 items-start justify-center border-t p-10">
            <EmptyState
              kind="noResults"
              body={intl.formatMessage(messages.noResults)}
              primary={{ label: intl.formatMessage(messages.clearFilters), onClick: clearFilters }}
            />
          </div>
        ) : (
          <div className="border-line-subtle relative flex min-h-0 flex-1 flex-col border-t">
            <DataTable
              rows={sorted}
              headers={headers}
              selected={selected}
              onToggleSelected={toggleSelected}
              onToggleAll={toggleAll}
              focusedId={focusedId}
              onFocusedChange={setFocusedId}
              openId={openId}
              onOpen={(applicationId: string) => {
                setFocusedId(applicationId);
                setOpenId((current) => (current === applicationId ? null : applicationId));
              }}
              onMove={(applicationId, to) => actions.move(applicationId, to)}
              statusMenuId={statusMenuId}
              onStatusMenuChange={setStatusMenuId}
            />
            {selectedIds.length > 0 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
                <BulkActionBar
                  count={selectedIds.length}
                  movableCount={movableCount}
                  onMove={(to) => {
                    if (actions.moveMany(selectedIds, to) === 0)
                      toast.show({
                        variant: "info",
                        message: intl.formatMessage(messages.nothingToMove, {
                          status: intl.formatMessage(STATUS_MESSAGES[to]),
                        }),
                      });
                  }}
                  onExport={() => void exportRows(visibleSelected)}
                  onClear={() => setSelected(new Set())}
                  menuOpen={bulkMenuOpen}
                  onMenuOpenChange={setBulkMenuOpen}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {openId !== null && (
        <ApplicationPanel
          applicationId={openId}
          nav={
            openIndex >= 0
              ? {
                  label: intl.formatMessage(messages.panelNav, {
                    index: openIndex + 1,
                    count: sorted.length,
                  }),
                  previousId: sorted[openIndex - 1]?.applicationId ?? null,
                  nextId: sorted[openIndex + 1]?.applicationId ?? null,
                }
              : null
          }
          onSelect={(applicationId) => {
            setOpenId(applicationId);
            setFocusedId(applicationId);
          }}
          onClose={() => setOpenId(null)}
        />
      )}

      <ColumnChooser
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        columns={prefs.columns}
        onColumnsChange={(columns) => setPrefs((current) => ({ ...current, columns }))}
      />
    </>
  );
}

/** "Status ▾" menu with a checkbox per status, grouped by phase, plus Reset (Twingate). */
function StatusFilter({
  statuses,
  onChange,
}: {
  statuses: readonly ApplicationStatus[];
  onChange: (statuses: readonly ApplicationStatus[]) => void;
}) {
  const intl = useIntl();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button size="sm" variant="secondary" icon={ListFilter}>
          {intl.formatMessage(messages.statusFilter)}
        </Button>
      </DropdownMenu.Trigger>
      <MenuContent aria-label={intl.formatMessage(messages.statusFilterMenu)}>
        {(["shortlist", "in_progress", "closed"] as const).map((phase, index) => (
          <Fragment key={phase}>
            {index > 0 && <MenuSeparator />}
            <MenuLabel>{intl.formatMessage(PHASE_MESSAGES[phase])}</MenuLabel>
            {ALL_STATUSES.filter((status) => statusPhase(status) === phase).map((status) => (
              <MenuCheckboxItem
                key={status}
                checked={statuses.includes(status)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked ? [...statuses, status] : statuses.filter((candidate) => candidate !== status),
                  )
                }
              >
                {intl.formatMessage(STATUS_MESSAGES[status])}
              </MenuCheckboxItem>
            ))}
          </Fragment>
        ))}
        <MenuSeparator />
        <MenuItem
          disabledReason={statuses.length === 0 ? intl.formatMessage(messages.resetStatuses) : null}
          onSelect={() => onChange([])}
        >
          {intl.formatMessage(messages.resetStatuses)}
        </MenuItem>
      </MenuContent>
    </DropdownMenu.Root>
  );
}

/** A filter as a removable sentence chip ("Status is Screening, Interviewing ×"). */
function FilterChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="bg-accent-subtle text-accent-text inline-flex h-7 max-w-96 items-center gap-1 rounded-full ps-3 pe-0.5 text-footnote font-medium">
      <span className="truncate">{label}</span>
      <IconButton size="sm" icon={X} label={removeLabel} onClick={onRemove} className="rounded-full" />
    </span>
  );
}
