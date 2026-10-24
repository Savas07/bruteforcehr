/**
 * Manage saved searches (`/jobs?searches=manage`; job-feed-search.md "Decision — Desktop" 1, 3):
 * the list on the left (name, criteria, alert, last check, alerts switch), the selected search's
 * editor on the right (name, query, alert settings, read-only filters with "Edit filters in
 * Jobs"), Run now with its result line, Delete with Undo. Edits are written at once and work
 * offline; Run now needs a connection. Toasts sit outside the modal, so Undo for a delete is also
 * offered inline while the dialog is open.
 */
import type { JobsSearchResponse, SavedSearch } from "@bfhr/core";
import { BellRing, CircleCheck, CloudOff, Play, Trash2, X } from "lucide-react";
import { Dialog, Switch } from "radix-ui";
import { type KeyboardEvent, useId, useMemo, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import type { SavedSearchPatch } from "../../data/jobs/writes";
import { useJobsData } from "../../data/jobs/live";
import { useJobsRepository } from "../../data/jobs/repository";
import { useTrackerModel } from "../../data/tracker/model";
import { useConnectivity } from "../../shared/connectivity";
import { cx } from "../../shared/cx";
import { Button, IconButton } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { NeedsConnection } from "../../shared/ui/NeedsConnection";
import { PaneError } from "../../shared/ui/PaneError";
import { ProgressNote } from "../../shared/ui/ProgressNote";
import { SkeletonBlock, SkeletonRegion, SkeletonText } from "../../shared/ui/Skeleton";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import { useToast } from "../../shared/ui/Toast";
import { AlertFields } from "./AlertFields";
import { buildSavedSearchesModel, runErrorText, runResultText, type SavedSearchRowVM, type SourceLabels } from "./model";

const messages = defineMessages({
  title: { id: "saved-searches.dialog.title", defaultMessage: "Saved searches", description: "Dialog title" },
  description: {
    id: "saved-searches.dialog.description",
    defaultMessage: "We check these searches on the schedule you pick and show new matches under Jobs.",
  },
  close: { id: "saved-searches.dialog.close", defaultMessage: "Close" },
  list: { id: "saved-searches.dialog.list", defaultMessage: "Your saved searches", description: "Accessible name of the list" },
  alertsFor: {
    id: "saved-searches.dialog.alertsFor",
    defaultMessage: "Alerts for “{name}”",
    description: "Accessible name of a row's alerts switch",
  },
  emptyTitle: { id: "saved-searches.empty.title", defaultMessage: "No saved searches yet" },
  emptyBody: {
    id: "saved-searches.empty.body",
    defaultMessage: "Save a search from Jobs to get new matches here.",
  },
  emptyAction: { id: "saved-searches.empty.action", defaultMessage: "Back to Jobs" },
  loading: { id: "saved-searches.dialog.loading", defaultMessage: "Loading saved searches" },
  errorTitle: { id: "saved-searches.dialog.errorTitle", defaultMessage: "We couldn't load your saved searches" },
  errorBody: {
    id: "saved-searches.dialog.errorBody",
    defaultMessage: "Our server didn't respond. Your searches are safe. Try again in a moment.",
  },
  name: { id: "saved-searches.editor.name", defaultMessage: "Name", description: "Field label" },
  nameMissing: { id: "saved-searches.editor.nameMissing", defaultMessage: "Give this search a name." },
  query: { id: "saved-searches.editor.query", defaultMessage: "Search for", description: "Field label: the search text" },
  queryHint: {
    id: "saved-searches.editor.queryHint",
    defaultMessage: "Job titles or skills. Use OR for alternatives: “frontend OR product engineer”.",
  },
  queryMissing: { id: "saved-searches.editor.queryMissing", defaultMessage: "Enter what to search for." },
  filters: { id: "saved-searches.editor.filters", defaultMessage: "Filters", description: "Section heading" },
  editFilters: {
    id: "saved-searches.editor.editFilters",
    defaultMessage: "Edit filters in Jobs",
    description: "Opens the search in Jobs, where its filters can be changed and saved again",
  },
  alerts: { id: "saved-searches.editor.alerts", defaultMessage: "Alerts", description: "Section heading" },
  runNow: { id: "saved-searches.editor.runNow", defaultMessage: "Run now" },
  running: { id: "saved-searches.editor.running", defaultMessage: "Searching job sources…" },
  runDone: { id: "saved-searches.editor.runDone", defaultMessage: "Checked just now", description: "Before the Run now result line" },
  showResults: { id: "saved-searches.editor.showResults", defaultMessage: "Show results" },
  delete: { id: "saved-searches.editor.delete", defaultMessage: "Delete" },
  tryAgain: { id: "saved-searches.editor.tryAgain", defaultMessage: "Try again" },
  runNowOffline: {
    id: "saved-searches.editor.runNowOffline",
    defaultMessage: "Run now needs a connection. Changes you make here are saved on this device and sync when you're back online.",
  },
  deleted: { id: "saved-searches.dialog.deleted", defaultMessage: "Deleted “{name}”", description: "Inline and toast notice after deleting a saved search" },
  undo: { id: "saved-searches.dialog.undo", defaultMessage: "Undo" },
  noFilters: {
    id: "saved-searches.editor.noFilters",
    defaultMessage: "No filters. Every job that matches the search text counts.",
  },
});

type RunState =
  | { readonly status: "running"; readonly startedAt: Date }
  | { readonly status: "done"; readonly text: string }
  | { readonly status: "error"; readonly text: string };

const controlClass =
  "bg-surface-base border-line-control text-callout text-fg-primary placeholder:text-fg-tertiary aria-invalid:border-danger-solid h-8 w-full min-w-0 rounded-md border px-2";

export function SavedSearchesDialog({
  open,
  onOpenChange,
  focusSavedSearchId = null,
  onShowResults,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly focusSavedSearchId?: string | null;
  readonly onShowResults: (savedSearchId: string) => void;
}) {
  const intl = useIntl();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content
          // Start on the selected search (↑ / ↓ move through the list), not on Close.
          onOpenAutoFocus={(event) => {
            const content = event.currentTarget;
            const row = content instanceof HTMLElement ? content.querySelector<HTMLElement>('[aria-current="true"]') : null;
            if (!row) return;
            event.preventDefault();
            row.focus();
          }}
          className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex h-[min(640px,calc(100vh-48px))] w-[min(920px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg outline-none"
        >
          <div className="border-line-subtle flex items-start gap-3 border-b px-5 pt-5 pb-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-title3">{intl.formatMessage(messages.title)}</Dialog.Title>
              <Dialog.Description className="text-fg-secondary mt-1 text-callout">
                {intl.formatMessage(messages.description)}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton icon={X} label={intl.formatMessage(messages.close)} />
            </Dialog.Close>
          </div>
          {open && (
            <Manager
              focusSavedSearchId={focusSavedSearchId}
              onShowResults={(savedSearchId) => {
                onOpenChange(false);
                onShowResults(savedSearchId);
              }}
              onClose={() => onOpenChange(false)}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const NO_PARAMS = {};

function Manager({
  focusSavedSearchId,
  onShowResults,
  onClose,
}: {
  readonly focusSavedSearchId: string | null;
  readonly onShowResults: (savedSearchId: string) => void;
  readonly onClose: () => void;
}) {
  const intl = useIntl();
  const model = useTrackerModel(buildSavedSearchesModel, NO_PARAMS);
  const jobs = useJobsData();
  const repository = useJobsRepository();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(focusSavedSearchId);
  const [runs, setRuns] = useState<Readonly<Record<string, RunState>>>({});
  const [deleted, setDeleted] = useState<SavedSearch | null>(null);
  const listId = useId();

  const sourceLabels: SourceLabels = useMemo(
    () => new Map(jobs.status === "ready" ? jobs.data.jobSources.map((source) => [source.id, source.label]) : []),
    [jobs],
  );

  const rows = model.status === "ready" ? model.data.rows : [];
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;

  if (model.status === "error") {
    return (
      <div className="min-h-0 flex-1">
        <PaneError
          title={intl.formatMessage(messages.errorTitle)}
          body={intl.formatMessage(messages.errorBody)}
          onRetry={model.retry}
        />
      </div>
    );
  }

  const run = (row: SavedSearchRowVM) => {
    setRuns((current) => ({ ...current, [row.id]: { status: "running", startedAt: new Date() } }));
    repository.runSavedSearch(row.id).then(
      (response: JobsSearchResponse) =>
        setRuns((current) => ({ ...current, [row.id]: { status: "done", text: runResultText(response, sourceLabels, intl) } })),
      (error: unknown) =>
        setRuns((current) => ({ ...current, [row.id]: { status: "error", text: runErrorText(error, intl) } })),
    );
  };

  const remove = (row: SavedSearchRowVM) => {
    const index = rows.findIndex((candidate) => candidate.id === row.id);
    setSelectedId(rows[index + 1]?.id ?? rows[index - 1]?.id ?? null);
    setDeleted(row.savedSearch);
    void repository.deleteSavedSearch(row.id).done;
    const undo = () => {
      setDeleted(null);
      setSelectedId(row.id);
      void repository.restoreSavedSearch(row.savedSearch).done;
    };
    toast.show({
      message: intl.formatMessage(messages.deleted, { name: row.name }),
      action: { label: intl.formatMessage(messages.undo), run: undo },
    });
  };

  const undoDelete = () => {
    if (!deleted) return;
    setSelectedId(deleted.id);
    void repository.restoreSavedSearch(deleted).done;
    setDeleted(null);
  };

  // Up / Down move through the list (focus follows selection), Home / End jump.
  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!selected) return;
    const index = rows.findIndex((row) => row.id === selected.id);
    const target =
      event.key === "ArrowDown"
        ? rows[Math.min(rows.length - 1, index + 1)]
        : event.key === "ArrowUp"
          ? rows[Math.max(0, index - 1)]
          : event.key === "Home"
            ? rows[0]
            : event.key === "End"
              ? rows.at(-1)
              : undefined;
    if (!target) return;
    event.preventDefault();
    setSelectedId(target.id);
    document.getElementById(`${listId}-${target.id}`)?.focus();
  };

  return (
    <SkeletonRegion
      loading={model.status === "loading"}
      label={intl.formatMessage(messages.loading)}
      className="flex min-h-0 flex-1 flex-col"
      skeleton={<ManagerSkeleton />}
    >
      {model.status === "ready" && rows.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <DeletedNotice deleted={deleted} onUndo={undoDelete} />
          <EmptyState
            kind="firstUse"
            glyph={BellRing}
            title={intl.formatMessage(messages.emptyTitle)}
            body={intl.formatMessage(messages.emptyBody)}
            primary={{ label: intl.formatMessage(messages.emptyAction), onClick: onClose }}
            className="flex-1"
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,320px)_1fr]">
          <div className="border-line-subtle flex min-h-0 flex-col border-r">
            <DeletedNotice deleted={deleted} onUndo={undoDelete} />
            <ul
              aria-label={intl.formatMessage(messages.list)}
              className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2"
              onKeyDown={onListKeyDown}
            >
              {rows.map((row) => (
                <ListRow
                  key={row.id}
                  row={row}
                  buttonId={`${listId}-${row.id}`}
                  selected={row.id === selected?.id}
                  onSelect={() => setSelectedId(row.id)}
                  onEnabledChange={(enabled) => void repository.updateSavedSearch(row.savedSearch, { enabled }).done}
                />
              ))}
            </ul>
          </div>
          {selected && (
            <Editor
              key={selected.id}
              row={selected}
              run={runs[selected.id] ?? null}
              onRun={() => run(selected)}
              onDelete={() => remove(selected)}
              onShowResults={() => onShowResults(selected.id)}
            />
          )}
        </div>
      )}
    </SkeletonRegion>
  );
}

function ManagerSkeleton() {
  return (
    <div aria-hidden="true" className="grid min-h-0 flex-1 grid-cols-[minmax(260px,320px)_1fr]">
      <div className="border-line-subtle flex flex-col gap-4 border-r p-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonText lines={2} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4 p-5">
        <SkeletonBlock className="h-8 w-full" />
        <SkeletonBlock className="h-8 w-full" />
        <SkeletonText lines={4} />
      </div>
    </div>
  );
}

function DeletedNotice({ deleted, onUndo }: { readonly deleted: SavedSearch | null; readonly onUndo: () => void }) {
  const intl = useIntl();
  if (!deleted) return null;
  return (
    <div role="status" className="bg-surface-sunken border-line-subtle flex items-center gap-2 border-b px-3 py-2">
      <p className="text-footnote text-fg-secondary min-w-0 flex-1 truncate">
        {intl.formatMessage(messages.deleted, { name: deleted.name })}
      </p>
      <Button size="sm" variant="plain" onClick={onUndo}>
        {intl.formatMessage(messages.undo)}
      </Button>
    </div>
  );
}

function ListRow({
  row,
  buttonId,
  selected,
  onSelect,
  onEnabledChange,
}: {
  readonly row: SavedSearchRowVM;
  readonly buttonId: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onEnabledChange: (enabled: boolean) => void;
}) {
  const intl = useIntl();
  return (
    <li
      className={cx(
        "flex items-start gap-2 rounded-md pr-2",
        selected ? "bg-surface-selected" : "hover:bg-surface-hover",
      )}
    >
      <button
        id={buttonId}
        type="button"
        aria-current={selected || undefined}
        tabIndex={selected ? 0 : -1}
        onClick={onSelect}
        onFocus={onSelect}
        className="flex min-w-0 flex-1 cursor-default flex-col gap-0.5 rounded-md px-2 py-2 text-left"
      >
        <span className="text-callout text-fg-primary flex items-center gap-1.5 font-medium">
          <span className="truncate">{row.name}</span>
          {row.pendingSync && <SyncGlyph />}
        </span>
        <span className="text-footnote text-fg-secondary line-clamp-2">{row.summary}</span>
        <span className="text-footnote text-fg-tertiary">
          {row.enabled ? `${row.cadenceText} · ${row.thresholdText}` : row.cadenceText}
        </span>
        <span className="text-footnote text-fg-tertiary" title={row.lastRun?.absolute}>
          {row.lastRunText}
        </span>
      </button>
      <Switch.Root
        aria-label={intl.formatMessage(messages.alertsFor, { name: row.name })}
        checked={row.enabled}
        onCheckedChange={onEnabledChange}
        className="data-[state=checked]:bg-accent-solid bg-line-control relative mt-2.5 inline-flex h-5 w-9 shrink-0 cursor-default items-center rounded-full transition-colors duration-(--bfhr-duration-fast)"
      >
        <Switch.Thumb className="bg-surface-base shadow-raised block size-4 translate-x-0.5 rounded-full transition-transform duration-(--bfhr-duration-fast) data-[state=checked]:translate-x-[18px]" />
      </Switch.Root>
    </li>
  );
}

function TextField({
  label,
  initial,
  hint,
  missing,
  maxLength,
  onCommit,
}: {
  readonly label: string;
  readonly initial: string;
  readonly hint?: string;
  /** Shown when the field is left empty; the stored value is kept. */
  readonly missing: string;
  readonly maxLength: number;
  readonly onCommit: (value: string) => void;
}) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(false);
  // Another device (or the Save search popover) changed it: show the stored value.
  const [shownInitial, setShownInitial] = useState(initial);
  if (shownInitial !== initial) {
    setShownInitial(initial);
    setValue(initial);
  }
  const commit = () => {
    const trimmed = value.trim();
    setError(!trimmed);
    if (trimmed && trimmed !== initial) onCommit(trimmed);
  };
  const describedBy = error || hint ? `${id}-message` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-footnote text-fg-secondary font-medium">
        {label}
      </label>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className={controlClass}
      />
      {(error || hint) && (
        <p id={`${id}-message`} className={cx("text-footnote", error ? "text-danger-text" : "text-fg-tertiary")}>
          {error ? missing : hint}
        </p>
      )}
    </div>
  );
}

