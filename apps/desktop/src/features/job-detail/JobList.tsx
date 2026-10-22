/**
 * The Jobs list pane (job-feed-search.md "Decision — Desktop" 4–5): "37 jobs · Best match" with
 * the ranking note, rows in Glassdoor anatomy (title, company · place, salary with provenance,
 * band pill, age, saved / status, "3 sources"), and row actions on hover and focus (Save, Not for
 * me, Open original). A hidden row leaves an anchor for the optional reason popover.
 */
import { ArrowUpRight, Bookmark, BookmarkCheck, EyeOff, Info, Layers } from "lucide-react";
import type { RefObject } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { IconButton } from "../../shared/ui/Button";
import { Monogram } from "../../shared/ui/Company";
import type { ListNavigation } from "../../shared/ui/focus";
import { Hint } from "../../shared/ui/Hint";
import { MatchBandPill } from "../../shared/ui/MatchBand";
import { RelativeTimeChip } from "../../shared/ui/RelativeTimeChip";
import { StatusPill } from "../../shared/ui/StatusPill";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import { DismissReasonPopover } from "./DismissReasons";
import type { DismissReasonVM, JobDetailCopyVM, JobDetailModel, JobListRowVM } from "./model";

const messages = defineMessages({
  sortedBy: { id: "job-detail.view.sortedBy", defaultMessage: "Sorted by {sort}" },
  scoring: { id: "job-detail.view.scoring", defaultMessage: "Scoring…" },
  unsave: { id: "job-detail.view.unsave", defaultMessage: "Remove from Saved" },
});

/** The row just hidden with Not for me: where the reason popover anchors. */
export interface HiddenPlaceholder {
  readonly jobId: string;
  /** Index in the visible rows the hidden row had. */
  readonly index: number;
}

function Row({
  row,
  saved,
  selected,
  copy,
  nav,
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
  onSelect: () => void;
  onToggleSave: () => void;
  onNotForMe: () => void;
  onOpenOriginal: () => void;
}) {
  const intl = useIntl();
  const titleId = `job-row-${row.jobId}`;
  return (
    <li
      {...nav.itemProps(row.jobId)}
      aria-labelledby={titleId}
      onClick={onSelect}
      className={cx(
        "group relative flex cursor-default gap-3 rounded-md px-3 py-3 outline-offset-[-2px] focus-visible:outline-2",
        selected ? "bg-surface-selected" : "hover:bg-surface-hover",
      )}
    >
      <Monogram company={row.company} />
      <div className="min-w-0 flex-1">
        <p id={titleId} className="text-headline line-clamp-2">
          {row.title}
        </p>
        <p className="text-fg-secondary text-callout truncate">
          {row.company.name}
          {row.where && ` · ${row.where}`}
        </p>
        <p className={cx("text-footnote", row.salary.provenance === "notStated" ? "text-fg-tertiary" : "text-fg-secondary")}>
          {row.salary.text}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 group-focus-within:invisible group-hover:invisible">
        {row.posted && <RelativeTimeChip time={row.posted} />}
        <span className="flex items-center gap-1">
          {row.pendingSync && <SyncGlyph />}
          {saved && !row.status && (
            <BookmarkCheck aria-label={copy.saved} role="img" className="text-accent-text size-4" strokeWidth={1.75} />
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
            onToggleSave();
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
            onNotForMe();
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
            onOpenOriginal();
          }}
        />
      </div>
    </li>
  );
}

/** Zero-height anchor where the hidden row was, for the reason popover. */
function HiddenAnchor({
  reasons,
  reasonsOpen,
  onReasonsOpenChange,
  onSaveReasons,
}: {
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
      <li aria-hidden="true" className="h-0" />
    </DismissReasonPopover>
  );
}

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
  stamp: React.ReactNode;
}) {
  const intl = useIntl();
  const { copy, list } = model;
  const items = rows.map((row) => (
    <Row
      key={row.jobId}
      row={row}
      saved={savedOf(row)}
      selected={row.jobId === selectedId}
      copy={copy}
      nav={nav}
      onSelect={() => onSelect(row.jobId)}
      onToggleSave={() => onToggleSave(row)}
      onNotForMe={() => onNotForMe(row)}
      onOpenOriginal={() => onOpenOriginal(row)}
    />
  ));
  if (placeholder)
    items.splice(
      Math.min(placeholder.index, items.length),
      0,
      <HiddenAnchor
        key={`hidden-${placeholder.jobId}`}
        reasons={model.dismissReasons}
        reasonsOpen={reasonsOpen}
        onReasonsOpenChange={onReasonsOpenChange}
        onSaveReasons={onSaveReasons}
      />,
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="text-fg-secondary text-footnote flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-5 py-2 *:whitespace-nowrap">
        <span className="tabular-nums">{list.countLabel}</span>
        <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 *:whitespace-nowrap">
          {stamp}
          <Hint label={list.rankingInfo}>
            <button type="button" className="inline-flex items-center gap-1 rounded-sm">
              {intl.formatMessage(messages.sortedBy, { sort: list.sortLabel })}
              <Info aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              <span className="sr-only">. {list.rankingInfo}</span>
            </button>
          </Hint>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        <ul ref={listRef} aria-label={list.countLabel} className="flex flex-col gap-0.5">
          {items}
        </ul>
      </div>
    </div>
  );
}
