import { Check, PenLine } from "lucide-react";

/** `flagged`: low confidence, not yet checked; `confirmed`: the user ticked it; `edited`: the user changed it. */
export type ConfidenceState = "flagged" | "confirmed" | "edited";

export interface ConfidenceTagProps {
  /** Review state of the proposal or imported field. */
  state: ConfidenceState;
  /**
   * Why it was flagged, one short sentence ("The date in the email is unclear."). Shown after the
   * tag while `flagged`; ignored once confirmed or edited.
   */
  reason?: string | undefined;
}

/**
 * Low-confidence marker (components.md `ConfidenceTag`) on review proposals and imported fields.
 * `flagged` reads "Needs a look": amber dot + text + reason (amber means uncertainty, never error;
 * never color alone). Once the user acts it settles to a neutral "Confirmed" (✓) or "Edited" (pen).
 */
export function ConfidenceTag({ state, reason }: ConfidenceTagProps) {
  if (state === "flagged")
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="bg-warning-subtle text-warning-text inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-caption1 font-medium whitespace-nowrap">
          <span aria-hidden="true" className="bg-warning-solid size-2 shrink-0 rounded-full" />
          Needs a look
        </span>
        {reason !== undefined && <span className="text-fg-secondary text-footnote">{reason}</span>}
      </span>
    );

  const Icon = state === "confirmed" ? Check : PenLine;
  return (
    <span className="text-fg-secondary inline-flex h-5 shrink-0 items-center gap-1 text-caption1 whitespace-nowrap">
      <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
      {state === "confirmed" ? "Confirmed" : "Edited"}
    </span>
  );
}
