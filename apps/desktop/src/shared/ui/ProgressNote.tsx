/**
 * `ProgressNote` (states.md rule 4): a labelled wait for AI or server work. It names the work
 * ("Checking how this job fits your CV…"), optionally lists steps, and after `timing.longWait`
 * (10 s) adds that it can take up to a minute. Never blocks navigation; no fake percentages.
 */
import { timing } from "@bfhr/ui-tokens";
import { Check, Circle, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "../cx";

const LONG_WAIT = "This can take up to a minute. You can keep working; we'll show it here.";

/** One step of a multi-step wait. */
export interface ProgressStep {
  /** "Finding sections…". */
  readonly label: string;
  readonly state: "done" | "active" | "pending";
}

/** A named wait, announced politely, with the long-wait line after 10 s. */
export function ProgressNote({
  label,
  steps,
  startedAt,
  className,
}: {
  /** The work, with an ellipsis: "Reading your CV…". */
  label: string;
  /** Step list for imports and other staged work. */
  steps?: readonly ProgressStep[];
  /** When the work started, so the 10 s line survives remounts. Default: when this mounted. */
  startedAt?: Date;
  /** Layout classes. */
  className?: string;
}) {
  const [long, setLong] = useState(false);
  useEffect(() => {
    const started = startedAt?.getTime() ?? Date.now();
    const id = setTimeout(() => setLong(true), Math.max(0, started + timing.longWait - Date.now()));
    return () => clearTimeout(id);
  }, [startedAt]);

  return (
    <div role="status" className={cx("flex flex-col gap-2", className)}>
      <p className="text-callout text-fg-primary flex items-center gap-2">
        <LoaderCircle
          aria-hidden="true"
          className="text-fg-tertiary size-4 shrink-0 motion-safe:animate-spin"
          strokeWidth={1.75}
        />
        {label}
      </p>
      {steps && steps.length > 0 && (
        <ol className="flex flex-col gap-1 pl-6">
          {steps.map((step) => (
            <li
              key={step.label}
              aria-current={step.state === "active" ? "step" : undefined}
              className={cx(
                "text-footnote flex items-center gap-2",
                step.state === "pending"
                  ? "text-fg-tertiary"
                  : step.state === "done"
                    ? "text-fg-secondary"
                    : "text-fg-primary",
              )}
            >
              {step.state === "done" ? (
                <Check aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
              ) : step.state === "active" ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3.5 shrink-0 motion-safe:animate-spin"
                  strokeWidth={1.75}
                />
              ) : (
                <Circle aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
              )}
              {step.state === "done" && <span className="sr-only">Done: </span>}
              {step.label}
            </li>
          ))}
        </ol>
      )}
      {long && <p className="text-footnote text-fg-secondary">{LONG_WAIT}</p>}
    </div>
  );
}
