/**
 * The Jobs list pane (job-feed-search.md "Decision — Desktop" 4–5, 7): "37 jobs · Sorted by Best
 * match ▾" (the sort menu explains the ranking), rows in Glassdoor anatomy (title, company · place,
 * salary with provenance, band pill, age, saved / status, "3 sources"), and row actions on hover
 * and focus (Save, Not for me, Open original). A hidden row leaves an anchor for the optional
 * reason popover. `EmptyResults` is the zero-results pane with one removable chip per filter.
 *
 * The rows are virtualized (thousands of jobs scroll at 60 fps, docs/runbooks/performance.md):
 * only those in and near the viewport are in the DOM, plus the selected row and the hidden row's
 * anchor, so keyboard focus and the reason popover always have their element. Each row states its
 * position in the whole list (`aria-posinset` / `aria-setsize`).
 */
import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpRight, Bookmark, BookmarkCheck, ChevronDown, EyeOff, Layers, Search, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { memo, useId, useRef, type RefObject } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Button, IconButton } from "../../shared/ui/Button";
import { Monogram } from "../../shared/ui/Company";
import type { ListNavigation } from "../../shared/ui/focus";
import { Hint } from "../../shared/ui/Hint";
import { MatchBandPill } from "../../shared/ui/MatchBand";
import { MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator } from "../../shared/ui/Menu";
import { RelativeTimeChip } from "../../shared/ui/RelativeTimeChip";
import { StatusPill } from "../../shared/ui/StatusPill";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import { DismissReasonPopover } from "./DismissReasons";
import type { FilterFacet, RemovableChipVM } from "./filterBarModel";
import { JOB_SORTS, type JobSort } from "./filters";
import type { DismissReasonVM, JobDetailCopyVM, JobDetailModel, JobListRowVM, JobsEmptyVM } from "./model";

const messages = defineMessages({
  sortedBy: { id: "job-detail.view.sortedBy", defaultMessage: "Sorted by {sort}" },
  scoring: { id: "job-detail.view.scoring", defaultMessage: "Scoring…" },
  unsave: { id: "job-detail.view.unsave", defaultMessage: "Remove from Saved" },
  activeFilters: { id: "job-detail.view.activeFilters", defaultMessage: "Active filters" },
});

/** The row just hidden with Not for me: where the reason popover anchors. */
export interface HiddenPlaceholder {
  readonly jobId: string;
  /** Index in the visible rows the hidden row had. */
  readonly index: number;
}

/** A row's height before it is measured (two-line title, company, salary, pills). */
const ROW_ESTIMATE = 104;
/** `gap-0.5` between rows. */
const ROW_GAP = 2;

/**
 * One job. Memoized with stable props (the handlers take the row), so scrolling renders only the
 * rows that come into view.
 */
