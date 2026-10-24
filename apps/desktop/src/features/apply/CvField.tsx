/**
 * The Apply panels' CV choice: each active CV (its current version) and the version tailored for
 * this job, plus "Tailor for this job" (research/apply.md "CV step"), which opens the tailor review
 * in the content area.
 */
import { Sparkles } from "lucide-react";
import { useId } from "react";
import { defineMessages, useIntl } from "react-intl";
import { Button } from "../../shared/ui/Button";
import { type ApplyDraft, cvOptionValue, type OptionVM, parseCvOption } from "./model";
import { Field, inputClass } from "./ui";

const messages = defineMessages({
  cv: { id: "apply.email.panel.cv", defaultMessage: "CV" },
  cvHint: {
    id: "apply.email.panel.cvHint",
    defaultMessage: "Its current version is attached as a PDF and kept with the application.",
  },
  cvTailoredHint: {
    id: "apply.cv.tailoredHint",
    defaultMessage: "The version tailored for this job is attached as a PDF and kept with the application.",
  },
  tailor: { id: "apply.cv.tailor", defaultMessage: "Tailor for this job" },
  tailorHint: {
    id: "apply.cv.tailorHint",
    defaultMessage: "Suggests edits based on the job description. You review each one.",
  },
  needsCv: { id: "apply.cv.needsCv", defaultMessage: "Create a CV in CVs first." },
  offline: { id: "apply.cv.offline", defaultMessage: "Tailoring needs an internet connection." },
});

export function CvField({
  options,
  draft,
  online,
  onChange,
  onTailor,
}: {
  readonly options: readonly OptionVM[];
  readonly draft: Pick<ApplyDraft, "cvId" | "cvRevisionId">;
  readonly online: boolean;
  readonly onChange: (patch: Pick<ApplyDraft, "cvId" | "cvRevisionId">) => void;
  /** Opens the tailor review for the chosen CV version. */
  readonly onTailor: () => void;
}) {
  const intl = useIntl();
  const id = useId();
  const hintId = useId();
  return (
    <div className="flex flex-col gap-2">
      <Field
        id={id}
        label={intl.formatMessage(messages.cv)}
        hint={
          options.length === 0
            ? null
            : intl.formatMessage(draft.cvRevisionId === null ? messages.cvHint : messages.cvTailoredHint)
        }
      >
        <select
          id={id}
          value={cvOptionValue(draft)}
          disabled={options.length === 0}
          aria-describedby={options.length > 0 ? `${id}-hint` : undefined}
          onChange={(event) => onChange(parseCvOption(event.target.value))}
          className={inputClass}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          size="sm"
          icon={Sparkles}
          aria-describedby={hintId}
          disabledReason={
            draft.cvId === null ? intl.formatMessage(messages.needsCv) : online ? null : intl.formatMessage(messages.offline)
          }
          onClick={onTailor}
        >
          {intl.formatMessage(messages.tailor)}
        </Button>
        <span id={hintId} className="text-fg-tertiary text-footnote min-w-0 flex-1">
          {intl.formatMessage(messages.tailorHint)}
        </span>
      </div>
    </div>
  );
}
