/**
 * "Import from a spreadsheet" (research/tracker.md §4.6 CSV import; states.md errors; flows.md
 * import trust rules): File → Columns → Statuses → Review, in one dialog.
 *
 * - File: drop or choose a CSV/TSV. It is read on this device; encoding (UTF-8, UTF-16,
 *   Windows-1254/1252) and delimiter are detected and can be changed.
 * - Columns: each file column with sample values and a guessed field (EN/TR/DE headers).
 * - Statuses: each distinct status word mapped to one of ours (guessed, editable).
 * - Review: every row with its issues; blocked rows can't be ticked, duplicates start unticked.
 *
 * Import writes one application + one `created` user event per row ("Imported from file · row
 * N") in batches, then a toast offers Undo, which deletes exactly those applications.
 */
import {
  ACTIVE_STATUSES,
  type ApplicationStatus,
  type ColumnMapping,
  CSV_DELIMITERS,
  CSV_ENCODINGS,
  type CsvDelimiter,
  type CsvEncoding,
  type DateOrder,
  detectTableDateOrder,
  guessColumnMapping,
  guessedStatusMap,
  IMPORT_FIELDS,
  type ImportField,
  type ImportPlan,
  planImport,
  readSpreadsheet,
  REQUIRED_IMPORT_FIELDS,
  SpreadsheetReadError,
  type SpreadsheetReadErrorCode,
  type SpreadsheetTable,
  type StatusLabels,
  type StatusMap,
  statusValues,
  TERMINAL_STATUSES,
} from "@bfhr/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileUp, Upload, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type DragEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useTrackerData } from "../../data/tracker/live";
import { useTrackerRepository } from "../../data/tracker/repository";
import { cx } from "../../shared/cx";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { STATUS_MESSAGES, statusVM } from "../../shared/model/vocabulary";
import { Button, IconButton } from "../../shared/ui/Button";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { StatusPill } from "../../shared/ui/StatusPill";
import { useToast } from "../../shared/ui/Toast";
import {
  DATE_ORDER_MESSAGES,
  defaultDateOrder,
  DELIMITER_MESSAGES,
  ENCODING_MESSAGES,
  FIELD_MESSAGES,
  issueText,
  newApplications,
  READ_ERROR_MESSAGES,
  statusLabels,
} from "./model";
import { closeCsvImport, type CsvImportStep, useCsvImportRequest } from "./store";

