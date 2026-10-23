/**
 * Tracker table (`/tracker?view=table`, research/tracker.md "Decision — Desktop › Table"): one row
 * per application with sortable columns, filters, a column chooser and bulk status moves. The
 * builder is pure (dates and labels from `ctx`); filtering and CSV export of the visible rows are
 * pure helpers the view composes.
 */
import {
  type Application,
  type ApplicationEvent,
  type ApplicationPriority,
  type ApplicationStatus,
  canTransition,
  type Cv,
  isActiveStatus,
  isoDay,
  normalizeWord,
  statusPhase,
  writeCsv,
} from "@bfhr/core";
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import { CHANNEL_MESSAGES } from "../../shared/model/build-blocks";
import { absoluteDateTime, relativeTime, shortDate } from "../../shared/model/format";
import type { CompanyVM, ModelContext, StatusVM, UserData } from "../../shared/model/types";
import { companyVM, statusVM } from "../../shared/model/vocabulary";
import { jobSourceName } from "../job-detail/model";

export const TABLE_COLUMNS = [
  "company",
  "role",
  "status",
  "appliedAt",
  "lastActivity",
  "nextAction",
  "source",
  "cv",
  "location",
  "channel",
  "priority",
  "added",
] as const;
export type TableColumnId = (typeof TABLE_COLUMNS)[number];

/** Shown until the user customizes columns (research: the first nine). */
export const DEFAULT_HIDDEN_COLUMNS: readonly TableColumnId[] = ["channel", "priority", "added"];
/** The sticky first column can't be hidden. */
export const FIXED_COLUMN: TableColumnId = "company";

export const COLUMN_MESSAGES: Readonly<Record<TableColumnId, MessageDescriptor>> = defineMessages({
  company: { id: "tracker-table.column.company", defaultMessage: "Company" },
  role: { id: "tracker-table.column.role", defaultMessage: "Role" },
  status: { id: "tracker-table.column.status", defaultMessage: "Status" },
  appliedAt: { id: "tracker-table.column.appliedAt", defaultMessage: "Applied on" },
  lastActivity: { id: "tracker-table.column.lastActivity", defaultMessage: "Last activity" },
  nextAction: { id: "tracker-table.column.nextAction", defaultMessage: "Next action" },
  source: { id: "tracker-table.column.source", defaultMessage: "Source" },
  cv: { id: "tracker-table.column.cv", defaultMessage: "CV used" },
  location: { id: "tracker-table.column.location", defaultMessage: "Location" },
  channel: { id: "tracker-table.column.channel", defaultMessage: "Applied via" },
  priority: { id: "tracker-table.column.priority", defaultMessage: "Priority" },
  added: { id: "tracker-table.column.added", defaultMessage: "Added on" },
});

export const PRIORITY_MESSAGES: Readonly<Record<ApplicationPriority, MessageDescriptor>> = defineMessages({
  high: { id: "tracker-table.priority.high", defaultMessage: "High" },
  normal: { id: "tracker-table.priority.normal", defaultMessage: "Normal" },
  low: { id: "tracker-table.priority.low", defaultMessage: "Low" },
});

const messages = defineMessages({
  addedByYou: {
    id: "tracker-table.source.manual",
    defaultMessage: "Added by you",
    description: "Source cell of an application the user logged or imported",
  },
});

/** A date cell: relative or short label, absolute tooltip, a sort key and the export value. */
export interface TableDateVM {
  readonly iso: string;
  /** "12 Oct" / "3 days ago". */
  readonly label: string;
  /** "Monday 12 October 2026 at 12:00". */
  readonly absolute: string;
  readonly sort: number;
  /** `YYYY-MM-DD` in the user's zone. */
  readonly exportValue: string;
}

export interface TableRowVM {
  readonly applicationId: string;
  readonly company: CompanyVM;
  readonly role: string;
  readonly status: StatusVM;
  readonly appliedAt: TableDateVM | null;
  readonly lastActivity: TableDateVM;
  readonly nextAction: { readonly label: string; readonly due: TableDateVM | null } | null;
  /** "Greenhouse", "Added by you"; null when unknown. */
  readonly source: string | null;
  /** Title of the CV the application used. */
  readonly cv: string | null;
  readonly location: string | null;
  readonly channel: string | null;
  readonly priority: { readonly key: ApplicationPriority; readonly label: string };
  readonly added: TableDateVM;
  readonly pendingSync: boolean;
  /** Normalized company, role, location and notes for the search field. */
  readonly searchText: string;
}

export interface TrackerTableModel {
  /** Every application, most recent activity first (the stable order sorting starts from). */
  readonly rows: readonly TableRowVM[];
  /** No applications at all: the first-use empty state. */
  readonly firstUse: boolean;
  /** `YYYY-MM-DD` today in the user's zone, for export file names. */
  readonly today: string;
}

function dateVM(date: Date, ctx: ModelContext, relative: boolean): TableDateVM {
  return {
    iso: date.toISOString(),
    label: relative ? relativeTime(date, ctx).label : shortDate(date, ctx),
    absolute: absoluteDateTime(date, ctx),
    sort: date.getTime(),
    exportValue: isoDay(date, ctx.timeZone),
  };
}

function sourceLabel(application: Application, intl: IntlShape): string | null {
  const { source } = application;
  if (source === null) return null;
  if (source === "manual") return intl.formatMessage(messages.addedByYou);
  return jobSourceName(source);
}

