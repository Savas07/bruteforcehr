/**
 * `ReviewDetailPane` (components.md "Mail", mail-review.md "Decision — Desktop"): the review card
 * pinned at the top of Mail's reading pane and opened from Today's "To review". It shows what we
 * found in one email and asks the user to confirm, change or discard it. The screen registers the
 * keys (`C`, `M`, `N`, `H`, `O`; decisions.md D27); the pane only shows them in tooltips.
 */
import { Check, CloudOff, ExternalLink, PencilLine } from "lucide-react";
import { useId } from "react";
import type { ReviewProposalVM } from "../model/blocks";
import { cx } from "../cx";
import { Button } from "./Button";
import { Monogram } from "./Company";
import { ProposalSentence, ReasonLine } from "./ProposalSentence";
import { RelativeTimeChip } from "./RelativeTimeChip";
import { StatusPill } from "./StatusPill";
import { SyncGlyph } from "./SyncGlyph";

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
            <span className="sr-only">Subject: </span>
            {proposal.subject}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-1.5">
        {move ? (
          <ProposalSentence move={move} mode="question" />
        ) : (
          <p className="text-body text-fg-primary">This email doesn't change a status.</p>
        )}
        <ReasonLine reason={proposal.reason} source={proposal.source} />
      </div>

      {proposal.evidence !== null && (
        <figure className="border-line-control border-s-2 ps-3">
          <blockquote className="text-callout text-fg-secondary text-pretty">
            “{proposal.evidence}”
          </blockquote>
          <figcaption className="text-caption1 text-fg-tertiary mt-1">From the email</figcaption>
        </figure>
      )}

      <dl className="text-callout grid grid-cols-[max-content_1fr] items-baseline gap-x-4 gap-y-2">
        <dt className="text-fg-secondary">Category</dt>
        <dd className="text-fg-primary">{proposal.category.label}</dd>
        <dt className="text-fg-secondary">Application</dt>
        <dd className="text-fg-primary">
          {move === null ? (
            <span className="text-fg-tertiary">No application found</span>
          ) : move.applicationId === null ? (
            <>
              {move.applicationLabel} <span className="text-fg-secondary">(new)</span>
            </>
          ) : (
            move.applicationLabel
          )}
        </dd>
        <dt className="text-fg-secondary">Status</dt>
        <dd className="flex flex-wrap items-center gap-1.5">
          {move ? (
            <>
              {move.from && (
                <>
                  <StatusPill status={move.from} size="sm" />
                  <span aria-hidden="true" className="text-fg-tertiary">
                    →
                  </span>
                  <span className="sr-only">to</span>
                </>
              )}
              <StatusPill status={move.to} size="sm" />
            </>
          ) : (
            <span className="text-fg-tertiary">No change</span>
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
            hint={move ? `Confirm: move to ${move.to.label}` : "Confirm"}
            disabledReason={confirmDisabledReason}
            onClick={onConfirm}
          >
            Confirm
          </Button>
          <Button icon={PencilLine} shortcut="M" onClick={onChange}>
            Change…
          </Button>
          <Button variant="plain" shortcut="N" aria-describedby={forgetId} onClick={onNotJobMail}>
            Not job mail
          </Button>
          {(onReviewLater || onOpenOriginal) && (
            <span className="ms-auto flex flex-wrap items-center gap-2">
              {onReviewLater && (
                <Button variant="plain" shortcut="H" onClick={onReviewLater}>
                  Review later
                </Button>
              )}
              {onOpenOriginal && (
                <Button variant="plain" icon={ExternalLink} shortcut="O" onClick={onOpenOriginal}>
                  Open original
                </Button>
              )}
            </span>
          )}
        </div>
        <p id={forgetId} className="text-footnote text-fg-tertiary">
          We'll forget this email.
        </p>
        {offline && (
          <p className="text-footnote text-fg-secondary flex items-center gap-1.5">
            <CloudOff aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
            You're offline. Your choice is saved and will sync when you're back online.
          </p>
        )}
      </div>
    </section>
  );
}