const messages = defineMessages({
  title: { id: "tracker-csv.title", defaultMessage: "Import from a spreadsheet" },
  close: { id: "tracker-csv.close", defaultMessage: "Close" },
  steps: { id: "tracker-csv.steps", defaultMessage: "Import steps" },
  stepFile: { id: "tracker-csv.step.file", defaultMessage: "File" },
  stepColumns: { id: "tracker-csv.step.columns", defaultMessage: "Columns" },
  stepStatuses: { id: "tracker-csv.step.statuses", defaultMessage: "Statuses" },
  stepReview: { id: "tracker-csv.step.review", defaultMessage: "Review" },
  intro: {
    id: "tracker-csv.intro",
    defaultMessage:
      "Bring in the applications you tracked in Excel, Google Sheets or Numbers. Save the sheet as CSV first.",
  },
  dropTitle: { id: "tracker-csv.drop.title", defaultMessage: "Drop a CSV file here" },
  dropActive: { id: "tracker-csv.drop.active", defaultMessage: "Drop to read it" },
  choose: { id: "tracker-csv.choose", defaultMessage: "Choose file…" },
  formats: {
    id: "tracker-csv.formats",
    defaultMessage:
      "CSV or TSV · up to 5 MB and 2,000 rows · any column names, in English, Turkish or German",
  },
  privacy: {
    id: "tracker-csv.privacy",
    defaultMessage:
      "The file is read on this device. Only the applications you import are saved to your account.",
  },
  fileLine: {
    id: "tracker-csv.fileLine",
    defaultMessage: "{fileName} · {rows, plural, one {# row} other {# rows}}",
  },
  columnsIntro: {
    id: "tracker-csv.columns.intro",
    defaultMessage:
      "Match your columns to ours. We guessed from the column names; change anything that's off.",
  },
  readAs: { id: "tracker-csv.readAs", defaultMessage: "Characters" },
  separatedBy: { id: "tracker-csv.separatedBy", defaultMessage: "Separated by" },
  dateOrder: { id: "tracker-csv.dateOrder", defaultMessage: "Dates" },
  yourColumn: { id: "tracker-csv.columns.yours", defaultMessage: "Your column" },
  samples: { id: "tracker-csv.columns.samples", defaultMessage: "First values" },
  importsAs: { id: "tracker-csv.columns.importsAs", defaultMessage: "Imports as" },
  unnamed: { id: "tracker-csv.columns.unnamed", defaultMessage: "Column {index}" },
  dontImport: { id: "tracker-csv.columns.dontImport", defaultMessage: "Don't import" },
  required: { id: "tracker-csv.columns.required", defaultMessage: "(needed)" },
  usedBy: {
    id: "tracker-csv.columns.usedBy",
    defaultMessage: "{field} · used by “{column}”",
    description: "Option of a field another column already imports as; choosing it moves it here",
  },
  missingRequired: {
    id: "tracker-csv.columns.missingRequired",
    defaultMessage: "Choose the columns for {fields}.",
  },
  missingRequiredBody: {
    id: "tracker-csv.columns.missingRequiredBody",
    defaultMessage: "Every application needs a company and a role.",
  },
  keepUnmapped: {
    id: "tracker-csv.columns.keepUnmapped",
    defaultMessage: "Add the other columns to each application's notes",
  },
  statusesIntro: {
    id: "tracker-csv.statuses.intro",
    defaultMessage: "What do your status words mean? Each one becomes one of our statuses.",
  },
  noStatusColumn: {
    id: "tracker-csv.statuses.noColumn",
    defaultMessage: "Your file has no status column. Every row gets this status:",
  },
  yourValue: { id: "tracker-csv.statuses.yourValue", defaultMessage: "In your file" },
  rows: { id: "tracker-csv.statuses.rows", defaultMessage: "{count, plural, one {# row} other {# rows}}" },
  ourStatus: { id: "tracker-csv.statuses.ours", defaultMessage: "Becomes" },
  emptyValue: { id: "tracker-csv.statuses.empty", defaultMessage: "(empty)" },
  chooseStatus: { id: "tracker-csv.statuses.choose", defaultMessage: "Choose a status…" },
  unmappedLeft: {
    id: "tracker-csv.statuses.unmappedLeft",
    defaultMessage:
      "{count, plural, one {# word has} other {# words have}} no status yet. Their rows are left out until you choose one.",
  },
  reviewSummary: {
    id: "tracker-csv.review.summary",
    defaultMessage: "{ready} of {total, plural, one {# row is} other {# rows are}} ready to import.",
  },
  reviewDetails: {
    id: "tracker-csv.review.details",
    defaultMessage:
      "{blocked, plural, =0 {} one {# needs a fix and is left out. } other {# need a fix and are left out. }}{duplicates, plural, =0 {} one {# looks like one you already track, so it starts unticked.} other {# look like ones you already track, so they start unticked.}}",
  },
  onlyNotes: { id: "tracker-csv.review.onlyNotes", defaultMessage: "Show only rows with notes ({count})" },
  row: { id: "tracker-csv.review.row", defaultMessage: "Row" },
  include: { id: "tracker-csv.review.include", defaultMessage: "Import row {row}: {company}, {role}" },
  includeAll: { id: "tracker-csv.review.includeAll", defaultMessage: "Import every ready row" },
  notesColumn: { id: "tracker-csv.review.notes", defaultMessage: "Notes" },
  noValue: { id: "tracker-csv.review.noValue", defaultMessage: "—" },
  back: { id: "tracker-csv.back", defaultMessage: "Back" },
  continue: { id: "tracker-csv.continue", defaultMessage: "Continue" },
  importCount: {
    id: "tracker-csv.import",
    defaultMessage: "Import {count, plural, one {# application} other {# applications}}",
  },
  nothingSelected: { id: "tracker-csv.nothingSelected", defaultMessage: "Tick at least one row to import." },
  imported: {
    id: "tracker-csv.toast.imported",
    defaultMessage: "{count, plural, one {# application} other {# applications}} imported from {fileName}",
  },
  undo: { id: "tracker-csv.toast.undo", defaultMessage: "Undo", description: "Toast action" },
  failed: {
    id: "tracker-csv.toast.failed",
    defaultMessage: "Couldn't save the import. Nothing was added; try again.",
  },
});

const STATUS_CHOICES: readonly ApplicationStatus[] = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES];
const field = "bg-surface-base border-line-control text-callout text-fg-primary h-8 rounded-md border px-2";
const contentClass =
  "bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex max-h-[calc(100vh-48px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg";

type Step = "file" | CsvImportStep;
const STEPS: readonly Step[] = ["file", "columns", "statuses", "preview"];

interface Loaded {
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly table: SpreadsheetTable;
}

