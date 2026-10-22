/**
 * One row of the Mail list pane (components.md `MailRow`, `BundleRow`, `ClassificationBadge`):
 * monogram with the class badge, sender and time, one classification line, then the subject, the
 * only part that truncates. Review rows offer ✓ Confirm and ✎ Change on hover; update rows offer
 * Undo. Selection follows focus (`useListNavigation` item props).
 */
import type { MailCategory } from "@bfhr/core";
import {
  Award,
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Inbox,
  Layers,
  Mail,
  MailCheck,
  MailQuestion,
  MailX,
  Milestone,
  PencilLine,
  Undo2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { IconButton } from "../../shared/ui/Button";
import { Monogram } from "../../shared/ui/Company";
import { Hint } from "../../shared/ui/Hint";
import type { ListNavigation } from "../../shared/ui/focus";
import { RelativeTimeChip } from "../../shared/ui/RelativeTimeChip";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import type { MailBundleRowVM, MailPlainRowVM, MailReviewRowVM, MailUpdateRowVM } from "./model";

const messages = defineMessages({
  change: { id: "mail-review.row.change", defaultMessage: "Change…" },
  movedTo: {
    id: "mail-review.row.movedTo",
    defaultMessage: "Moved to <b>{status}</b>",
    description: "Update row: the automatic status change; {status} is a status name",
  },
  movedBack: {
    id: "mail-review.row.movedBack",
    defaultMessage: "You moved it back to {status}",
    description: "Update row after the user undid the automatic change",
  },
  undo: { id: "mail-review.row.undo", defaultMessage: "Undo: move back to {status}" },
  inbox: {
    id: "mail-review.row.inbox",
    defaultMessage: "To {address}",
    description: "Which connected inbox the email arrived in (shown when several are connected)",
  },
});

/** Neutral line icons per class; decisions never read as alarming (D18). */
const CATEGORY_ICONS: Readonly<Record<MailCategory, LucideIcon>> = {
  application_received: MailCheck,
  interview_invite: CalendarDays,
  assessment: ClipboardList,
  offer: Award,
  rejection: Milestone,
  recruiter_outreach: UserRound,
  info_request: MailQuestion,
  job_alert: BellRing,
  other_job: Mail,
  not_job: MailX,
};

/** Class badge on the monogram; decorative because the row writes the class out. */
export function ClassificationBadge({ category }: { category: MailCategory }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span
      aria-hidden="true"
      className="bg-surface-base border-line-subtle text-fg-secondary inline-flex size-4 items-center justify-center rounded-full border"
    >
      <Icon className="size-2.5" strokeWidth={2} />
    </span>
  );
}

type MessageRowVM = MailReviewRowVM | MailUpdateRowVM | MailPlainRowVM;

const rowClass =
  "group border-line-subtle hover:bg-surface-hover aria-[current=true]:bg-surface-selected relative flex cursor-default gap-3 border-b px-4 py-2.5 outline-offset-[-2px]";

export interface MailRowProps {
  row: MessageRowVM;
  nav: ListNavigation;
  /** The session's decision on a review row ("Confirmed"), replacing the model's chip. */
  chip: string | null;
  /** The automatic change behind an update row was undone in this session. */
  undone: boolean;
  /** The automatic change was marked as seen: the row is muted. */
  seen: boolean;
  onSelect: () => void;
  onConfirm: () => void;
  onChange: () => void;
  onUndo: () => void;
}

