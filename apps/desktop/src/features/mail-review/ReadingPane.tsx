/**
 * Mail's reading pane (mail-review.md "Decision — Desktop"): the review card pinned at the top
 * (proposal + reason + evidence; Confirm / Change… / Not job mail, never Confirm all), or the
 * automatic change with Undo, then the email text, the folded details below 1440 px and the
 * linked application's recent activity.
 */
import { ExternalLink } from "lucide-react";
import { useId } from "react";
import { defineMessages, useIntl } from "react-intl";
import { Button } from "../../shared/ui/Button";
import { AutoChangeRow } from "../../shared/ui/AutoChangeRow";
import { Monogram } from "../../shared/ui/Company";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { NeedsConnection } from "../../shared/ui/NeedsConnection";
import { RelativeTimeChip } from "../../shared/ui/RelativeTimeChip";
import { ReviewDetailPane } from "../../shared/ui/ReviewDetailPane";
import { TimelineRow } from "../../shared/ui/TimelineRow";
import { CorrectionPopover, type CorrectionDraft, NEW_APPLICATION } from "./CorrectionPopover";
import { MailDetails } from "./MailDetails";
import { KeyboardHintBar } from "./MailList";
import { ClassificationBadge } from "./MailRow";
import type { MailReviewModel, MailSelectionVM } from "./model";
import { ReviewLater, type ReviewLaterChoice } from "./ReviewLater";

const messages = defineMessages({
  email: { id: "mail-review.reading.email", defaultMessage: "Email" },
  confirmDisabled: {
    id: "mail-review.reading.confirmDisabled",
    defaultMessage: "Nothing to confirm yet. Use Change… to sort this email.",
  },
  movedBack: {
    id: "mail-review.reading.movedBack",
    defaultMessage: "You moved {application} back to {status}.",
  },
  openOriginalOffline: {
    id: "mail-review.reading.openOriginalOffline",
    defaultMessage: "Opening the original needs a connection.",
  },
});

export interface ReadingPaneHandlers {
  onConfirm: () => void;
  onNotJobMail: () => void;
  onSaveCorrection: (draft: CorrectionDraft) => void;
  onReviewLater: (choice: ReviewLaterChoice) => void;
  onOpenOriginal: () => void;
  onUndoChange: () => void;
  onMarkSeen: () => void;
  onOpenApplication: (applicationId: string) => void;
}

/** The current proposal as correction values. */
function initialDraft(selection: MailSelectionVM): CorrectionDraft {
  const { move } = selection.proposal;
  return {
    category: selection.proposal.category.key,
    applicationId: move
      ? (move.applicationId ?? NEW_APPLICATION)
      : (selection.details.application?.id ?? null),
    status: move?.to.key ?? null,
  };
}

function EmailHeader({ selection, chip }: { selection: MailSelectionVM; chip: string | null }) {
  const { proposal } = selection;
  return (
    <header className="flex gap-3">
      <span className="mt-0.5">
        <Monogram
          company={proposal.company}
          size="md"
          badge={<ClassificationBadge category={proposal.category.key} />}
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-headline text-fg-primary text-pretty">{proposal.headline}</h2>
          {chip !== null && (
            <span className="bg-surface-sunken text-fg-secondary text-caption1 rounded-xs px-1.5 py-px">
              {chip}
            </span>
          )}
        </div>
        <p className="text-footnote text-fg-secondary flex flex-wrap items-baseline gap-x-1.5">
          <span className="break-all">{proposal.from}</span>
          <span aria-hidden="true">·</span>
          <RelativeTimeChip time={proposal.receivedAt} />
        </p>
        <p className="text-footnote text-fg-tertiary">{proposal.subject}</p>
      </div>
    </header>
  );
}

