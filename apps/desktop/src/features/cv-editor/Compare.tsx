/**
 * Comparing two versions of a CV (conflict "Compare", history "Compare with now"): a line diff of
 * the CV's text, grouped by section. In history, removed and added lines carry a "−"/"+" mark,
 * strike-through and a text label for screen readers; in a conflict, each line is tagged with the
 * version it's in. Never colour alone, and no red: a difference isn't an error.
 */
import type { CvContent } from "@bfhr/core";
import { Dialog } from "radix-ui";
import { type ReactNode, useId, useMemo } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Button } from "../../shared/ui/Button";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { contentLines, diffLines } from "./content";

const messages = defineMessages({
  close: { id: "cv-editor.compare.close", defaultMessage: "Close" },
  added: { id: "cv-editor.compare.added", defaultMessage: "Added:" },
  removed: { id: "cv-editor.compare.removed", defaultMessage: "Removed:" },
  loadingOther: {
    id: "cv-editor.compare.loadingOther",
    defaultMessage: "Getting the other version… It's still arriving from your other device.",
    description: "Conflict compare while the other device's version hasn't synced to this device yet",
  },
  same: { id: "cv-editor.compare.same", defaultMessage: "These two versions have the same text." },
  summary: {
    id: "cv-editor.compare.summary",
    defaultMessage:
      "{added, plural, =0 {Nothing added} one {# line added} other {# lines added}}, {removed, plural, =0 {nothing removed} one {# line removed} other {# lines removed}}",
  },
  summarySources: {
    id: "cv-editor.compare.summarySources",
    defaultMessage:
      "{theirs, plural, =0 {Nothing only in the other version} one {# line only in the other version} other {# lines only in the other version}}, {mine, plural, =0 {nothing only in this one} one {# line only in this one} other {# lines only in this one}}",
    description: "Conflict compare: how many lines differ on each side",
  },
  otherDevice: {
    id: "cv-editor.compare.otherDevice",
    defaultMessage: "Other version",
    description: "Conflict compare: tag on a line that is only in the version saved on another device",
  },
  thisDevice: {
    id: "cv-editor.compare.thisDevice",
    defaultMessage: "This version",
    description: "Conflict compare: tag on a line that is only in the version on this device",
  },
  unchanged: {
    id: "cv-editor.compare.unchanged",
    defaultMessage: "{count, plural, one {# unchanged line} other {# unchanged lines}}",
  },
  conflictTitle: { id: "cv-editor.conflict.title", defaultMessage: "This CV changed on another device" },
  conflictBody: {
    id: "cv-editor.conflict.body",
    defaultMessage:
      "Your edits here are safe. Choose which version to keep — the other one stays in Version history either way.",
  },
  keepMine: { id: "cv-editor.conflict.keepMine", defaultMessage: "Keep this version" },
  useTheirs: { id: "cv-editor.conflict.useTheirs", defaultMessage: "Use the other version" },
  compare: { id: "cv-editor.conflict.compare", defaultMessage: "Compare" },
});

/** Section key → its title in the editor ("work" → "Experience"). */
export type SectionTitles = Readonly<Record<string, string>>;