function Editor({
  row,
  run,
  onRun,
  onDelete,
  onShowResults,
}: {
  readonly row: SavedSearchRowVM;
  readonly run: RunState | null;
  readonly onRun: () => void;
  readonly onDelete: () => void;
  readonly onShowResults: () => void;
}) {
  const intl = useIntl();
  const repository = useJobsRepository();
  const { status } = useConnectivity();
  const headingId = useId();
  const filters = row.criteria.filter((criterion) => criterion.key !== "query");
  const update = (patch: SavedSearchPatch) => void repository.updateSavedSearch(row.savedSearch, patch).done;

  return (
    <section aria-labelledby={headingId} className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h3 id={headingId} className="sr-only">
          {row.name}
        </h3>
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            <TextField
              label={intl.formatMessage(messages.name)}
              initial={row.name}
              missing={intl.formatMessage(messages.nameMissing)}
              maxLength={120}
              onCommit={(name) => update({ name })}
            />
            <TextField
              label={intl.formatMessage(messages.query)}
              initial={row.query}
              hint={intl.formatMessage(messages.queryHint)}
              missing={intl.formatMessage(messages.queryMissing)}
              maxLength={500}
              onCommit={(query) => update({ query })}
            />
          </div>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-headline">{intl.formatMessage(messages.filters)}</h4>
              <Button size="sm" variant="plain" onClick={onShowResults}>
                {intl.formatMessage(messages.editFilters)}
              </Button>
            </div>
            {filters.length === 0 ? (
              <p className="text-footnote text-fg-secondary">{intl.formatMessage(messages.noFilters)}</p>
            ) : (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
                {filters.map((criterion) => (
                  <div key={criterion.key} className="contents">
                    <dt className="text-footnote text-fg-secondary">{criterion.label}</dt>
                    <dd className="text-callout text-fg-primary">{criterion.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="text-headline">{intl.formatMessage(messages.alerts)}</h4>
            <p className="text-footnote text-fg-secondary">
              <span title={row.lastRun?.absolute}>{row.lastRunText}</span>
              {" · "}
              <span title={row.nextRun?.absolute}>{row.nextRunText}</span>
            </p>
            <AlertFields search={row.savedSearch} onChange={update} />
          </section>
        </div>
      </div>
      <div className="border-line-subtle flex flex-wrap items-center gap-2 border-t px-5 py-3">
        {/* The result sits right above Run now, so it is seen without scrolling the editor. */}
        {run?.status === "running" && (
          <ProgressNote className="basis-full" label={intl.formatMessage(messages.running)} startedAt={run.startedAt} />
        )}
        {run?.status === "done" && (
          <div role="status" className="text-callout text-fg-primary flex basis-full items-start gap-2">
            <CircleCheck aria-hidden="true" className="text-accent-text mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            <p>
              <span className="font-medium">{intl.formatMessage(messages.runDone)}</span>
              {" · "}
              {run.text}
            </p>
          </div>
        )}
        {run?.status === "error" && (
          <InlineAlert
            tone="error"
            fromAction
            className="basis-full"
            title={run.text}
            action={{ label: intl.formatMessage(messages.tryAgain), onClick: onRun }}
          />
        )}
        {status === "offline" && (
          <p className="text-fg-secondary text-footnote flex basis-full items-center gap-1.5">
            <CloudOff aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
            {intl.formatMessage(messages.runNowOffline)}
          </p>
        )}
        <Button variant="destructive" icon={Trash2} onClick={onDelete}>
          {intl.formatMessage(messages.delete)}
        </Button>
        <div className="ml-auto flex gap-2">
          <Button onClick={onShowResults}>{intl.formatMessage(messages.showResults)}</Button>
          <NeedsConnection>
            {(reason) => (
              <Button
                variant="primary"
                icon={Play}
                loading={run?.status === "running"}
                loadingLabel={intl.formatMessage(messages.running)}
                disabledReason={reason}
                onClick={onRun}
              >
                {intl.formatMessage(messages.runNow)}
              </Button>
            )}
          </NeedsConnection>
        </div>
      </div>
    </section>
  );
}
