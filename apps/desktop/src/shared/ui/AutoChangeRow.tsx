/**
 * `AutoChangeRow` (components.md "Today", decisions.md D11): a status change the app made on its
 * own, with its source, its reason and a durable Undo (system.md "Trust is visible"). Shared by
 * Today and Mail › Updates; the Tracker timeline shows the same facts through `TimelineRow`.
 */
import { Undo2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";
import type { AutoChangeVM } from "../model/blocks";
import { cx } from "../cx";
import { Button } from "./Button";
import { Monogram } from "./Company";
import { ReasonLine } from "./ProposalSentence";
import { RelativeTimeChip } from "./RelativeTimeChip";
import { SyncGlyph } from "./SyncGlyph";

const messages = defineMessages({
  sentence: {
    id: "shared.ui.autoChangeRow.sentence",
    defaultMessage: "Moved to <b>{to}</b><hidden> from {from}</hidden> — {source}",
    description:
      "Automatic status change. <hidden> is read by screen readers only. {source} is the source label, e.g. 'from an email by Acme' (first letter lower-cased in English only)",
  },
  undoHint: { id: "shared.ui.autoChangeRow.undoHint", defaultMessage: "Move back to {status}" },
  undo: { id: "shared.ui.autoChangeRow.undo", defaultMessage: "Undo" },
  viewSource: { id: "shared.ui.autoChangeRow.viewSource", defaultMessage: "View source" },
  markAsSeen: { id: "shared.ui.autoChangeRow.markAsSeen", defaultMessage: "Mark as seen" },
});

export interface AutoChangeRowProps {
  /** The automatic change (`autoChangeVM`). */
  change: AutoChangeVM;
  /** Reverts the move. Offered only while `change.undo.available`; otherwise the row says why not. */
  onUndo: () => void;
  /** Opens the email behind the change. Shown only when the change has a `mailMessageId`. */
  onViewSource?: () => void;
  /** Marks the change as seen ("Mark as seen"); the row stays until then (components.md). */
  onAcknowledge?: () => void;
  /** Already seen: the row is muted and drops "Mark as seen". Undo stays available (D11). */
  acknowledged?: boolean;
  className?: string;
}

/**
 * One automatic change: "Acme · Frontend Engineer", "Moved to **Interviewing** — from an email by
 * Acme", the reason, then Undo or the can't-undo reason ("Can't undo — the status changed since.").
 * States: undoable · superseded · acknowledged. Render inside a list item.
 */
export function AutoChangeRow({
  change,
  onUndo,
  onViewSource,
  onAcknowledge,
  acknowledged = false,
  className,
}: AutoChangeRowProps) {
  const titleId = useId();
  const sentenceId = useId();
  const intl = useIntl();
  // English continues the sentence with the source in lower case ("— from an email by Acme");
  // other languages keep their own casing (German nouns, Turkish "Kaynak: …").
  const source = intl.locale.startsWith("en")
    ? change.source.label.charAt(0).toLocaleLowerCase("en") + change.source.label.slice(1)
    : change.source.label;
  return (
    <article
      aria-labelledby={titleId}
      className={cx(
        "flex gap-3 rounded-md px-3 py-2.5",
        acknowledged ? "bg-transparent" : "bg-surface-base",
        className,
      )}
    >
      <Monogram company={change.company} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3
            id={titleId}
            className={cx("text-callout font-medium", acknowledged ? "text-fg-secondary" : "text-fg-primary")}
          >
            {change.company.name} · {change.role}
          </h3>
          <RelativeTimeChip time={change.occurredAt} />
          {change.pendingSync && <SyncGlyph />}
        </div>
        <p
          id={sentenceId}
          className={cx("text-callout text-pretty", acknowledged ? "text-fg-secondary" : "text-fg-primary")}
        >
          <FormattedMessage
            {...messages.sentence}
            values={{
              to: change.to.label,
              from: change.from.label,
              source,
              b: (chunks: ReactNode[]) => <strong className="font-semibold">{chunks}</strong>,
              hidden: (chunks: ReactNode[]) => <span className="sr-only">{chunks}</span>,
            }}
          />
        </p>
        <ReasonLine reason={change.reason} />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {change.undo.available ? (
            <Button
              size="sm"
              icon={Undo2}
              hint={intl.formatMessage(messages.undoHint, { status: change.from.label })}
              aria-describedby={sentenceId}
              onClick={onUndo}
            >
              {intl.formatMessage(messages.undo)}
            </Button>
          ) : (
            <p className="text-footnote text-fg-tertiary">{change.undo.reason}</p>
          )}
          {onViewSource && change.mailMessageId !== null && (
            <Button size="sm" variant="plain" aria-describedby={sentenceId} onClick={onViewSource}>
              {intl.formatMessage(messages.viewSource)}
            </Button>
          )}
          {onAcknowledge && !acknowledged && (
            <Button size="sm" variant="plain" aria-describedby={sentenceId} onClick={onAcknowledge}>
              {intl.formatMessage(messages.markAsSeen)}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
