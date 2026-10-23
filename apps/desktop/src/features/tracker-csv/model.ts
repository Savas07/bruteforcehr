/**
 * The CSV import's wording and the step from a planned row to the repository's `NewApplication`.
 * Reading, guessing and planning are `@bfhr/core` (`readSpreadsheet`, `guessColumnMapping`,
 * `statusValues`, `planImport`); this file only adds UI language and defaults.
 */
import {
  type ApplicationStatus,
  type CsvDelimiter,
  type CsvEncoding,
  type DateOrder,
  type ImportField,
  type ImportIssue,
  importEvidenceReason,
  type ImportPlan,
  type SpreadsheetReadErrorCode,
  type StatusLabels,
} from "@bfhr/core";
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import { newApplication, type NewApplication } from "../../data/tracker/writes";
import { STATUS_MESSAGES } from "../../shared/model/vocabulary";

export const FIELD_MESSAGES: Readonly<Record<ImportField, MessageDescriptor>> = defineMessages({
  company: { id: "tracker-csv.field.company", defaultMessage: "Company" },
  role: { id: "tracker-csv.field.role", defaultMessage: "Role" },
  status: { id: "tracker-csv.field.status", defaultMessage: "Status" },
  appliedAt: { id: "tracker-csv.field.appliedAt", defaultMessage: "Applied on" },
  statusChangedAt: {
    id: "tracker-csv.field.statusChangedAt",
    defaultMessage: "Last update",
    description: "Import field: the date the status last changed",
  },
  location: { id: "tracker-csv.field.location", defaultMessage: "Location" },
  link: { id: "tracker-csv.field.link", defaultMessage: "Job link" },
  channel: { id: "tracker-csv.field.channel", defaultMessage: "Applied via" },
  nextAction: { id: "tracker-csv.field.nextAction", defaultMessage: "Next action" },
  nextActionAt: { id: "tracker-csv.field.nextActionAt", defaultMessage: "Next action date" },
  priority: { id: "tracker-csv.field.priority", defaultMessage: "Priority" },
  notes: { id: "tracker-csv.field.notes", defaultMessage: "Notes" },
});

export const ENCODING_MESSAGES: Readonly<Record<CsvEncoding, MessageDescriptor>> = defineMessages({
  "utf-8": { id: "tracker-csv.encoding.utf8", defaultMessage: "Unicode (UTF-8)" },
  "utf-16le": { id: "tracker-csv.encoding.utf16le", defaultMessage: "Unicode (UTF-16)" },
  "utf-16be": { id: "tracker-csv.encoding.utf16be", defaultMessage: "Unicode (UTF-16, big-endian)" },
  "windows-1254": { id: "tracker-csv.encoding.windows1254", defaultMessage: "Turkish (Windows-1254)" },
  "windows-1252": { id: "tracker-csv.encoding.windows1252", defaultMessage: "Western European (Windows-1252)" },
});

export const DELIMITER_MESSAGES: Readonly<Record<CsvDelimiter, MessageDescriptor>> = defineMessages({
  ",": { id: "tracker-csv.delimiter.comma", defaultMessage: "Commas" },
  ";": { id: "tracker-csv.delimiter.semicolon", defaultMessage: "Semicolons" },
  "\t": { id: "tracker-csv.delimiter.tab", defaultMessage: "Tabs" },
  "|": { id: "tracker-csv.delimiter.pipe", defaultMessage: "Vertical bars" },
});

export const DATE_ORDER_MESSAGES: Readonly<Record<DateOrder, MessageDescriptor>> = defineMessages({
  dmy: { id: "tracker-csv.dateOrder.dmy", defaultMessage: "Day first (31.12.2026)" },
  mdy: { id: "tracker-csv.dateOrder.mdy", defaultMessage: "Month first (12/31/2026)" },
});

const READ_ERROR_TEXT = defineMessages({
  workbookTitle: { id: "tracker-csv.error.workbook.title", defaultMessage: "This is a spreadsheet workbook, not a CSV file" },
  workbookBody: { id: "tracker-csv.error.workbook.body", defaultMessage: "Save it as CSV first. In Excel: File › Save As › CSV UTF-8. In Numbers: File › Export To › CSV. In Google Sheets: File › Download › CSV." },
  binaryTitle: { id: "tracker-csv.error.binary.title", defaultMessage: "This isn't a text file" },
  binaryBody: { id: "tracker-csv.error.binary.body", defaultMessage: "Choose the CSV file you exported from your spreadsheet." },
  emptyTitle: { id: "tracker-csv.error.empty.title", defaultMessage: "This file has no rows to import" },
  emptyBody: { id: "tracker-csv.error.empty.body", defaultMessage: "Check that you exported the sheet that holds your applications." },
  noHeaderTitle: { id: "tracker-csv.error.noHeader.title", defaultMessage: "We couldn't find the column names" },
  noHeaderBody: { id: "tracker-csv.error.noHeader.body", defaultMessage: "One of the first rows should name the columns, like Company and Role." },
  tooLargeTitle: { id: "tracker-csv.error.tooLarge.title", defaultMessage: "This file is larger than 5 MB" },
  tooLargeBody: { id: "tracker-csv.error.tooLarge.body", defaultMessage: "Remove columns you don't need, or split the sheet into smaller files." },
  tooManyRowsTitle: { id: "tracker-csv.error.tooManyRows.title", defaultMessage: "This file has more than 2,000 rows" },
  tooManyRowsBody: { id: "tracker-csv.error.tooManyRows.body", defaultMessage: "Split it into smaller files and import them one by one." },
  unreadableTitle: { id: "tracker-csv.error.unreadable.title", defaultMessage: "We couldn't open this file" },
  unreadableBody: { id: "tracker-csv.error.unreadable.body", defaultMessage: "Try again, or export the sheet as CSV once more." },
});

