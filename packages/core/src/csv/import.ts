/**
 * CSV import from spreadsheet trackers (§4.6): read the file into a table, guess which column is
 * which field and what each status word means, then plan the import row by row with the issues
 * the preview shows. Writing is the client's job: one application plus one `created` user event
 * per planned row, the event's evidence naming the file and row (`importEvidenceReason`).
 */
import type { ApplicationEvent, ApplicationPriority } from "../application";
import type { ApplicationStatus, Channel } from "../enums";
import { isActiveStatus, statusRank } from "../status";
import { type DateOrder, detectDateOrder, parseSpreadsheetDate } from "./dates";
import {
  type CsvDelimiter,
  type CsvEncoding,
  decodeCsvBytes,
  detectDelimiter,
  parseDelimited,
  stripSepLine,
  unguardCell,
} from "./text";
import {
  CHANNEL_SYNONYMS,
  HEADER_SYNONYMS,
  type ImportField,
  matchSynonyms,
  normalizeWord,
  PRIORITY_SYNONYMS,
  STATUS_SYNONYMS,
} from "./vocabulary";

/** Larger files are refused before parsing. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
/** Data rows one import may hold. */
export const MAX_IMPORT_ROWS = 2_000;

export interface SpreadsheetRow {
  /** The record's 1-based position in the file, header included: the row number Excel shows. */
  readonly rowNumber: number;
  /** Trimmed cells, one per header. */
  readonly cells: readonly string[];
}

export interface SpreadsheetTable {
  readonly fileName: string;
  readonly encoding: CsvEncoding;
  readonly delimiter: CsvDelimiter;
  readonly headers: readonly string[];
  readonly rows: readonly SpreadsheetRow[];
}

export type SpreadsheetReadErrorCode =
  /** No data rows. */
  | "empty"
  /** An .xlsx/.xls/.ods/.numbers workbook rather than CSV text. */
  | "workbook"
  /** Not text at all. */
  | "binary"
  /** No row with at least two filled cells among the first ten. */
  | "no_header"
  | "too_large"
  | "too_many_rows";

export class SpreadsheetReadError extends Error {
  readonly code: SpreadsheetReadErrorCode;

  constructor(code: SpreadsheetReadErrorCode, message: string) {
    super(message);
    this.name = "SpreadsheetReadError";
    this.code = code;
  }
}

export interface ReadSpreadsheetOptions {
  /** Overrides encoding detection. */
  readonly encoding?: CsvEncoding;
  /** Overrides delimiter detection. */
  readonly delimiter?: CsvDelimiter;
}

/** Leading rows that may be a title above the header ("Job search 2026"). */
const HEADER_SEARCH_ROWS = 10;

/**
 * Decodes and parses a CSV/TSV export. The header is the first row with two or more filled cells
 * (title rows above it are skipped); blank rows are dropped; cells are trimmed and lose the
 * apostrophe our exports add before formula-like text. Throws `SpreadsheetReadError`.
 */