export function buildTrackerTableModel(
  data: Pick<UserData, "applications" | "applicationEvents"> & {
    readonly cvs: readonly Pick<Cv, "id" | "title">[];
  },
  ctx: ModelContext,
): TrackerTableModel {
  const { intl } = ctx;
  const lastEvent = new Map<string, number>();
  for (const event of data.applicationEvents as readonly ApplicationEvent[]) {
    const at = event.occurredAt.getTime();
    if (at > (lastEvent.get(event.applicationId) ?? 0)) lastEvent.set(event.applicationId, at);
  }
  const cvTitles = new Map(data.cvs.map((cv) => [cv.id, cv.title]));

  const rows = data.applications.map((application): TableRowVM => {
    const last = new Date(
      Math.max(lastEvent.get(application.id) ?? 0, application.statusChangedAt.getTime()),
    );
    return {
      applicationId: application.id,
      company: companyVM(application.company, application.companyDomain),
      role: application.role,
      status: statusVM(application.status, intl),
      appliedAt: application.appliedAt ? dateVM(application.appliedAt, ctx, false) : null,
      lastActivity: dateVM(last, ctx, true),
      nextAction: application.nextAction
        ? {
            label: application.nextAction,
            due: application.nextActionAt ? dateVM(application.nextActionAt, ctx, false) : null,
          }
        : null,
      source: sourceLabel(application, intl),
      cv: application.cvId ? (cvTitles.get(application.cvId) ?? null) : null,
      location: application.location,
      channel: application.channel ? intl.formatMessage(CHANNEL_MESSAGES[application.channel]) : null,
      priority: {
        key: application.priority,
        label: intl.formatMessage(PRIORITY_MESSAGES[application.priority]),
      },
      added: dateVM(application.createdAt, ctx, false),
      pendingSync: ctx.pendingWrites.has(application.id),
      searchText: normalizeWord(
        [application.company, application.role, application.location ?? "", application.notes].join(" "),
      ),
    };
  });
  rows.sort((a, b) => b.lastActivity.sort - a.lastActivity.sort);
  return { rows, firstUse: rows.length === 0, today: isoDay(ctx.now, ctx.timeZone) };
}

/** Filter presets (iOS scope tabs): open applications, closed ones, or everything. */
export type TableScope = "active" | "closed" | "all";

export interface TableFilters {
  readonly scope: TableScope;
  /** Empty = every status of the scope. */
  readonly statuses: readonly ApplicationStatus[];
  readonly query: string;
}

export const DEFAULT_FILTERS: TableFilters = { scope: "active", statuses: [], query: "" };

/** Rows passing the filters, in model order; `onlyIds` narrows to an Insights drill-down. */
export function filterRows(
  rows: readonly TableRowVM[],
  filters: TableFilters,
  onlyIds: ReadonlySet<string> | null,
): TableRowVM[] {
  const words = normalizeWord(filters.query).split(" ").filter(Boolean);
  return rows.filter((row) => {
    if (onlyIds && !onlyIds.has(row.applicationId)) return false;
    const key = row.status.key;
    if (filters.scope === "active" && !isActiveStatus(key)) return false;
    if (filters.scope === "closed" && statusPhase(key) !== "closed") return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(key)) return false;
    return words.every((word) => row.searchText.includes(word));
  });
}

/** One move of a bulk status change, or why an application is left out. */
export interface BulkMovePlan {
  readonly movable: readonly string[];
  /** Already in the target status. */
  readonly already: readonly string[];
  /** The state machine refuses the move (Accepted/Declined before an offer). */
  readonly refused: readonly string[];
}

/** Splits the selection for a bulk move to `to` through `@bfhr/core` `canTransition`. */
export function planBulkMove(
  applications: readonly Pick<Application, "id" | "status">[],
  to: ApplicationStatus,
): BulkMovePlan {
  const movable: string[] = [];
  const already: string[] = [];
  const refused: string[] = [];
  for (const application of applications) {
    const check = canTransition(application.status, to, "user");
    if (check.allowed) movable.push(application.id);
    else if (check.reason === "same_status") already.push(application.id);
    else refused.push(application.id);
  }
  return { movable, already, refused };
}

/** The cell text a column exports (dates as `YYYY-MM-DD`, statuses by their label). */
export function exportCell(row: TableRowVM, column: TableColumnId): string {
  switch (column) {
    case "company":
      return row.company.name;
    case "role":
      return row.role;
    case "status":
      return row.status.label;
    case "appliedAt":
      return row.appliedAt?.exportValue ?? "";
    case "lastActivity":
      return row.lastActivity.exportValue;
    case "nextAction":
      return row.nextAction?.label ?? "";
    case "source":
      return row.source ?? "";
    case "cv":
      return row.cv ?? "";
    case "location":
      return row.location ?? "";
    case "channel":
      return row.channel ?? "";
    case "priority":
      return row.priority.label;
    case "added":
      return row.added.exportValue;
  }
}

/**
 * CSV of `rows` as shown (the given columns, in order) with the localized headers; the next
 * action's due date gets its own column so the file re-imports. UTF-8 with BOM, comma-separated.
 */
export function tableCsv(
  rows: readonly TableRowVM[],
  columns: readonly TableColumnId[],
  intl: IntlShape,
): string {
  const header: string[] = [];
  for (const column of columns) {
    header.push(intl.formatMessage(COLUMN_MESSAGES[column]));
    if (column === "nextAction") header.push(intl.formatMessage(exportMessages.nextActionDue));
  }
  const body = rows.map((row) =>
    columns.flatMap((column) =>
      column === "nextAction"
        ? [exportCell(row, column), row.nextAction?.due?.exportValue ?? ""]
        : [exportCell(row, column)],
    ),
  );
  return writeCsv([header, ...body]);
}

const exportMessages = defineMessages({
  nextActionDue: {
    id: "tracker-table.export.nextActionDue",
    defaultMessage: "Next action date",
    description: "CSV export header of the next action's due date column",
  },
});
