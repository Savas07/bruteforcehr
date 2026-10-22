/**
 * `ReviewDetailPane` (components.md "Mail", mail-review.md "Decision — Desktop"): the review card
 * pinned at the top of Mail's reading pane and opened from Today's "To review". It shows what we
 * found in one email and asks the user to confirm, change or discard it. The screen registers the
 * keys (`C`, `M`, `N`, `H`, `O`; decisions.md D27); the pane only shows them in tooltips.
 */
import { Check, CloudOff, ExternalLink, PencilLine } from "lucide-react";
import { useId } from "react";
import { defineMessages, useIntl } from "react-intl";
import type { ReviewProposalVM } from "../model/blocks";
import { cx } from "../cx";
import { Button } from "./Button";
import { Monogram } from "./Company";
import { ProposalSentence, ReasonLine } from "./ProposalSentence";
import { RelativeTimeChip } from "./RelativeTimeChip";
import { StatusPill } from "./StatusPill";
import { SyncGlyph } from "./SyncGlyph";

const messages = defineMessages({
  subject: {
    id: "shared.ui.reviewDetailPane.subject",
    defaultMessage: "Subject:",
    description: "Screen-reader prefix before the email subject",
  },
  noStatusChange: {
    id: "shared.ui.reviewDetailPane.noStatusChange",
    defaultMessage: "This email doesn't change a status.",
  },
  evidence: {
    id: "shared.ui.reviewDetailPane.evidence",
    defaultMessage: "“{evidence}”",
    description: "Quoted excerpt from the email; use the language's quotation marks",
  },
  fromTheEmail: {
    id: "shared.ui.reviewDetailPane.fromTheEmail",
    defaultMessage: "From the email",
    description: "Caption under the quoted excerpt",
  },
  category: { id: "shared.ui.reviewDetailPane.category", defaultMessage: "Category" },
  application: { id: "shared.ui.reviewDetailPane.application", defaultMessage: "Application" },
  noApplication: { id: "shared.ui.reviewDetailPane.noApplication", defaultMessage: "No application found" },
  newApplication: {
    id: "shared.ui.reviewDetailPane.newApplication",
    defaultMessage: "(new)",
    description: "After an application label the email would create",
  },
  status: { id: "shared.ui.reviewDetailPane.status", defaultMessage: "Status" },
  statusTo: {
    id: "shared.ui.reviewDetailPane.statusTo",
    defaultMessage: "to",
    description: "Screen reader word between the two status pills (Applied → Interviewing)",
  },
  noChange: { id: "shared.ui.reviewDetailPane.noChange", defaultMessage: "No change" },
  confirmHint: { id: "shared.ui.reviewDetailPane.confirmHint", defaultMessage: "Confirm: move to {status}" },
  confirm: { id: "shared.ui.reviewDetailPane.confirm", defaultMessage: "Confirm" },
  change: { id: "shared.ui.reviewDetailPane.change", defaultMessage: "Change…" },
  notJobMail: { id: "shared.ui.reviewDetailPane.notJobMail", defaultMessage: "Not job mail" },
  reviewLater: { id: "shared.ui.reviewDetailPane.reviewLater", defaultMessage: "Review later" },
  openOriginal: { id: "shared.ui.reviewDetailPane.openOriginal", defaultMessage: "Open original" },
  forget: { id: "shared.ui.reviewDetailPane.forget", defaultMessage: "We'll forget this email." },
  offline: {
    id: "shared.ui.reviewDetailPane.offline",
    defaultMessage: "You're offline. Your choice is saved and will sync when you're back online.",
  },
});

export interface ReviewDetailPaneProps {
  /** The email under review (`reviewProposalVM`). */
  proposal: ReviewProposalVM;
  /** Applies the proposal as shown (`C`). */
  onConfirm: () => void;
  /** Opens the Category · Application · Status pickers (`M`). */
  onChange: () => void;
  /** Marks the email as not job mail; we forget it (`N`). */
  onNotJobMail: () => void;
  /** Snoozes the item ("Review later", `H`). Hidden when absent. */
  onReviewLater?: () => void;
  /** Opens the email in the user's mail app (`O`). Hidden when absent. */
  onOpenOriginal?: () => void;
  /**
   * Disables Confirm and says why, e.g. "Choose an application first." when a required field is
   * empty (components.md state "Confirm disabled").
   */
  confirmDisabledReason?: string;
  /** Offline: actions still work and are queued; the pane says so (state "queued offline"). */
  offline?: boolean;
  /** Heading level of the headline: 2 in Mail's reading pane, 3 inside a Today section. */
  headingLevel?: 2 | 3;
  className?: string;
}

/**
 * Headline ("Looks like an interview invite from Acme"), sender and time, the proposal sentence,
 * the reason line, the quoted evidence, extracted dates, the Category · Application · Status
 * fields, then Confirm (primary) · Change… · Not job mail, with "We'll forget this email." under
 * Not job mail.
 */