export function readSpreadsheet(
  bytes: Uint8Array,
  fileName: string,
  options: ReadSpreadsheetOptions = {},
): SpreadsheetTable {
  if (bytes.length > MAX_IMPORT_BYTES) throw new SpreadsheetReadError("too_large", `${bytes.length} bytes`);
  const magic = Array.from(bytes.subarray(0, 4));
  if (
    (magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 0x03 && magic[3] === 0x04) ||
    (magic[0] === 0xd0 && magic[1] === 0xcf && magic[2] === 0x11 && magic[3] === 0xe0)
  ) {
    throw new SpreadsheetReadError("workbook", "a spreadsheet workbook, not CSV");
  }
  const decoded = decodeCsvBytes(bytes, options.encoding);
  if (decoded.text.includes("\u0000")) throw new SpreadsheetReadError("binary", "not a text file");
  const text = stripSepLine(decoded.text);
  const delimiter = options.delimiter ?? detectDelimiter(decoded.text);
  const records = parseDelimited(text, delimiter);

  const filled = (cells: readonly string[]) => cells.filter((cell) => cell.trim() !== "").length;
  const headerIndex = records.slice(0, HEADER_SEARCH_ROWS).findIndex((cells) => filled(cells) >= 2);
  if (headerIndex < 0) {
    throw new SpreadsheetReadError(
      records.some((cells) => filled(cells) > 0) ? "no_header" : "empty",
      "no header row",
    );
  }
  const rawHeaders = (records[headerIndex] ?? []).map((cell) => unguardCell(cell.trim()));
  const body = records
    .map((cells, index) => ({ rowNumber: index + 1, cells }))
    .slice(headerIndex + 1)
    .filter(({ cells }) => filled(cells) > 0);
  if (body.length === 0) throw new SpreadsheetReadError("empty", "no data rows");
  if (body.length > MAX_IMPORT_ROWS) throw new SpreadsheetReadError("too_many_rows", `${body.length} rows`);

  // Data wider than the header gets unnamed columns; trailing empty header cells are dropped.
  let width = Math.max(rawHeaders.length, ...body.map(({ cells }) => cells.length));
  while (
    width > 0 &&
    (rawHeaders[width - 1] ?? "") === "" &&
    body.every(({ cells }) => (cells[width - 1] ?? "").trim() === "")
  )
    width -= 1;
  const headers = Array.from({ length: width }, (_, index) => rawHeaders[index] ?? "");
  const rows = body.map(({ rowNumber, cells }) => ({
    rowNumber,
    cells: headers.map((_, index) => unguardCell((cells[index] ?? "").trim())),
  }));
  return { fileName, encoding: decoded.encoding, delimiter, headers, rows };
}

/** The field each column fills, by column index; null = not imported. */
export type ColumnMapping = readonly (ImportField | null)[];

/** Share of non-empty sample values that must look like a kind of value to count as that kind. */
const SNIFF_SHARE = 0.6;
const SNIFF_ROWS = 50;

function columnValues(table: SpreadsheetTable, column: number, limit = Infinity): string[] {
  const values: string[] = [];
  for (const row of table.rows) {
    const value = row.cells[column] ?? "";
    if (value !== "") values.push(value);
    if (values.length >= limit) break;
  }
  return values;
}

function share(values: readonly string[], test: (value: string) => boolean): number {
  return values.length === 0 ? 0 : values.filter(test).length / values.length;
}

const looksLikeUrl = (value: string) => /^(https?:\/\/|www\.)\S+$/i.test(value);

/**
 * Guesses the field of each column from its header (EN/TR/DE names) and, for unnamed or unknown
 * headers, from its values (links, statuses, dates). Every field is used at most once.
 */
export function guessColumnMapping(table: SpreadsheetTable): ColumnMapping {
  const candidates: { column: number; field: ImportField; score: number }[] = [];
  table.headers.forEach((header, column) => {
    const match = matchSynonyms(header, HEADER_SYNONYMS);
    match.keys.forEach((field, rank) =>
      candidates.push({ column, field, score: (match.exact ? 100 : 60) - rank }),
    );

    const sample = columnValues(table, column, SNIFF_ROWS);
    if (share(sample, looksLikeUrl) >= SNIFF_SHARE) candidates.push({ column, field: "link", score: 40 });
    if (share(sample, (value) => matchSynonyms(value, STATUS_SYNONYMS).exact) >= SNIFF_SHARE)
      candidates.push({ column, field: "status", score: 40 });
    if (share(sample, (value) => parseSpreadsheetDate(value, "dmy") !== null) >= SNIFF_SHARE)
      candidates.push({ column, field: "appliedAt", score: 20 });
  });

  const mapping: (ImportField | null)[] = table.headers.map(() => null);
  const used = new Set<ImportField>();
  for (const { column, field } of candidates.sort((a, b) => b.score - a.score || a.column - b.column)) {
    if (used.has(field) || mapping[column] !== null) continue;
    mapping[column] = field;
    used.add(field);
  }
  return mapping;
}

/** The column mapped to `field`, or -1. */
export function columnOf(mapping: ColumnMapping, field: ImportField): number {
  return mapping.indexOf(field);
}

/** Status labels of the user's UI language; matched before the synonym lists. */
export type StatusLabels = Readonly<Record<ApplicationStatus, string>>;