/** What went wrong reading the file: title + what to do. */
export const READ_ERROR_MESSAGES: Readonly<
  Record<SpreadsheetReadErrorCode | "unreadable", readonly [MessageDescriptor, MessageDescriptor]>
> = {
  workbook: [READ_ERROR_TEXT.workbookTitle, READ_ERROR_TEXT.workbookBody],
  binary: [READ_ERROR_TEXT.binaryTitle, READ_ERROR_TEXT.binaryBody],
  empty: [READ_ERROR_TEXT.emptyTitle, READ_ERROR_TEXT.emptyBody],
  no_header: [READ_ERROR_TEXT.noHeaderTitle, READ_ERROR_TEXT.noHeaderBody],
  too_large: [READ_ERROR_TEXT.tooLargeTitle, READ_ERROR_TEXT.tooLargeBody],
  too_many_rows: [READ_ERROR_TEXT.tooManyRowsTitle, READ_ERROR_TEXT.tooManyRowsBody],
  unreadable: [READ_ERROR_TEXT.unreadableTitle, READ_ERROR_TEXT.unreadableBody],
};

const ISSUE_MESSAGES = defineMessages({
  missing_company: { id: "tracker-csv.issue.missingCompany", defaultMessage: "No company" },
  missing_role: { id: "tracker-csv.issue.missingRole", defaultMessage: "No role" },
  unmapped_status: {
    id: "tracker-csv.issue.unmappedStatus",
    defaultMessage: "Choose what “{value}” means in Statuses",
  },
  bad_date: {
    id: "tracker-csv.issue.badDate",
    defaultMessage: "{field}: “{value}” isn't a date we can read, so it's left out",
  },
  future_date: {
    id: "tracker-csv.issue.futureDate",
    defaultMessage: "{field}: {value} is in the future, so it's left out",
  },
  bad_link: { id: "tracker-csv.issue.badLink", defaultMessage: "Job link isn't a web address, so it's left out" },
  truncated: { id: "tracker-csv.issue.truncated", defaultMessage: "{field} is long, so it's shortened" },
  applied_date_ignored: {
    id: "tracker-csv.issue.appliedDateIgnored",
    defaultMessage: "Not applied yet, so the applied date is left out",
  },
  duplicate_existing: {
    id: "tracker-csv.issue.duplicateExisting",
    defaultMessage: "Already in your Tracker",
  },
  duplicate_in_file: {
    id: "tracker-csv.issue.duplicateInFile",
    defaultMessage: "Same company and role as an earlier row",
  },
});

/** One line per issue, in the UI language. */
export function issueText(issue: ImportIssue, intl: IntlShape): string {
  const field = issue.field ? intl.formatMessage(FIELD_MESSAGES[issue.field]) : "";
  return intl.formatMessage(ISSUE_MESSAGES[issue.code], { field, value: issue.value ?? "" });
}

/** The UI language's status labels, matched first when guessing (a re-imported export). */
export function statusLabels(intl: IntlShape): StatusLabels {
  return Object.fromEntries(
    (Object.keys(STATUS_MESSAGES) as ApplicationStatus[]).map((status) => [
      status,
      intl.formatMessage(STATUS_MESSAGES[status]),
    ]),
  ) as StatusLabels;
}

/** Numeric dates default to month first only for US English. */
export function defaultDateOrder(locale: string): DateOrder {
  return /^en-US$/i.test(locale) ? "mdy" : "dmy";
}

/**
 * The repository input for the chosen rows: a complete application per draft (statuses, dates,
 * next action and priority from the file; everything else default) and its `created` event,
 * timed at the applied date with the file and row as the evidence.
 */
export function newApplications(
  plan: ImportPlan,
  included: ReadonlySet<number>,
  fileName: string,
  now: Date,
): NewApplication[] {
  return plan.rows.flatMap(({ rowNumber, draft }) => {
    if (!draft || !included.has(rowNumber)) return [];
    const base = newApplication(
      {
        company: draft.company,
        role: draft.role,
        status: draft.status,
        location: draft.location,
        channel: draft.channel,
        appliedAt: draft.appliedAt,
        notes: draft.notes,
      },
      now,
    );
    return [
      {
        application: {
          ...base,
          statusChangedAt: draft.statusChangedAt,
          nextAction: draft.nextAction,
          nextActionAt: draft.nextActionAt,
          priority: draft.priority,
        },
        reason: importEvidenceReason(fileName, rowNumber),
        link: draft.link,
        occurredAt: draft.occurredAt,
      },
    ];
  });
}
