/**
 * `SubmitPrompt` (components.md "Apply", apply.md "Did you submit?"): after "Open company site",
 * an inline banner asks whether the application went out. Never a blocking dialog. When an ATS
 * confirmation email arrives, the auto-confirmed variant replaces the question with its source and
 * Undo (system.md "Trust is visible"). The screen registers `Y` / `N`; the prompt only shows them.
 */
import { MailCheck, Undo2 } from "lucide-react";
import { useId } from "react";
import type { TimeVM } from "../model/types";
import { cx } from "../cx";
import { Button } from "./Button";
import { RelativeTimeChip } from "./RelativeTimeChip";

export interface SubmitPromptProps {
  /** Company name as shown on the job ("Acme"). */
  company: string;
  /** `asking`: the three answers. `autoConfirmed`: an email confirmed it; shows the source + Undo. */
  variant: "asking" | "autoConfirmed";
  /** "Yes, I applied" (`Y`): marks the application Applied and pins the documents used. */
  onYes: () => void;
  /** "Not yet" (`N`): stays Preparing; asked again next time the job is opened. */
  onNotYet: () => void;
  /** "I'm not applying": back to Saved. */
  onNotApplying: () => void;
  /** Auto-confirmed only: reverts the confirmation. */
  onUndo?: () => void;
  /** Auto-confirmed only: the confirming email's sender and arrival ("no-reply@greenhouse.io"). */
  confirmedBy?: { readonly sender: string; readonly at: TimeVM };
  className?: string;
}

/**
 * Asking: "Did you submit your application to Acme?" with Yes, I applied (primary, `Y`) · Not yet
 * (`N`) · I'm not applying (text button). Auto-confirmed: "Confirmed by an email from
 * no-reply@greenhouse.io" + time + Undo.
 */
export function SubmitPrompt({
  company,
  variant,
  onYes,
  onNotYet,
  onNotApplying,
  onUndo,
  confirmedBy,
  className,
}: SubmitPromptProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cx(
        "bg-surface-base border-line-subtle flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3",
        className,
      )}
    >
      {variant === "asking" ? (
        <>
          <h2 id={titleId} className="text-headline text-fg-primary min-w-0 flex-1 text-pretty">
            Did you submit your application to {company}?
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" shortcut="Y" onClick={onYes}>
              Yes, I applied
            </Button>
            <Button shortcut="N" onClick={onNotYet}>
              Not yet
            </Button>
            <Button variant="plain" onClick={onNotApplying}>
              I'm not applying
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <MailCheck
              aria-hidden="true"
              className="text-fg-secondary mt-0.5 size-4 shrink-0"
              strokeWidth={1.75}
            />
            <h2 id={titleId} className="text-callout text-fg-primary text-pretty">
              Confirmed by an email from <span className="break-all">{confirmedBy?.sender ?? company}</span>
              {confirmedBy && (
                <>
                  <span aria-hidden="true"> · </span>
                  <RelativeTimeChip time={confirmedBy.at} />
                </>
              )}
            </h2>
          </div>
          {onUndo && (
            <Button size="sm" icon={Undo2} onClick={onUndo}>
              Undo
            </Button>
          )}
        </>
      )}
    </section>
  );
}