const Row = memo(function Row({
  row,
  saved,
  selected,
  copy,
  nav,
  index,
  position,
  setSize,
  start,
  measure,
  onSelect,
  onToggleSave,
  onNotForMe,
  onOpenOriginal,
}: {
  row: JobListRowVM;
  saved: boolean;
  selected: boolean;
  copy: JobDetailCopyVM;
  nav: ListNavigation;
  /** The virtualizer's index (the hidden row's anchor counts). */
  index: number;
  /** 1-based position among the rows, and their count. */
  position: number;
  setSize: number;
  /** Offset from the top of the list (px). */
  start: number;
  measure: (element: HTMLElement | null) => void;
  onSelect: (jobId: string) => void;
  onToggleSave: (row: JobListRowVM) => void;
  onNotForMe: (row: JobListRowVM) => void;
  onOpenOriginal: (row: JobListRowVM) => void;
}) {
  const intl = useIntl();
  const titleId = `job-row-${row.jobId}`;
  const companyId = `job-row-company-${row.jobId}`;
  return (
    <li
      {...nav.itemProps(row.jobId)}
      ref={measure}
      data-index={index}
      aria-posinset={position}
      aria-setsize={setSize}
      aria-labelledby={`${titleId} ${companyId}`}
      onClick={() => onSelect(row.jobId)}
      style={{ transform: `translateY(${start}px)` }}
      // Grid: the age / saved column sits beside the title and company only, so the salary line
      // and the pills use the full width (one line at the 340 px list of a 1280 px window).
      className={cx(
        "group absolute inset-x-0 top-0 grid cursor-default grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 rounded-md px-3 py-3 outline-offset-[-2px] focus-visible:outline-2",
        selected ? "bg-surface-selected" : "hover:bg-surface-hover",
      )}
    >
      <div className="col-start-1 row-span-4 row-start-1">
        <Monogram company={row.company} />
      </div>
      <p id={titleId} className="text-headline col-start-2 row-start-1 line-clamp-2">
        {row.title}
      </p>
      <p className="text-fg-secondary text-callout col-start-2 row-start-2 truncate">
        <span id={companyId}>{row.company.name}</span>
        {row.where && ` · ${row.where}`}
      </p>
      <p
        className={cx(
          "text-footnote col-span-2 col-start-2 row-start-3",
          row.salary.provenance === "notStated" ? "text-fg-tertiary" : "text-fg-secondary",
        )}
        title={row.salary.shortText === row.salary.text ? undefined : row.salary.text}
      >
        <span aria-hidden="true">{row.salary.shortText}</span>
        <span className="sr-only">{row.salary.text}</span>
      </p>
      <div className="col-span-2 col-start-2 row-start-4 mt-1.5 flex flex-wrap items-center gap-1.5">
        {row.match ? (
          <MatchBandPill match={row.match} />
        ) : (
          <span className="text-fg-tertiary text-caption1">{intl.formatMessage(messages.scoring)}</span>
        )}
        {row.status && <StatusPill status={row.status} size="sm" />}
        {row.sourceCount && (
          <span
            className="text-fg-tertiary text-caption1 inline-flex items-center gap-1"
            title={row.sourceNames.join(", ")}
          >
            <Layers aria-hidden="true" className="size-3" strokeWidth={1.75} />
            {row.sourceCount}
          </span>
        )}
      </div>
      <div className="col-start-3 row-span-2 row-start-1 flex flex-col items-end gap-1.5 group-focus-within:invisible group-hover:invisible">
        {row.posted && <RelativeTimeChip time={row.posted} />}
        <span className="flex items-center gap-1">
          {row.pendingSync && <SyncGlyph />}
          {saved && !row.status && (
            <BookmarkCheck
              aria-label={copy.saved}
              role="img"
              className="text-accent-text size-4"
              strokeWidth={1.75}
            />
          )}
        </span>
      </div>
      <div className="bg-surface-elevated shadow-overlay absolute top-2 right-2 hidden items-center gap-0.5 rounded-md p-0.5 group-focus-within:flex group-hover:flex">
        <IconButton
          tabIndex={-1}
          size="sm"
          icon={saved ? BookmarkCheck : Bookmark}
          label={saved ? intl.formatMessage(messages.unsave) : copy.save}
          shortcut="S"
          pressed={saved}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSave(row);
          }}
        />
        <IconButton
          tabIndex={-1}
          size="sm"
          icon={EyeOff}
          label={copy.notForMe}
          shortcut="D"
          onClick={(event) => {
            event.stopPropagation();
            onNotForMe(row);
          }}
        />
        <IconButton
          tabIndex={-1}
          size="sm"
          icon={ArrowUpRight}
          label={copy.openOriginal}
          shortcut="O"
          onClick={(event) => {
            event.stopPropagation();
            onOpenOriginal(row);
          }}
        />
      </div>
    </li>
  );
});

/** Zero-height anchor where the hidden row was, for the reason popover. */
function HiddenAnchor({
  index,
  start,
  measure,
  reasons,
  reasonsOpen,
  onReasonsOpenChange,
  onSaveReasons,
}: {
  index: number;
  start: number;
  measure: (element: HTMLElement | null) => void;
  reasons: readonly DismissReasonVM[];
  reasonsOpen: boolean;
  onReasonsOpenChange: (open: boolean) => void;
  onSaveReasons: (keys: readonly DismissReasonVM["key"][]) => void;
}) {
  return (
    <DismissReasonPopover
      reasons={reasons}
      open={reasonsOpen}
      onOpenChange={onReasonsOpenChange}
      onSave={onSaveReasons}
    >
      <li
        ref={measure}
        data-index={index}
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0"
        style={{ transform: `translateY(${start}px)` }}
      />
    </DismissReasonPopover>
  );
}

