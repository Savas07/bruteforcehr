/**
 * `ProposalSentence` and `ReasonLine` (components.md "Mail", mail-review.md "Copy notes"): the
 * status move a review item proposes, and the evidence behind it as one sentence. Shared by
 * `ReviewDetailPane` (Today + Mail), `AutoChangeRow` and `TimelineRow`, so every surface keeps
 * one grammar (system.md "Trust is visible").
 */
import type { StatusMoveVM } from "../model/blocks";
import type { SourceVM } from "../model/types";
import { cx } from "../cx";
import { SourceTag } from "./SourceTag";

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
  const target = <strong className="font-semibold text-fg-primary">{move.to.label}</strong>;
  const question = mode === "question";
  return (
    <p className={cx("text-body text-fg-primary text-pretty", className)}>
      {move.from === null ? (
        question ? (
          <>
            Add {move.applicationLabel} to Tracker as {target}?
          </>
        ) : (
          <>
            {move.applicationLabel} is added to Tracker as {target}.
          </>
        )
      ) : question ? (
        <>
          Move {move.applicationLabel} from {move.from.label} to {target}?
        </>
      ) : (
        <>
          {move.applicationLabel} moves from {move.from.label} to {target}.
        </>
      )}
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