export function MailRow({
  row,
  nav,
  chip,
  undone,
  seen,
  onSelect,
  onConfirm,
  onChange,
  onUndo,
}: MailRowProps) {
  const intl = useIntl();
  const pendingReview = row.kind === "review" && chip === null;
  let classification: ReactNode;
  if (row.kind === "review" && chip === null) {
    classification = row.unclassified ?? row.proposal.headline;
  } else if (row.kind === "update") {
    classification = undone ? (
      intl.formatMessage(messages.movedBack, { status: row.change.from.label })
    ) : (
      <FormattedMessage
        {...messages.movedTo}
        values={{
          status: row.change.to.label,
          b: (chunks: ReactNode[]) => <strong className="font-semibold">{chunks}</strong>,
        }}
      />
    );
  } else {
    classification = row.category.label;
  }
  const shownChip = chip ?? row.reviewedChip;

  let actions: ReactNode = null;
  if (pendingReview) {
    actions = (
      <>
        <IconButton
          size="sm"
          icon={Check}
          tabIndex={-1}
          label={row.confirmHint}
          shortcut="C"
          disabledReason={row.canConfirm ? null : row.unclassified}
          onClick={(event) => {
            event.stopPropagation();
            onConfirm();
          }}
        />
        <IconButton
          size="sm"
          icon={PencilLine}
          tabIndex={-1}
          label={intl.formatMessage(messages.change)}
          shortcut="M"
          onClick={(event) => {
            event.stopPropagation();
            onChange();
          }}
        />
      </>
    );
  } else if (row.kind === "update" && row.change.undo.available && !undone) {
    actions = (
      <IconButton
        size="sm"
        icon={Undo2}
        tabIndex={-1}
        label={intl.formatMessage(messages.undo, { status: row.change.from.label })}
        onClick={(event) => {
          event.stopPropagation();
          onUndo();
        }}
      />
    );
  }

  const itemProps: HTMLAttributes<HTMLLIElement> = nav.itemProps(row.messageId);
  return (
    <li {...itemProps} className={rowClass} onClick={onSelect}>
      <span className="mt-0.5">
        <Monogram
          company={row.company}
          size="md"
          badge={<ClassificationBadge category={row.category.key} />}
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span
            className={cx(
              "text-callout min-w-0 flex-1 truncate",
              pendingReview ? "text-fg-primary font-semibold" : "text-fg-primary font-medium",
              seen && "text-fg-secondary",
            )}
          >
            {row.sender}
          </span>
          {row.pendingSync && <SyncGlyph />}
          {/* Hover actions take the time's place (keyboard users have C / M; the time stays in the reading pane). */}
          <span
            className={cx(
              "text-footnote text-fg-tertiary shrink-0 tabular-nums",
              actions !== null && "group-hover:invisible",
            )}
          >
            <RelativeTimeChip time={row.receivedAt} />
          </span>
        </div>
        <p
          className={cx(
            "text-callout text-pretty",
            pendingReview && !(row.kind === "review" && row.unclassified)
              ? "text-fg-primary"
              : "text-fg-secondary",
          )}
        >
          {classification}
        </p>
        <p className="text-footnote text-fg-tertiary flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate">{row.subject}</span>
          {shownChip !== null && (
            <span className="bg-surface-sunken text-fg-secondary text-caption1 shrink-0 rounded-xs px-1.5 py-px">
              {shownChip}
            </span>
          )}
          {row.account && (
            <Hint label={intl.formatMessage(messages.inbox, { address: row.account.address })}>
              <span className="text-caption1 text-fg-tertiary shrink-0">
                <span className="sr-only">
                  {intl.formatMessage(messages.inbox, { address: row.account.address })}
                </span>
                <span aria-hidden="true">{row.account.provider}</span>
              </span>
            </Hint>
          )}
        </p>
      </div>
      {actions && <span className="absolute top-1.5 right-2 hidden gap-0.5 group-hover:flex">{actions}</span>}
    </li>
  );
}

const BUNDLE_ICONS: Readonly<Record<MailBundleRowVM["id"], LucideIcon>> = {
  backfill: Inbox,
  jobAlerts: Layers,
};

export function BundleRow({
  row,
  nav,
  onOpen,
}: {
  row: MailBundleRowVM;
  nav: ListNavigation;
  onOpen: () => void;
}) {
  const Icon = BUNDLE_ICONS[row.id];
  const itemProps: HTMLAttributes<HTMLLIElement> = nav.itemProps(`bundle:${row.id}`);
  return (
    <li {...itemProps} className={cx(rowClass, "items-center")} onClick={onOpen}>
      <span
        aria-hidden="true"
        className="bg-surface-sunken border-line-subtle text-fg-secondary inline-flex size-8 shrink-0 items-center justify-center rounded-md border"
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="text-callout text-fg-primary min-w-0 flex-1">{row.label}</span>
      {row.pendingSync && <SyncGlyph />}
      <span className="text-footnote text-fg-tertiary shrink-0 tabular-nums">
        <RelativeTimeChip time={row.latestAt} />
      </span>
      <ChevronRight aria-hidden="true" className="text-fg-tertiary size-4 shrink-0" strokeWidth={1.75} />
    </li>
  );
}