/**
 * Our status for a spreadsheet word. When several statuses are mentioned ("Rejected after
 * interview"), the outcome wins over progress: the last thing that happened is usually written.
 */
export function guessStatus(value: string, labels?: StatusLabels): ApplicationStatus | null {
  const word = normalizeWord(value);
  if (word === "") return null;
  if (labels) {
    for (const [status, label] of Object.entries(labels) as [ApplicationStatus, string][])
      if (normalizeWord(label) === word) return status;
  }
  const { keys } = matchSynonyms(value, STATUS_SYNONYMS);
  return keys.find((status) => !isActiveStatus(status)) ?? keys[0] ?? null;
}

export interface StatusValue {
  /** `normalizeWord` of the value: the key of `StatusMap`. "" = empty cells. */
  readonly key: string;
  /** The value as first written in the file. */
  readonly value: string;
  readonly count: number;
  readonly guess: ApplicationStatus | null;
}

/** Our status per spreadsheet status word (`StatusValue.key`). */
export type StatusMap = Readonly<Record<string, ApplicationStatus>>;

/**
 * The distinct values of the status column, most frequent first, each with a guess. Empty cells
 * are one value guessed as Applied when the file has applied dates, else Saved.
 */
export function statusValues(
  table: SpreadsheetTable,
  mapping: ColumnMapping,
  labels?: StatusLabels,
): StatusValue[] {
  const column = columnOf(mapping, "status");
  if (column < 0) return [];
  const hasAppliedDates = columnOf(mapping, "appliedAt") >= 0;
  const byKey = new Map<string, { value: string; count: number }>();
  for (const row of table.rows) {
    const value = row.cells[column] ?? "";
    const key = normalizeWord(value);
    const entry = byKey.get(key);
    if (entry) entry.count += 1;
    else byKey.set(key, { value, count: 1 });
  }
  return [...byKey.entries()]
    .map(([key, { value, count }]) => ({
      key,
      value,
      count,
      guess: key === "" ? (hasAppliedDates ? "applied" : "saved") : guessStatus(value, labels),
    }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** The guesses as a starting `StatusMap` (unknown values stay unmapped). */
export function guessedStatusMap(values: readonly StatusValue[]): StatusMap {
  return Object.fromEntries(values.flatMap(({ key, guess }) => (guess ? [[key, guess]] : [])));
}

/** The date order of the mapped date columns, `fallback` when nothing decides it. */
export function detectTableDateOrder(
  table: SpreadsheetTable,
  mapping: ColumnMapping,
  fallback: DateOrder,
): DateOrder {
  const values = (["appliedAt", "statusChangedAt", "nextActionAt"] as const).flatMap((field) => {
    const column = columnOf(mapping, field);
    return column < 0 ? [] : columnValues(table, column);
  });
  return detectDateOrder(values, fallback);
}

export interface ImportSettings {
  readonly mapping: ColumnMapping;
  readonly statusMap: StatusMap;
  /** Status of every row when no column is mapped to status. */
  readonly defaultStatus: ApplicationStatus;
  readonly dateOrder: DateOrder;
  /** Unmapped columns with a value go into the notes as "Header: value" lines. */
  readonly keepUnmappedInNotes: boolean;
  readonly now: Date;
  /** Applications already tracked, for duplicate detection. */
  readonly existing: readonly { readonly company: string; readonly role: string }[];
}

export type ImportIssueCode =
  | "missing_company"
  | "missing_role"
  /** The status word isn't mapped to one of ours yet. */
  | "unmapped_status"
  /** Not a date we can read; the value is left out. */
  | "bad_date"
  /** An applied or update date in the future; left out. */
  | "future_date"
  /** Not a web address; left out. */
  | "bad_link"
  /** Longer than we store; shortened. */
  | "truncated"
  /** Saved/Preparing rows have no applied date; left out. */
  | "applied_date_ignored"
  | "duplicate_existing"
  | "duplicate_in_file";

export interface ImportIssue {
  readonly code: ImportIssueCode;
  readonly field: ImportField | null;
  /** The cell value concerned. */
  readonly value: string | null;
  /** Blocking issues keep the row out of the import. */
  readonly blocking: boolean;
}

/** One application to create, in domain terms; the client adds ids and defaults. */
export interface ImportDraft {
  readonly company: string;
  readonly role: string;
  readonly status: ApplicationStatus;
  readonly appliedAt: Date | null;
  readonly statusChangedAt: Date;
  readonly location: string | null;
  readonly link: string | null;
  readonly channel: Channel | null;
  readonly nextAction: string | null;
  readonly nextActionAt: Date | null;
  readonly priority: ApplicationPriority;
  readonly notes: string;
  /** When the `created` event happened: the applied date, else the status date. */
  readonly occurredAt: Date;
}

export interface PlannedRow {
  readonly rowNumber: number;
  /** Null when a blocking issue keeps the row out. */
  readonly draft: ImportDraft | null;
  readonly issues: readonly ImportIssue[];
  /** Imported unless the user says otherwise: has a draft and isn't a duplicate. */
  readonly includeByDefault: boolean;
  /** Raw cells for the preview, whatever their validity. */
  readonly company: string;
  readonly role: string;
  readonly statusValue: string;
}

export interface ImportPlan {
  readonly rows: readonly PlannedRow[];
  /** Rows with a draft. */
  readonly ready: number;
  /** Rows with a blocking issue. */
  readonly blocked: number;
  readonly duplicates: number;
}

const LIMITS = { company: 200, role: 200, location: 200, nextAction: 200, notes: 20_000 } as const;
const MAX_LINK_LENGTH = 2_000;
/** Applied/update dates this far ahead of now are typos, not plans. */
const FUTURE_SLACK_MS = 86_400_000;

const duplicateKey = (company: string, role: string) => `${normalizeWord(company)}|${normalizeWord(role)}`;

/** Builds the import, row by row, with every issue the preview lists. Pure. */
export function planImport(table: SpreadsheetTable, settings: ImportSettings): ImportPlan {
  const { mapping, now } = settings;
  const cell = (row: SpreadsheetRow, field: ImportField) => {
    const column = columnOf(mapping, field);
    return column < 0 ? "" : (row.cells[column] ?? "");
  };
  const existing = new Set(settings.existing.map(({ company, role }) => duplicateKey(company, role)));
  const seen = new Set<string>();

  const rows = table.rows.map((row): PlannedRow => {
    const issues: ImportIssue[] = [];
    const issue = (
      code: ImportIssueCode,
      field: ImportField | null,
      value: string | null,
      blocking = false,
    ) => issues.push({ code, field, value, blocking });
    const text = (field: "company" | "role" | "location" | "nextAction") => {
      const value = cell(row, field).replace(/\s+/g, " ");
      if (value.length <= LIMITS[field]) return value;
      issue("truncated", field, value);
      return value.slice(0, LIMITS[field]).trimEnd();
    };
    const date = (field: "appliedAt" | "statusChangedAt" | "nextActionAt") => {
      const value = cell(row, field);
      if (value === "") return null;
      const parsed = parseSpreadsheetDate(value, settings.dateOrder);
      if (parsed === null) {
        issue("bad_date", field, value);
        return null;
      }
      if (field !== "nextActionAt" && parsed.getTime() > now.getTime() + FUTURE_SLACK_MS) {
        issue("future_date", field, value);
        return null;
      }
      return parsed;
    };

    const company = text("company");
    const role = text("role");
    if (company === "") issue("missing_company", "company", null, true);
    if (role === "") issue("missing_role", "role", null, true);

    const statusValue = cell(row, "status");
    const status: ApplicationStatus | undefined =
      columnOf(mapping, "status") < 0
        ? settings.defaultStatus
        : settings.statusMap[normalizeWord(statusValue)];
    if (status === undefined) issue("unmapped_status", "status", statusValue, true);

    let appliedAt = date("appliedAt");
    const updatedAt = date("statusChangedAt");
    if (
      appliedAt !== null &&
      status !== undefined &&
      (statusRank(status) ?? Infinity) < (statusRank("applied") ?? 0)
    ) {
      issue("applied_date_ignored", "appliedAt", cell(row, "appliedAt"));
      appliedAt = null;
    }
    const statusChangedAt =
      updatedAt !== null && (appliedAt === null || updatedAt >= appliedAt) ? updatedAt : (appliedAt ?? now);

    const linkValue = cell(row, "link");
    let link: string | null = null;
    if (linkValue !== "") {
      const candidate = /^www\./i.test(linkValue) ? `https://${linkValue}` : linkValue;
      try {
        const url = new URL(candidate);
        if ((url.protocol === "https:" || url.protocol === "http:") && candidate.length <= MAX_LINK_LENGTH)
          link = url.href;
      } catch {
        // reported below
      }
      if (link === null) issue("bad_link", "link", linkValue);
    }

    const channelValue = cell(row, "channel");
    const channel =
      channelValue === "" ? null : (matchSynonyms(channelValue, CHANNEL_SYNONYMS).keys[0] ?? "other");
    const priority = matchSynonyms(cell(row, "priority"), PRIORITY_SYNONYMS).keys[0] ?? "normal";

    const noteLines = [cell(row, "notes")];
    if (settings.keepUnmappedInNotes) {
      table.headers.forEach((header, column) => {
        const value = row.cells[column] ?? "";
        if (mapping[column] === null && value !== "")
          noteLines.push(header === "" ? value : `${header}: ${value}`);
      });
    }
    let notes = noteLines.filter((line) => line !== "").join("\n");
    if (notes.length > LIMITS.notes) {
      issue("truncated", "notes", null);
      notes = notes.slice(0, LIMITS.notes);
    }

    const key = duplicateKey(company, role);
    let duplicate = false;
    if (company !== "" && role !== "") {
      if (existing.has(key)) {
        issue("duplicate_existing", null, null);
        duplicate = true;
      } else if (seen.has(key)) {
        issue("duplicate_in_file", null, null);
        duplicate = true;
      }
      seen.add(key);
    }

    const blocked = issues.some(({ blocking }) => blocking);
    const nextAction = text("nextAction");
    const draft: ImportDraft | null =
      blocked || status === undefined
        ? null
        : {
            company,
            role,
            status,
            appliedAt,
            statusChangedAt,
            location: text("location") || null,
            link,
            channel,
            nextAction: nextAction || null,
            nextActionAt: date("nextActionAt"),
            priority,
            notes,
            occurredAt: appliedAt ?? statusChangedAt,
          };
    return {
      rowNumber: row.rowNumber,
      draft,
      issues,
      includeByDefault: draft !== null && !duplicate,
      company: cell(row, "company"),
      role: cell(row, "role"),
      statusValue,
    };
  });

  return {
    rows,
    ready: rows.filter(({ draft }) => draft !== null).length,
    blocked: rows.filter(({ draft }) => draft === null).length,
    duplicates: rows.filter(({ issues }) => issues.some(({ code }) => code.startsWith("duplicate_"))).length,
  };
}

const REASON_PREFIX = "Imported from ";
/** `EventEvidence.reason` allows 500 characters. */
const MAX_REASON = 500;

/**
 * The `created` event's evidence reason for an imported row: "Imported from tracker.csv · row 4".
 * Stored in English; clients localize it through `parseImportEvidenceReason`.
 */
export function importEvidenceReason(fileName: string, rowNumber: number): string {
  const suffix = ` · row ${rowNumber}`;
  const room = MAX_REASON - REASON_PREFIX.length - suffix.length;
  const name = fileName.length > room ? `${fileName.slice(0, room - 1)}…` : fileName;
  return `${REASON_PREFIX}${name}${suffix}`;
}

/** File name and row of an import reason, or null for any other reason. */
export function parseImportEvidenceReason(reason: string): { fileName: string; rowNumber: number } | null {
  const match = /^Imported from (.+) · row (\d+)$/.exec(reason);
  return match ? { fileName: match[1] as string, rowNumber: Number(match[2]) } : null;
}

/** Whether `event` is the `created` event of a CSV-imported application. */
export function isImportedEvent(event: Pick<ApplicationEvent, "type" | "evidence">): boolean {
  return (
    event.type === "created" &&
    event.evidence !== null &&
    parseImportEvidenceReason(event.evidence.reason) !== null
  );
}