export function CompareDialog({
  open,
  onOpenChange,
  title,
  description,
  before,
  after,
  sectionTitles,
  sources = false,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What is compared with what: "Version from 12 Oct, 10:30 → your working copy". */
  description: string;
  /** Null while that version's content hasn't arrived yet (a remote revision still syncing). */
  before: CvContent | null;
  after: CvContent;
  sectionTitles: SectionTitles;
  /**
   * Conflict mode: `before` is the other device's version and `after` this one. Lines are tagged
   * with the version they're in ("Other version" / "This version") instead of removed/added,
   * because neither side is the old one.
   */
  sources?: boolean;
  /** Extra buttons before Close (conflict resolution, restore). */
  actions?: ReactNode;
}) {
  const summaryId = useId();
  const intl = useIntl();
  const diff = useMemo(() => (before ? diffLines(contentLines(before), contentLines(after)) : []), [before, after]);
  const added = diff.filter((line) => line.kind === "added").length;
  const removed = diff.filter((line) => line.kind === "removed").length;

  // Changed lines with their section heading; runs of unchanged lines collapse to a count.
  const rows: ReactNode[] = [];
  let section: string | null = null;
  let unchanged = 0;
  const flushUnchanged = (key: string) => {
    if (unchanged === 0) return;
    rows.push(
      <li key={`same-${key}`} className="text-fg-tertiary py-1 text-footnote">
        {intl.formatMessage(messages.unchanged, { count: unchanged })}
      </li>,
    );
    unchanged = 0;
  };
  diff.forEach((change, index) => {
    if (change.kind === "same") {
      unchanged += 1;
      return;
    }
    flushUnchanged(String(index));
    if (change.line.section !== section) {
      section = change.line.section;
      rows.push(
        <li key={`h-${index}`} className="text-fg-secondary pt-3 text-footnote font-semibold first:pt-0">
          {sectionTitles[section] ?? section}
        </li>,
      );
    }
    const isAdded = change.kind === "added";
    // Neutral tones on both sides: a difference isn't an error (system.md "Calm").
    const tone = isAdded ? "bg-accent-subtle text-fg-primary" : "bg-surface-sunken text-fg-secondary";
    rows.push(
      sources ? (
        <li key={index} className={cx("flex flex-col rounded-sm px-2 py-1 text-callout", tone)}>
          <span className={cx("text-caption1 font-semibold", isAdded ? "text-accent-text" : "text-fg-secondary")}>
            {intl.formatMessage(isAdded ? messages.thisDevice : messages.otherDevice)}
            <span className="sr-only">: </span>
          </span>
          <span className="min-w-0 break-words">{change.line.text}</span>
        </li>
      ) : (
        <li key={index} className={cx("flex gap-2 rounded-sm px-2 py-1 text-callout", tone, !isAdded && "line-through")}>
          <span aria-hidden className="w-3 shrink-0 font-mono">
            {isAdded ? "+" : "−"}
          </span>
          <span className="min-w-0 break-words">
            <span className="sr-only">{intl.formatMessage(isAdded ? messages.added : messages.removed)} </span>
            {change.line.text}
          </span>
        </li>
      ),
    );
  });
  flushUnchanged("end");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex max-h-[min(720px,calc(100vh-64px))] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg p-5">
          <div>
            <Dialog.Title className="font-display text-title3">{title}</Dialog.Title>
            <Dialog.Description className="text-fg-secondary mt-1 text-callout">{description}</Dialog.Description>
            {before && (
              <p id={summaryId} className="text-fg-secondary mt-1 text-footnote">
                {sources
                  ? intl.formatMessage(messages.summarySources, { theirs: removed, mine: added })
                  : intl.formatMessage(messages.summary, { added, removed })}
              </p>
            )}
          </div>
          {before === null ? (
            // Never claim "the same text" before the other side is here.
            <p role="status" className="text-fg-secondary text-callout">
              {intl.formatMessage(messages.loadingOther)}
            </p>
          ) : (
            // Focusable so the list can be scrolled from the keyboard (it holds no controls).
            <div
              role="group"
              aria-labelledby={summaryId}
              tabIndex={0}
              className="border-line-subtle min-h-0 flex-1 overflow-y-auto rounded-md border p-3"
            >
              {added + removed === 0 ? (
                <p className="text-fg-secondary text-callout">{intl.formatMessage(messages.same)}</p>
              ) : (
                <ul className="flex flex-col gap-1">{rows}</ul>
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {actions}
            <Dialog.Close asChild>
              <Button variant="secondary">{intl.formatMessage(messages.close)}</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The conflict banner over the editor (session.ts `CvConflict`). */
export function ConflictBanner({
  onKeepMine,
  onUseTheirs,
  onCompare,
}: {
  onKeepMine: () => void;
  onUseTheirs: () => void;
  onCompare: () => void;
}) {
  const intl = useIntl();
  return (
    <InlineAlert tone="warning" title={intl.formatMessage(messages.conflictTitle)} className="mx-4 mt-3">
      <p>{intl.formatMessage(messages.conflictBody)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={onKeepMine}>
          {intl.formatMessage(messages.keepMine)}
        </Button>
        <Button size="sm" variant="secondary" onClick={onUseTheirs}>
          {intl.formatMessage(messages.useTheirs)}
        </Button>
        <Button size="sm" variant="plain" onClick={onCompare}>
          {intl.formatMessage(messages.compare)}
        </Button>
      </div>
    </InlineAlert>
  );
}

export const conflictMessages = messages;