/** The list's entries: the rows, with the hidden row's anchor where it was. */
type Entry =
  | { readonly kind: "row"; readonly row: JobListRowVM; readonly position: number }
  | { readonly kind: "hidden"; readonly jobId: string };

export function JobList({
  model,
  rows,
  savedOf,
  selectedId,
  placeholder,
  listRef,
  nav,
  reasonsOpen,
  onReasonsOpenChange,
  onSaveReasons,
  onSelect,
  onToggleSave,
  onNotForMe,
  onOpenOriginal,
  onSortChange,
  stamp,
}: {
  model: JobDetailModel;
  rows: readonly JobListRowVM[];
  savedOf: (row: JobListRowVM) => boolean;
  selectedId: string | null;
  placeholder: HiddenPlaceholder | null;
  listRef: RefObject<HTMLUListElement | null>;
  nav: ListNavigation;
  reasonsOpen: boolean;
  onReasonsOpenChange: (open: boolean) => void;
  onSaveReasons: (keys: readonly DismissReasonVM["key"][]) => void;
  onSelect: (jobId: string) => void;
  onToggleSave: (row: JobListRowVM) => void;
  onNotForMe: (row: JobListRowVM) => void;
  onOpenOriginal: (row: JobListRowVM) => void;
  /** The sort menu's choice; the screen keeps it in the route (`?sort=newest`). */
  onSortChange: (sort: JobSort) => void;
  stamp: React.ReactNode;
}) {
  const intl = useIntl();
  const { copy, list } = model;
  const scrollRef = useRef<HTMLDivElement>(null);
  const entries: Entry[] = rows.map((row, index) => ({ kind: "row", row, position: index + 1 }));
  if (placeholder)
    entries.splice(Math.min(placeholder.index, entries.length), 0, {
      kind: "hidden",
      jobId: placeholder.jobId,
    });
  // Always rendered, wherever the list is scrolled: the selected row (it holds keyboard focus) and
  // the hidden row's anchor (the reason popover's).
  const pinned = [
    entries.findIndex((entry) => entry.kind === "row" && entry.row.jobId === selectedId),
    entries.findIndex((entry) => entry.kind === "hidden"),
  ].filter((index) => index >= 0);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (entries[index]?.kind === "hidden" ? 0 : ROW_ESTIMATE),
    getItemKey: (index) => {
      const entry = entries[index];
      return entry === undefined ? index : entry.kind === "row" ? entry.row.jobId : `hidden-${entry.jobId}`;
    },
    gap: ROW_GAP,
    overscan: 6,
    rangeExtractor: (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      const extra = pinned.filter((index) => !indexes.includes(index));
      return extra.length === 0 ? indexes : [...indexes, ...extra].toSorted((a, b) => a - b);
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="text-fg-secondary text-footnote flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-5 py-2 *:whitespace-nowrap">
        <span className="tabular-nums">{list.countLabel}</span>
        <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 *:whitespace-nowrap">
          {stamp}
          <SortMenu
            label={intl.formatMessage(messages.sortedBy, { sort: list.sortLabel })}
            note={list.rankingInfo}
            sort={model.filterBar.sort}
            onSortChange={onSortChange}
          />
        </span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        <ul
          ref={listRef}
          aria-label={list.countLabel}
          className="relative"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const entry = entries[item.index];
            if (!entry) return null;
            return entry.kind === "hidden" ? (
              <HiddenAnchor
                key={item.key}
                index={item.index}
                start={item.start}
                measure={virtualizer.measureElement}
                reasons={model.dismissReasons}
                reasonsOpen={reasonsOpen}
                onReasonsOpenChange={onReasonsOpenChange}
                onSaveReasons={onSaveReasons}
              />
            ) : (
              <Row
                key={item.key}
                row={entry.row}
                saved={savedOf(entry.row)}
                selected={entry.row.jobId === selectedId}
                copy={copy}
                nav={nav}
                index={item.index}
                position={entry.position}
                setSize={rows.length}
                start={item.start}
                measure={virtualizer.measureElement}
                onSelect={onSelect}
                onToggleSave={onToggleSave}
                onNotForMe={onNotForMe}
                onOpenOriginal={onOpenOriginal}
              />
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** "Sorted by Best match ▾": the sort choices, then how the ranking works. */
function SortMenu({
  label,
  note,
  sort,
  onSortChange,
}: {
  label: string;
  /** "Sorted by match, then newest. Scores are a rough guide…": the trigger's description too. */
  note: string;
  sort: JobDetailModel["filterBar"]["sort"];
  onSortChange: (sort: JobSort) => void;
}) {
  const noteId = useId();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-sort-trigger=""
          aria-describedby={noteId}
          className="hover:text-fg-primary inline-flex min-h-6 cursor-default items-center gap-1 rounded-sm"
        >
          {label}
          <ChevronDown aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        </button>
      </DropdownMenu.Trigger>
      <span id={noteId} hidden>
        {note}
      </span>
      <MenuContent align="end" aria-label={sort.label}>
        <MenuRadioGroup
          label={sort.label}
          value={sort.value}
          onValueChange={(value) => {
            const next = JOB_SORTS.find((candidate) => candidate === value);
            if (next) onSortChange(next);
          }}
        >
          {sort.options.map((option) => (
            <MenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <p className="text-fg-tertiary text-caption1 max-w-60 px-2 pt-1 pb-2">{note}</p>
      </MenuContent>
    </DropdownMenu.Root>
  );
}

/**
 * Zero results (job-feed-search.md "Decision — Desktop" 7, Zillow): what hides the jobs, one
 * removable chip per active filter with the jobs it alone brings back, then Remove all filters /
 * Clear search and "Search job sites for “react”".
 */
export function EmptyResults({
  empty,
  searchDisabledReason,
  onRemoveFacet,
  onAction,
  onSearchSites,
}: {
  empty: JobsEmptyVM;
  /** Why "Search job sites" can't run now (offline), or null. */
  searchDisabledReason: string | null;
  onRemoveFacet: (facet: FilterFacet) => void;
  /** Remove all filters (with chips) or Clear search. */
  onAction: () => void;
  onSearchSites: () => void;
}) {
  const intl = useIntl();
  return (
    <div className="flex flex-col items-center gap-4 px-5 pt-10 pb-10 text-center">
      {/* EmptyState's `noResults` text, with the chips between it and the actions. */}
      <div className="flex max-w-100 flex-col gap-1">
        <p className="text-fg-primary text-headline">{empty.title}</p>
        <p className="text-body text-fg-secondary">{empty.body}</p>
      </div>
      {empty.chips.length > 0 && (
        <ul
          aria-label={intl.formatMessage(messages.activeFilters)}
          className="flex max-w-100 flex-wrap justify-center gap-1.5"
        >
          {empty.chips.map((chip) => (
            <li key={chip.facet}>
              <RemoveChip chip={chip} onRemove={() => onRemoveFacet(chip.facet)} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col items-stretch gap-2">
        {empty.action && <Button onClick={onAction}>{empty.action}</Button>}
        {empty.searchAction && (
          <Button variant="plain" icon={Search} onClick={onSearchSites} disabledReason={searchDisabledReason}>
            {empty.searchAction}
          </Button>
        )}
      </div>
    </div>
  );
}

/** "Work mode: On-site +3 ×": removes one filter; "+3" is explained in a tooltip and the description. */
function RemoveChip({ chip, onRemove }: { chip: RemovableChipVM; onRemove: () => void }) {
  const hintId = useId();
  const button = (
    <button
      type="button"
      aria-label={chip.removeLabel}
      aria-describedby={chip.count ? hintId : undefined}
      data-remove-facet={chip.facet}
      onClick={onRemove}
      className="bg-accent-subtle text-accent-text text-footnote hover:bg-surface-hover inline-flex h-7 max-w-full cursor-default items-center gap-1 rounded-full ps-3 pe-2 font-medium outline-offset-1 select-none focus-visible:outline-2"
    >
      <span className="truncate">{chip.label}</span>
      {chip.count && (
        <>
          <span className="font-normal tabular-nums">{chip.count.label}</span>
          <span id={hintId} hidden>
            {chip.count.hint}
          </span>
        </>
      )}
      <X aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
    </button>
  );
  return chip.count ? <Hint label={chip.count.hint}>{button}</Hint> : button;
}