export function ReviewDetailPane({
  proposal,
  onConfirm,
  onChange,
  onNotJobMail,
  onReviewLater,
  onOpenOriginal,
  confirmDisabledReason,
  offline = false,
  headingLevel = 2,
  className,
}: ReviewDetailPaneProps) {
  const headlineId = useId();
  const forgetId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const intl = useIntl();
  const { move } = proposal;
  return (
    <section
      aria-labelledby={headlineId}
      className={cx(
        "bg-surface-base border-line-subtle flex flex-col gap-4 rounded-lg border p-4",
        className,
      )}
    >
      <header className="flex gap-3">
        <Monogram company={proposal.company} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Heading id={headlineId} className="text-headline text-fg-primary text-pretty">
              {proposal.headline}
            </Heading>
            {proposal.pendingSync && <SyncGlyph />}
          </div>
          <p className="text-footnote text-fg-secondary flex flex-wrap items-baseline gap-x-1.5">
            <span className="break-all">{proposal.from}</span>
            <span aria-hidden="true">·</span>
            <RelativeTimeChip time={proposal.receivedAt} />
          </p>
          <p className="text-footnote text-fg-tertiary">
            <span className="sr-only">{intl.formatMessage(messages.subject)} </span>
            {proposal.subject}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-1.5">
        {move ? (
          <ProposalSentence move={move} mode="question" />
        ) : (
          <p className="text-body text-fg-primary">{intl.formatMessage(messages.noStatusChange)}</p>
        )}
        <ReasonLine reason={proposal.reason} source={proposal.source} />
      </div>

      {proposal.evidence !== null && (
        <figure className="border-line-control border-s-2 ps-3">
          <blockquote className="text-callout text-fg-secondary text-pretty">
            {intl.formatMessage(messages.evidence, { evidence: proposal.evidence })}
          </blockquote>
          <figcaption className="text-caption1 text-fg-tertiary mt-1">
            {intl.formatMessage(messages.fromTheEmail)}
          </figcaption>
        </figure>
      )}

      <dl className="text-callout grid grid-cols-[max-content_1fr] items-baseline gap-x-4 gap-y-2">
        <dt className="text-fg-secondary">{intl.formatMessage(messages.category)}</dt>
        <dd className="text-fg-primary">{proposal.category.label}</dd>
        <dt className="text-fg-secondary">{intl.formatMessage(messages.application)}</dt>
        <dd className="text-fg-primary">
          {move === null ? (
            <span className="text-fg-tertiary">{intl.formatMessage(messages.noApplication)}</span>
          ) : move.applicationId === null ? (
            <>
              {move.applicationLabel}{" "}
              <span className="text-fg-secondary">{intl.formatMessage(messages.newApplication)}</span>
            </>
          ) : (
            move.applicationLabel
          )}
        </dd>
        <dt className="text-fg-secondary">{intl.formatMessage(messages.status)}</dt>
        <dd className="flex flex-wrap items-center gap-1.5">
          {move ? (
            <>
              {move.from && (
                <>
                  <StatusPill status={move.from} size="sm" />
                  <span aria-hidden="true" className="text-fg-tertiary">
                    →
                  </span>
                  <span className="sr-only">{intl.formatMessage(messages.statusTo)}</span>
                </>
              )}
              <StatusPill status={move.to} size="sm" />
            </>
          ) : (
            <span className="text-fg-tertiary">{intl.formatMessage(messages.noChange)}</span>
          )}
        </dd>
        {proposal.dates.map((date, index) => (
          <div key={`${date.label}-${index}`} className="contents">
            <dt className="text-fg-secondary">{date.label}</dt>
            <dd className="text-fg-primary">
              <RelativeTimeChip time={date.at} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            icon={Check}
            shortcut="C"
            hint={
              move
                ? intl.formatMessage(messages.confirmHint, { status: move.to.label })
                : intl.formatMessage(messages.confirm)
            }
            disabledReason={confirmDisabledReason}
            onClick={onConfirm}
          >
            {intl.formatMessage(messages.confirm)}
          </Button>
          <Button icon={PencilLine} shortcut="M" onClick={onChange}>
            {intl.formatMessage(messages.change)}
          </Button>
          <Button variant="plain" shortcut="N" aria-describedby={forgetId} onClick={onNotJobMail}>
            {intl.formatMessage(messages.notJobMail)}
          </Button>
          {(onReviewLater || onOpenOriginal) && (
            <span className="ms-auto flex flex-wrap items-center gap-2">
              {onReviewLater && (
                <Button variant="plain" shortcut="H" onClick={onReviewLater}>
                  {intl.formatMessage(messages.reviewLater)}
                </Button>
              )}
              {onOpenOriginal && (
                <Button variant="plain" icon={ExternalLink} shortcut="O" onClick={onOpenOriginal}>
                  {intl.formatMessage(messages.openOriginal)}
                </Button>
              )}
            </span>
          )}
        </div>
        <p id={forgetId} className="text-footnote text-fg-tertiary">
          {intl.formatMessage(messages.forget)}
        </p>
        {offline && (
          <p className="text-footnote text-fg-secondary flex items-center gap-1.5">
            <CloudOff aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
            {intl.formatMessage(messages.offline)}
          </p>
        )}
      </div>
    </section>
  );
}