/** Mount once (the Tracker route); shows the dialog while `openCsvImport()` asked for it. */
export function CsvImportHost() {
  const { request, generation } = useCsvImportRequest();
  // Leaving the Tracker drops an unfinished import rather than reopening it on return.
  useEffect(() => closeCsvImport, []);
  return (
    <Dialog.Root open={request !== null} onOpenChange={(open) => !open && closeCsvImport()}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        {request && (
          <ImportFlow
            key={generation}
            initialFile={request.file ?? null}
            initialStep={request.step ?? null}
          />
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ReadResult =
  | {
      readonly ok: true;
      readonly loaded: Loaded;
      readonly mapping: ColumnMapping;
      readonly statusMap: StatusMap;
      readonly dateOrder: DateOrder;
    }
  | { readonly ok: false; readonly problem: SpreadsheetReadErrorCode | "unreadable" };

/** Reads a file and makes every guess the steps start from (columns, status words, date order). */
function readAndGuess(
  fileName: string,
  bytes: Uint8Array,
  options: { encoding?: CsvEncoding; delimiter?: CsvDelimiter },
  labels: StatusLabels,
  locale: string,
): ReadResult {
  try {
    const table = readSpreadsheet(bytes, fileName, options);
    const mapping = guessColumnMapping(table);
    return {
      ok: true,
      loaded: { fileName, bytes, table },
      mapping,
      statusMap: guessedStatusMap(statusValues(table, mapping, labels)),
      dateOrder: detectTableDateOrder(table, mapping, defaultDateOrder(locale)),
    };
  } catch (error) {
    return { ok: false, problem: error instanceof SpreadsheetReadError ? error.code : "unreadable" };
  }
}

function ImportFlow({
  initialFile,
  initialStep,
}: {
  initialFile: { name: string; bytes: Uint8Array } | null;
  initialStep: CsvImportStep | null;
}) {
  const intl = useIntl();
  const toast = useToast();
  const repository = useTrackerRepository();
  const live = useTrackerData();
  const stepRef = useRef<HTMLDivElement>(null);
  const labels = useMemo(() => statusLabels(intl), [intl]);

  // A file handed over by the caller (drop on the Tracker, design sample) skips the picker.
  const [initial] = useState(() =>
    initialFile ? readAndGuess(initialFile.name, initialFile.bytes, {}, labels, intl.locale) : null,
  );
  const first = initial?.ok ? initial : null;
  const [step, setStep] = useState<Step>(first ? (initialStep ?? "columns") : "file");
  const [problem, setProblem] = useState<SpreadsheetReadErrorCode | "unreadable" | null>(
    initial && !initial.ok ? initial.problem : null,
  );
  const [loaded, setLoaded] = useState<Loaded | null>(first?.loaded ?? null);
  const [mapping, setMapping] = useState<ColumnMapping>(first?.mapping ?? []);
  const [statusMap, setStatusMap] = useState<StatusMap>(first?.statusMap ?? {});
  const [defaultStatus, setDefaultStatus] = useState<ApplicationStatus>("applied");
  const [dateOrder, setDateOrder] = useState<DateOrder>(first?.dateOrder ?? defaultDateOrder(intl.locale));
  const [keepUnmapped, setKeepUnmapped] = useState(true);
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());
  const [included, setIncluded] = useState<ReadonlySet<number>>(new Set());

  /** Reads the bytes (again, when the user changes encoding or delimiter) and guesses afresh. */
  const load = (
    fileName: string,
    bytes: Uint8Array,
    options: { encoding?: CsvEncoding; delimiter?: CsvDelimiter } = {},
  ): boolean => {
    const result = readAndGuess(fileName, bytes, options, labels, intl.locale);
    if (!result.ok) {
      setProblem(result.problem);
      return false;
    }
    setLoaded(result.loaded);
    setMapping(result.mapping);
    setStatusMap(result.statusMap);
    setDateOrder(result.dateOrder);
    setExcluded(new Set());
    setIncluded(new Set());
    setProblem(null);
    return true;
  };

  const goTo = (next: Step) => {
    setStep(next);
    requestAnimationFrame(() => stepRef.current?.focus());
  };

  const pickFile = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (load(file.name, bytes)) goTo("columns");
    } catch {
      setProblem("unreadable");
    }
  };

  const existing = live.status === "ready" ? live.data.applications : [];
  const plan: ImportPlan | null = useMemo(
    () =>
      loaded
        ? planImport(loaded.table, {
            mapping,
            statusMap,
            defaultStatus,
            dateOrder,
            keepUnmappedInNotes: keepUnmapped,
            now: new Date(),
            existing,
          })
        : null,
    [loaded, mapping, statusMap, defaultStatus, dateOrder, keepUnmapped, existing],
  );

  // Ready rows are ticked unless the user unticked them; duplicates start unticked unless ticked.
  const isIncluded = (row: ImportPlan["rows"][number]) =>
    row.draft !== null && (row.includeByDefault ? !excluded.has(row.rowNumber) : included.has(row.rowNumber));
  const chosen = new Set(plan?.rows.filter(isIncluded).map((row) => row.rowNumber));

  const runImport = () => {
    if (!plan || !loaded || chosen.size === 0) return;
    const items = newApplications(plan, chosen, loaded.fileName, new Date());
    const write = repository.createApplications(items);
    write.done.catch(() => toast.show({ variant: "info", message: intl.formatMessage(messages.failed) }));
    closeCsvImport();
    toast.show({
      message: intl.formatMessage(messages.imported, { count: items.length, fileName: loaded.fileName }),
      glyph: FileUp,
      extended: true,
      action: {
        label: intl.formatMessage(messages.undo),
        run: () => void repository.deleteApplications(write.ids.applicationIds).done.catch(() => undefined),
      },
    });
  };

  useKeyBindings([
    {
      id: "tracker-csv.import",
      keys: "Mod+Enter",
      label: intl.formatMessage(messages.importCount, { count: chosen.size }),
      group: intl.formatMessage(messages.title),
      inOverlays: true,
      enabled: step === "preview" && chosen.size > 0,
      run: runImport,
    },
  ]);

  const missing = REQUIRED_IMPORT_FIELDS.filter((required) => !mapping.includes(required));
  const stepIndex = STEPS.indexOf(step);
  let body: ReactNode;
  let footer: ReactNode = null;
  const back = (to: Step) => (
    <Button variant="secondary" onClick={() => goTo(to)}>
      {intl.formatMessage(messages.back)}
    </Button>
  );

  if (step === "file" || !loaded || !plan) {
    body = <FileStep problem={problem} onFile={(file) => void pickFile(file)} />;
  } else if (step === "columns") {
    body = (
      <ColumnsStep
        loaded={loaded}
        mapping={mapping}
        onMappingChange={(next) => {
          setMapping(next);
          setStatusMap(guessedStatusMap(statusValues(loaded.table, next, labels)));
        }}
        dateOrder={dateOrder}
        onDateOrderChange={setDateOrder}
        keepUnmapped={keepUnmapped}
        onKeepUnmappedChange={setKeepUnmapped}
        onReread={(options) => load(loaded.fileName, loaded.bytes, options)}
        missing={missing}
      />
    );
    footer = (
      <>
        {back("file")}
        <Button
          variant="primary"
          data-autofocus
          disabledReason={
            missing.length > 0
              ? intl.formatMessage(messages.missingRequired, {
                  fields: intl.formatList(missing.map((name) => intl.formatMessage(FIELD_MESSAGES[name]))),
                })
              : null
          }
          onClick={() => goTo("statuses")}
        >
          {intl.formatMessage(messages.continue)}
        </Button>
      </>
    );
  } else if (step === "statuses") {
    body = (
      <StatusesStep
        loaded={loaded}
        mapping={mapping}
        statusMap={statusMap}
        onStatusMapChange={setStatusMap}
        defaultStatus={defaultStatus}
        onDefaultStatusChange={setDefaultStatus}
      />
    );
    footer = (
      <>
        {back("columns")}
        <Button variant="primary" onClick={() => goTo("preview")}>
          {intl.formatMessage(messages.continue)}
        </Button>
      </>
    );
  } else {
    body = (
      <ReviewStep
        plan={plan}
        isIncluded={isIncluded}
        onToggle={(row, value) => {
          const target = plan.rows.find((candidate) => candidate.rowNumber === row);
          if (!target) return;
          if (target.includeByDefault) setExcluded((current) => toggled(current, row, !value));
          else setIncluded((current) => toggled(current, row, value));
        }}
        onToggleAll={(value) => {
          const ready = plan.rows.filter((row) => row.draft !== null).map((row) => row.rowNumber);
          setExcluded(value ? new Set() : new Set(ready));
          setIncluded(value ? new Set(ready) : new Set());
        }}
      />
    );
    footer = (
      <>
        {back("statuses")}
        <Button
          variant="primary"
          shortcut="Mod+Enter"
          disabledReason={chosen.size === 0 ? intl.formatMessage(messages.nothingSelected) : null}
          onClick={runImport}
        >
          {intl.formatMessage(messages.importCount, { count: chosen.size })}
        </Button>
      </>
    );
  }

  const wide = step !== "file";
  return (
    <Dialog.Content
      // Mapping work isn't thrown away by a stray click or a reflex Esc after the file step.
      onInteractOutside={(event) => event.preventDefault()}
      onEscapeKeyDown={(event) => {
        if (step !== "file") event.preventDefault();
      }}
      onOpenAutoFocus={(event) => {
        const target = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
          "[data-autofocus]",
        );
        if (!target) return;
        event.preventDefault();
        target.focus();
      }}
      {...(step !== "file" && { "aria-describedby": undefined })}
      className={cx(
        contentClass,
        wide
          ? "h-[min(760px,calc(100vh-48px))] w-[min(960px,calc(100vw-32px))]"
          : "w-[min(560px,calc(100vw-32px))]",
      )}
      data-testid="csv-import"
    >
      <div className="flex items-start gap-4 px-6 pt-5 pb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Dialog.Title className="font-display text-title3">
            {intl.formatMessage(messages.title)}
          </Dialog.Title>
          <ol
            aria-label={intl.formatMessage(messages.steps)}
            className="flex flex-wrap items-center gap-2 text-footnote"
          >
            {[messages.stepFile, messages.stepColumns, messages.stepStatuses, messages.stepReview].map(
              (label, index) => (
                <li
                  key={label.id}
                  aria-current={index === stepIndex ? "step" : undefined}
                  className={cx(
                    "flex items-center gap-1.5",
                    index === stepIndex
                      ? "text-fg-primary font-semibold"
                      : index < stepIndex
                        ? "text-fg-secondary"
                        : "text-fg-tertiary",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "inline-flex size-5 items-center justify-center rounded-full border text-caption1 tabular-nums",
                      index === stepIndex
                        ? "border-accent-solid bg-accent-solid text-fg-on-accent"
                        : "border-line-control",
                    )}
                  >
                    {index + 1}
                  </span>
                  {intl.formatMessage(label)}
                  {index < 3 && (
                    <span aria-hidden="true" className="text-fg-tertiary ml-0.5">
                      ›
                    </span>
                  )}
                </li>
              ),
            )}
          </ol>
        </div>
        <Dialog.Close asChild>
          <IconButton icon={X} label={intl.formatMessage(messages.close)} />
        </Dialog.Close>
      </div>
      {loaded && step !== "file" && (
        <p className="text-fg-secondary px-6 pb-2 text-footnote">
          {intl.formatMessage(messages.fileLine, {
            fileName: loaded.fileName,
            rows: loaded.table.rows.length,
          })}
        </p>
      )}
      <div ref={stepRef} tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
        {body}
      </div>
      {footer && <div className="border-line-subtle flex justify-end gap-2 border-t px-6 py-3">{footer}</div>}
    </Dialog.Content>
  );
}

