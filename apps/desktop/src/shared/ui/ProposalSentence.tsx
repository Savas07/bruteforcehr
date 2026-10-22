/**
 * `ProposalSentence` and `ReasonLine` (components.md "Mail", mail-review.md "Copy notes"): the
 * status move a review item proposes, and the evidence behind it as one sentence. Shared by
 * `ReviewDetailPane` (Today + Mail), `AutoChangeRow` and `TimelineRow`, so every surface keeps
 * one grammar (system.md "Trust is visible").
 */
import type { ReactNode } from "react";
import { defineMessages, FormattedMessage } from "react-intl";
import type { StatusMoveVM } from "../model/blocks";
import type { SourceVM } from "../model/types";
import { cx } from "../cx";
import { SourceTag } from "./SourceTag";

const messages = defineMessages({
  addQuestion: {
    id: "shared.ui.proposalSentence.addQuestion",
    defaultMessage: "Add {application} to Tracker as <b>{to}</b>?",
    description:
      "Review proposal creating a new application; {application} = 'Company · Role', {to} = status",
  },
  addStatement: {
    id: "shared.ui.proposalSentence.addStatement",
    defaultMessage: "{application} is added to Tracker as <b>{to}</b>.",
    description: "Decided/applied creation of a new application; {to} = status",
  },
  moveQuestion: {
    id: "shared.ui.proposalSentence.moveQuestion",
    defaultMessage: "Move {application} from {from} to <b>{to}</b>?",
    description: "Review proposal moving an existing application between statuses",
  },
  moveStatement: {
    id: "shared.ui.proposalSentence.moveStatement",
    defaultMessage: "{application} moves from {from} to <b>{to}</b>.",
    description: "Decided/applied status move of an existing application",
  },
});

const bold = (chunks: ReactNode[]) => <strong className="font-semibold text-fg-primary">{chunks}</strong>;

export interface ProposalSentenceProps {
  /** The proposed move; `from: null` means the email would create the application. */
  move: StatusMoveVM;
  /**
   * `question` while the user still decides (review items: "Move … to Interviewing?");
   * `statement` once it is decided or applied ("… moves from Applied to Interviewing.").
   */
  mode: "question" | "statement";
  className?: string;
}

/**
 * "Move Acme · Frontend Engineer from Applied to **Interviewing**?" Only the target status is
 * bold; the application label wraps and is never truncated before the status. When the move
 * creates the application: "Add Acme · Frontend Engineer to Tracker as **Applied**?".
 */
export function ProposalSentence({ move, mode, className }: ProposalSentenceProps) {
  const question = mode === "question";
  const message =
    move.from === null
      ? question
        ? messages.addQuestion
        : messages.addStatement
      : question
        ? messages.moveQuestion
        : messages.moveStatement;
  return (
    <p className={cx("text-body text-fg-primary text-pretty", className)}>
      <FormattedMessage
        {...message}
        values={{ application: move.applicationLabel, from: move.from?.label, to: move.to.label, b: bold }}
      />
    </p>
  );
}

export interface ReasonLineProps {
  /** The evidence as one sentence ("Same email thread as your application of 3 Oct"). */
  reason: string;
  /** Who or what made the change, shown as a `SourceTag` before the sentence. */
  source?: SourceVM;
  className?: string;
}

/**
 * Why we think so: an optional `SourceTag` followed by the reason sentence, in secondary text.
 * Renders nothing when the reason is empty and there is no source.
 */
export function ReasonLine({ reason, source, className }: ReasonLineProps) {
  if (!reason && !source) return null;
  return (
    <p
      className={cx("text-footnote text-fg-secondary flex flex-wrap items-center gap-x-2 gap-y-1", className)}
    >
      {source && <SourceTag source={source} />}
      {reason && <span className="text-pretty">{reason}</span>}
    </p>
  );
}