export function ReadingPane({
  selection,
  model,
  chip,
  pending,
  undone,
  seen,
  offline,
  wide,
  correctionOpen,
  onCorrectionOpenChange,
  reviewLaterOpen,
  onReviewLaterOpenChange,
  handlers,
}: {
  selection: MailSelectionVM;
  model: MailReviewModel;
  /** "Confirmed" / "Corrected" after a decision in this session, else the model's chip. */
  chip: string | null;
  /** Still waiting for the user's decision. */
  pending: boolean;
  undone: boolean;
  seen: boolean;
  offline: boolean;
  /** ≥ 1440 px: details live in the rail instead of the pane. */
  wide: boolean;
  correctionOpen: boolean;
  onCorrectionOpenChange: (open: boolean) => void;
  reviewLaterOpen: boolean;
  onReviewLaterOpenChange: (open: boolean) => void;
  handlers: ReadingPaneHandlers;
}) {
  const intl = useIntl();
  const emailHeadingId = useId();
  const activityHeadingId = useId();
  const { change } = selection;

  let top;
  if (pending) {
    top = (
      <>
        {selection.unclassified && <InlineAlert tone="info" title={selection.unclassified} />}
        <div>
          <CorrectionPopover
            open={correctionOpen}
            onOpenChange={onCorrectionOpenChange}
            options={model.correction}
            initial={initialDraft(selection)}
            newApplicationLabel={selection.newApplicationLabel}
            onSave={handlers.onSaveCorrection}
          />
          <ReviewDetailPane
            proposal={selection.proposal}
            offline={offline}
            onConfirm={handlers.onConfirm}
            onChange={() => onCorrectionOpenChange(true)}
            onNotJobMail={handlers.onNotJobMail}
            {...(!selection.canConfirm && {
              confirmDisabledReason: intl.formatMessage(messages.confirmDisabled),
            })}
          />
        </div>
      </>
    );
  } else if (selection.mode === "update" && change) {
    top = (
      <>
        {undone ? (
          <InlineAlert
            tone="info"
            title={intl.formatMessage(messages.movedBack, {
              application: `${change.company.name} · ${change.role}`,
              status: change.from.label,
            })}
          />
        ) : (
          <AutoChangeRow
            change={change}
            acknowledged={seen}
            onUndo={handlers.onUndoChange}
            onAcknowledge={handlers.onMarkSeen}
            className="border-line-subtle border"
          />
        )}
        <EmailHeader selection={selection} chip={chip} />
      </>
    );
  } else {
    top = <EmailHeader selection={selection} chip={chip} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-190 flex-col gap-5 px-6 pt-3 pb-10">
          <div className="-me-2 flex min-h-8 flex-wrap items-center justify-end gap-1">
            {pending && (
              <ReviewLater
                open={reviewLaterOpen}
                onOpenChange={onReviewLaterOpenChange}
                minDate={model.reviewLaterMinDate}
                onChoose={handlers.onReviewLater}
              />
            )}
            <NeedsConnection explanation={intl.formatMessage(messages.openOriginalOffline)}>
              {(reason) => (
                <Button
                  size="sm"
                  variant="plain"
                  icon={ExternalLink}
                  shortcut="O"
                  disabledReason={reason}
                  onClick={handlers.onOpenOriginal}
                >
                  {selection.openOriginalLabel}
                </Button>
              )}
            </NeedsConnection>
          </div>

          {top}

          <section aria-labelledby={emailHeadingId} className="flex flex-col gap-2">
            <h2 id={emailHeadingId} className="text-footnote text-fg-secondary font-medium">
              {intl.formatMessage(messages.email)}
            </h2>
            {selection.body !== null && (
              <div className="border-line-subtle text-body text-fg-primary rounded-lg border px-5 py-4 break-words whitespace-pre-line">
                {selection.body}
              </div>
            )}
            {selection.bodyNote && <p className="text-footnote text-fg-tertiary">{selection.bodyNote}</p>}
          </section>

          {!wide && (
            <MailDetails
              details={selection.details}
              copy={model.copy}
              layout="folded"
              onOpenApplication={handlers.onOpenApplication}
              onCreateApplication={pending ? () => onCorrectionOpenChange(true) : null}
            />
          )}

          {selection.activity.length > 0 && (
            <section
              aria-labelledby={activityHeadingId}
              className="border-line-subtle flex flex-col gap-3 border-t pt-5"
            >
              <h2 id={activityHeadingId} className="text-headline text-fg-primary">
                {model.copy.activityHeading}
              </h2>
              <ol>
                {selection.activity.map((event, index) => (
                  <TimelineRow key={event.id} event={event} last={index === selection.activity.length - 1} />
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
      {pending && <KeyboardHintBar />}
    </div>
  );
}