function toggled(set: ReadonlySet<number>, value: number, add: boolean): ReadonlySet<number> {
  const next = new Set(set);
  if (add) next.add(value);
  else next.delete(value);
  return next;
}

function FileStep({
  problem,
  onFile,
}: {
  problem: SpreadsheetReadErrorCode | "unreadable" | null;
  onFile: (file: File) => void;
}) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  const formatsId = useId();
  const [dragging, setDragging] = useState(false);
  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");
  const copy = problem ? READ_ERROR_MESSAGES[problem] : null;
  return (
    <div className="flex flex-col gap-4 px-6 pt-1 pb-5">
      <Dialog.Description className="text-fg-secondary text-callout">
        {intl.formatMessage(messages.intro)}
      </Dialog.Description>
      <div
        data-testid="csv-drop"
        onDragEnter={(event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const [file] = event.dataTransfer.files;
          if (file) onFile(file);
        }}
        className={cx(
          "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors duration-(--bfhr-duration-fast)",
          dragging ? "border-accent-solid bg-accent-subtle" : "border-line-control bg-surface-sunken",
        )}
      >
        <Upload aria-hidden="true" className="text-fg-secondary size-7" strokeWidth={1.5} />
        <p className="text-headline">
          {intl.formatMessage(dragging ? messages.dropActive : messages.dropTitle)}
        </p>
        <Button
          variant="primary"
          data-autofocus
          aria-describedby={formatsId}
          onClick={() => inputRef.current?.click()}
        >
          {intl.formatMessage(messages.choose)}
        </Button>
        <p id={formatsId} className="text-fg-secondary text-footnote">
          {intl.formatMessage(messages.formats)}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="csv-file-input"
          className="hidden"
          onChange={(event) => {
            const [file] = event.target.files ?? [];
            event.target.value = "";
            if (file) onFile(file);
          }}
        />
      </div>
      {copy && (
        <InlineAlert tone="warning" title={intl.formatMessage(copy[0])}>
          {intl.formatMessage(copy[1])}
        </InlineAlert>
      )}
      <p className="text-fg-tertiary text-footnote">{intl.formatMessage(messages.privacy)}</p>
    </div>
  );
}

function ColumnsStep({
  loaded,
  mapping,
  onMappingChange,
  dateOrder,
  onDateOrderChange,
  keepUnmapped,
  onKeepUnmappedChange,
  onReread,
  missing,
}: {
  loaded: Loaded;
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  dateOrder: DateOrder;
  onDateOrderChange: (order: DateOrder) => void;
  keepUnmapped: boolean;
  onKeepUnmappedChange: (keep: boolean) => void;
  onReread: (options: { encoding?: CsvEncoding; delimiter?: CsvDelimiter }) => void;
  missing: readonly ImportField[];
}) {
  const intl = useIntl();
  const baseId = useId();
  const { table } = loaded;
  const headerName = (index: number) =>
    table.headers[index] || intl.formatMessage(messages.unnamed, { index: index + 1 });
  const hasDates = mapping.some(
    (name) => name === "appliedAt" || name === "statusChangedAt" || name === "nextActionAt",
  );
  const choose = (column: number, value: ImportField | null) =>
    // A field imports from one column: choosing it here frees the column that had it.
    onMappingChange(
      mapping.map((current, index) => (index === column ? value : current === value ? null : current)),
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-4">
      <p className="text-fg-secondary text-callout">{intl.formatMessage(messages.columnsIntro)}</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-footnote">
        <LabeledSelect
          id={`${baseId}-encoding`}
          label={intl.formatMessage(messages.readAs)}
          value={table.encoding}
          options={CSV_ENCODINGS.map((value) => ({
            value,
            label: intl.formatMessage(ENCODING_MESSAGES[value]),
          }))}
          onChange={(encoding) => onReread({ encoding, delimiter: table.delimiter })}
        />
        <LabeledSelect
          id={`${baseId}-delimiter`}
          label={intl.formatMessage(messages.separatedBy)}
          value={table.delimiter}
          options={CSV_DELIMITERS.map((value) => ({
            value,
            label: intl.formatMessage(DELIMITER_MESSAGES[value]),
          }))}
          onChange={(delimiter) => onReread({ encoding: table.encoding, delimiter })}
        />
        {hasDates && (
          <LabeledSelect
            id={`${baseId}-dates`}
            label={intl.formatMessage(messages.dateOrder)}
            value={dateOrder}
            options={(["dmy", "mdy"] as const).map((value) => ({
              value,
              label: intl.formatMessage(DATE_ORDER_MESSAGES[value]),
            }))}
            onChange={onDateOrderChange}
          />
        )}
      </div>
      {missing.length > 0 && (
        <InlineAlert
          tone="warning"
          title={intl.formatMessage(messages.missingRequired, {
            fields: intl.formatList(missing.map((name) => intl.formatMessage(FIELD_MESSAGES[name]))),
          })}
        >
          {intl.formatMessage(messages.missingRequiredBody)}
        </InlineAlert>
      )}
      <div className="border-line-subtle min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full table-fixed border-separate border-spacing-0 text-callout">
          <thead className="bg-surface-elevated sticky top-0">
            <tr>
              <th scope="col" className={cx(headCell, "w-[30%]")}>
                {intl.formatMessage(messages.yourColumn)}
              </th>
              <th scope="col" className={headCell}>
                {intl.formatMessage(messages.samples)}
              </th>
              <th scope="col" className={cx(headCell, "w-64")}>
                {intl.formatMessage(messages.importsAs)}
              </th>
            </tr>
          </thead>
          <tbody>
            {table.headers.map((_, column) => {
              const samples = table.rows
                .map((row) => row.cells[column] ?? "")
                .filter((value) => value !== "")
                .slice(0, 3);
              const selectId = `${baseId}-col-${column}`;
              return (
                <tr key={column}>
                  <th scope="row" className={cx(bodyCell, "text-start font-medium")}>
                    <label htmlFor={selectId} className="block truncate" title={headerName(column)}>
                      {headerName(column)}
                    </label>
                  </th>
                  <td className={cx(bodyCell, "text-fg-secondary")} title={samples.join(" · ")}>
                    <span className="block truncate">{samples.join(" · ")}</span>
                  </td>
                  <td className={bodyCell}>
                    <select
                      id={selectId}
                      value={mapping[column] ?? ""}
                      onChange={(event) =>
                        choose(column, IMPORT_FIELDS.find((name) => name === event.target.value) ?? null)
                      }
                      className={cx(field, "w-full", mapping[column] === null && "text-fg-secondary")}
                    >
                      <option value="">{intl.formatMessage(messages.dontImport)}</option>
                      {IMPORT_FIELDS.map((name) => {
                        const owner = mapping.indexOf(name);
                        const label = intl.formatMessage(FIELD_MESSAGES[name]);
                        const required = (REQUIRED_IMPORT_FIELDS as readonly ImportField[]).includes(name);
                        return (
                          <option key={name} value={name}>
                            {owner >= 0 && owner !== column
                              ? intl.formatMessage(messages.usedBy, {
                                  field: label,
                                  column: headerName(owner),
                                })
                              : required
                                ? `${label} ${intl.formatMessage(messages.required)}`
                                : label}
                          </option>
                        );
                      })}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <label className="flex items-center gap-2 text-callout">
        <input
          type="checkbox"
          checked={keepUnmapped}
          onChange={(event) => onKeepUnmappedChange(event.target.checked)}
          className="accent-accent-solid size-4"
        />
        {intl.formatMessage(messages.keepUnmapped)}
      </label>
    </div>
  );
}

const headCell =
  "border-line-subtle text-fg-secondary h-9 border-b px-3 text-start align-middle text-footnote font-medium";
const bodyCell = "border-line-subtle h-11 border-b px-3 align-middle";

function LabeledSelect<Value extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <label htmlFor={id} className="text-fg-secondary">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const next = options.find((option) => option.value === event.target.value);
          if (next) onChange(next.value);
        }}
        className={field}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}

function StatusesStep({
  loaded,
  mapping,
  statusMap,
  onStatusMapChange,
  defaultStatus,
  onDefaultStatusChange,
}: {
  loaded: Loaded;
  mapping: ColumnMapping;
  statusMap: StatusMap;
  onStatusMapChange: (map: StatusMap) => void;
  defaultStatus: ApplicationStatus;
  onDefaultStatusChange: (status: ApplicationStatus) => void;
}) {
  const intl = useIntl();
  const baseId = useId();
  const values = useMemo(() => statusValues(loaded.table, mapping), [loaded.table, mapping]);
  const statusOptions = STATUS_CHOICES.map((value) => ({
    value,
    label: intl.formatMessage(STATUS_MESSAGES[value]),
  }));

  if (!mapping.includes("status")) {
    return (
      <div className="flex flex-col gap-3 px-6 pb-4">
        <p className="text-fg-secondary text-callout">{intl.formatMessage(messages.statusesIntro)}</p>
        <LabeledSelect
          id={`${baseId}-default`}
          label={intl.formatMessage(messages.noStatusColumn)}
          value={defaultStatus}
          options={statusOptions}
          onChange={onDefaultStatusChange}
        />
      </div>
    );
  }

  const unmapped = values.filter(({ key }) => statusMap[key] === undefined).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-4">
      <p className="text-fg-secondary text-callout">{intl.formatMessage(messages.statusesIntro)}</p>
      {unmapped > 0 && (
        <InlineAlert tone="warning" title={intl.formatMessage(messages.unmappedLeft, { count: unmapped })} />
      )}
      <div className="border-line-subtle min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full table-fixed border-separate border-spacing-0 text-callout">
          <thead className="bg-surface-elevated sticky top-0">
            <tr>
              <th scope="col" className={headCell}>
                {intl.formatMessage(messages.yourValue)}
              </th>
              <th scope="col" className={cx(headCell, "w-28")}>
                <span className="sr-only">{intl.formatMessage(messages.rows, { count: 0 })}</span>
              </th>
              <th scope="col" className={cx(headCell, "w-64")}>
                {intl.formatMessage(messages.ourStatus)}
              </th>
              <th scope="col" className={cx(headCell, "w-44")}>
                <span className="sr-only">{intl.formatMessage(messages.ourStatus)}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {values.map(({ key, value, count }) => {
              const selectId = `${baseId}-${key || "empty"}`;
              const current = statusMap[key];
              return (
                <tr key={key} className={current === undefined ? "bg-warning-subtle/50" : undefined}>
                  <th scope="row" className={cx(bodyCell, "text-start font-medium")}>
                    <label htmlFor={selectId} className="block truncate">
                      {key === "" ? intl.formatMessage(messages.emptyValue) : value}
                    </label>
                  </th>
                  <td className={cx(bodyCell, "text-fg-secondary tabular-nums")}>
                    {intl.formatMessage(messages.rows, { count })}
                  </td>
                  <td className={bodyCell}>
                    <select
                      id={selectId}
                      value={current ?? ""}
                      onChange={(event) => {
                        const status = STATUS_CHOICES.find((choice) => choice === event.target.value);
                        if (status) onStatusMapChange({ ...statusMap, [key]: status });
                      }}
                      className={cx(field, "w-full")}
                    >
                      {current === undefined && (
                        <option value="">{intl.formatMessage(messages.chooseStatus)}</option>
                      )}
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={bodyCell} aria-hidden="true">
                    {current && <StatusPill size="sm" status={statusVM(current, intl)} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const REVIEW_ROW_HEIGHT = 44;

function ReviewStep({
  plan,
  isIncluded,
  onToggle,
  onToggleAll,
}: {
  plan: ImportPlan;
  isIncluded: (row: ImportPlan["rows"][number]) => boolean;
  onToggle: (rowNumber: number, include: boolean) => void;
  onToggleAll: (include: boolean) => void;
}) {
  const intl = useIntl();
  const [onlyNotes, setOnlyNotes] = useState(false);
  const withNotes = plan.rows.filter((row) => row.issues.length > 0);
  const rows = onlyNotes ? withNotes : plan.rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => REVIEW_ROW_HEIGHT,
    overscan: 8,
  });
  const items = virtualizer.getVirtualItems();
  const before = items[0]?.start ?? 0;
  const after = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);
  const ready = plan.rows.filter((row) => row.draft !== null);
  const allTicked = ready.length > 0 && ready.every(isIncluded);
  const dateFormat = new Intl.DateTimeFormat(intl.locale, { dateStyle: "medium", timeZone: "UTC" });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-4">
      <div aria-live="polite">
        <p className="text-headline">
          {intl.formatMessage(messages.reviewSummary, { ready: plan.ready, total: plan.rows.length })}
        </p>
        {(plan.blocked > 0 || plan.duplicates > 0) && (
          <p className="text-fg-secondary text-callout">
            {intl.formatMessage(messages.reviewDetails, {
              blocked: plan.blocked,
              duplicates: plan.duplicates,
            })}
          </p>
        )}
      </div>
      {withNotes.length > 0 && (
        <label className="flex items-center gap-2 text-callout">
          <input
            type="checkbox"
            checked={onlyNotes}
            onChange={(event) => setOnlyNotes(event.target.checked)}
            className="accent-accent-solid size-4"
          />
          {intl.formatMessage(messages.onlyNotes, { count: withNotes.length })}
        </label>
      )}
      <div ref={scrollRef} className="border-line-subtle min-h-0 flex-1 overflow-auto rounded-md border">
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-callout"
          aria-rowcount={rows.length + 1}
        >
          <thead className="bg-surface-elevated sticky top-0 z-[1]">
            <tr aria-rowindex={1}>
              <th scope="col" className={cx(headCell, "w-11")}>
                <input
                  type="checkbox"
                  aria-label={intl.formatMessage(messages.includeAll)}
                  checked={allTicked}
                  onChange={(event) => onToggleAll(event.target.checked)}
                  className="accent-accent-solid size-4"
                />
              </th>
              <th scope="col" className={cx(headCell, "w-16")}>
                {intl.formatMessage(messages.row)}
              </th>
              <th scope="col" className={headCell}>
                {intl.formatMessage(FIELD_MESSAGES.company)}
              </th>
              <th scope="col" className={headCell}>
                {intl.formatMessage(FIELD_MESSAGES.role)}
              </th>
              <th scope="col" className={cx(headCell, "w-40")}>
                {intl.formatMessage(FIELD_MESSAGES.status)}
              </th>
              <th scope="col" className={cx(headCell, "w-32")}>
                {intl.formatMessage(FIELD_MESSAGES.appliedAt)}
              </th>
              <th scope="col" className={cx(headCell, "w-[28%]")}>
                {intl.formatMessage(messages.notesColumn)}
              </th>
            </tr>
          </thead>
          <tbody>
            {before > 0 && <tr aria-hidden="true" style={{ height: before }} />}
            {items.map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              const blocked = row.draft === null;
              const notes = row.issues.map((issue) => issueText(issue, intl));
              const none = <span className="text-fg-tertiary">{intl.formatMessage(messages.noValue)}</span>;
              return (
                <tr
                  key={row.rowNumber}
                  aria-rowindex={item.index + 2}
                  data-row-number={row.rowNumber}
                  style={{ height: REVIEW_ROW_HEIGHT }}
                  className={blocked ? "text-fg-secondary" : undefined}
                >
                  <td className={bodyCell}>
                    <input
                      type="checkbox"
                      aria-label={intl.formatMessage(messages.include, {
                        row: row.rowNumber,
                        company: row.company || intl.formatMessage(messages.noValue),
                        role: row.role || intl.formatMessage(messages.noValue),
                      })}
                      aria-describedby={notes.length > 0 ? `csv-row-notes-${row.rowNumber}` : undefined}
                      checked={isIncluded(row)}
                      disabled={blocked}
                      onChange={(event) => onToggle(row.rowNumber, event.target.checked)}
                      className="accent-accent-solid size-4"
                    />
                  </td>
                  <td className={cx(bodyCell, "text-fg-secondary tabular-nums")}>{row.rowNumber}</td>
                  <td className={cx(bodyCell, "truncate")} title={row.company}>
                    {row.draft?.company ?? (row.company || none)}
                  </td>
                  <td className={cx(bodyCell, "truncate")} title={row.role}>
                    {row.draft?.role ?? (row.role || none)}
                  </td>
                  <td className={bodyCell}>
                    {row.draft ? (
                      <StatusPill size="sm" status={statusVM(row.draft.status, intl)} />
                    ) : (
                      <span className="truncate">{row.statusValue || none}</span>
                    )}
                  </td>
                  <td className={cx(bodyCell, "tabular-nums")}>
                    {row.draft?.appliedAt ? dateFormat.format(row.draft.appliedAt) : none}
                  </td>
                  <td
                    id={`csv-row-notes-${row.rowNumber}`}
                    className={cx(
                      bodyCell,
                      "truncate text-footnote",
                      blocked ? "text-warning-text font-medium" : "text-fg-secondary",
                    )}
                    title={notes.join("\n")}
                  >
                    {notes.join(" · ")}
                  </td>
                </tr>
              );
            })}
            {after > 0 && <tr aria-hidden="true" style={{ height: after }} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}
