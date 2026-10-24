/**
 * Onboarding step 1/3 · CV (onboarding-signin.md "Step 1/3 CV (desktop)"): import the CV the user
 * has through the CV Studio import flow (upload → `cvImport` → review), start an empty one, or
 * skip. Once a CV exists the step shows it and Continue takes over from Skip.
 */
import { CircleCheck, FilePlus2, FileUp, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";

const messages = defineMessages({
  importTitle: { id: "onboarding.cv.importTitle", defaultMessage: "Import a CV file" },
  importCaption: {
    id: "onboarding.cv.importCaption",
    defaultMessage: "PDF, Word, JSON Resume or LinkedIn export. We read it, then you check the result.",
  },
  scratchTitle: { id: "onboarding.cv.scratchTitle", defaultMessage: "Start from scratch" },
  scratchCaption: {
    id: "onboarding.cv.scratchCaption",
    defaultMessage: "An empty CV to fill in later under CVs. About 10 minutes.",
  },
  imported: { id: "onboarding.cv.imported", defaultMessage: "Imported from {fileName}" },
  blank: { id: "onboarding.cv.blank", defaultMessage: "Empty CV, ready to fill in under CVs" },
  found: {
    id: "onboarding.cv.found",
    defaultMessage:
      "{roles, plural, =0 {No job titles} one {# job title} other {# job titles}} and {languages, plural, =0 {no languages} one {# language} other {# languages}} to suggest on the next step",
    description: "What the imported CV pre-fills in the preferences step",
  },
  existing: {
    id: "onboarding.cv.existing",
    defaultMessage: "{count, plural, one {You already have a CV} other {You already have # CVs}}",
  },
  existingCaption: {
    id: "onboarding.cv.existingCaption",
    defaultMessage: "Jobs are matched against {title}.",
  },
  existingNoDefault: {
    id: "onboarding.cv.existingNoDefault",
    defaultMessage: "You can choose which one jobs are matched against under CVs.",
  },
  aiNote: {
    id: "onboarding.cv.aiNote",
    defaultMessage:
      "PDF and Word files are read by Claude, an AI, to fill in the fields. Your file stays private to your account.",
  },
});

/** A CV added during this run of the wizard. */
export type AddedCv =
  | {
      readonly kind: "import";
      readonly title: string;
      readonly fileName: string;
      readonly roles: number;
      readonly languages: number;
    }
  | { readonly kind: "blank"; readonly title: string };

export interface CvStepProps {
  readonly added: AddedCv | null;
  /** CVs the user had before onboarding (another device, a reinstall). */
  readonly existing: { readonly count: number; readonly matchingTitle: string | null };
  readonly onImport: () => void;
  readonly onStartBlank: () => void;
}

export function CvStep({ added, existing, onImport, onStartBlank }: CvStepProps) {
  const intl = useIntl();
  if (added !== null)
    return (
      <StatusCard
        title={added.title}
        lines={
          added.kind === "import"
            ? [
                intl.formatMessage(messages.imported, { fileName: added.fileName }),
                intl.formatMessage(messages.found, { roles: added.roles, languages: added.languages }),
              ]
            : [intl.formatMessage(messages.blank)]
        }
      />
    );
  return (
    <div className="flex flex-col gap-3">
      {existing.count > 0 && (
        <StatusCard
          title={intl.formatMessage(messages.existing, { count: existing.count })}
          lines={[
            existing.matchingTitle === null
              ? intl.formatMessage(messages.existingNoDefault)
              : intl.formatMessage(messages.existingCaption, { title: existing.matchingTitle }),
          ]}
        />
      )}
      <OptionRow
        icon={FileUp}
        title={intl.formatMessage(messages.importTitle)}
        caption={intl.formatMessage(messages.importCaption)}
        onClick={onImport}
      />
      <OptionRow
        icon={FilePlus2}
        title={intl.formatMessage(messages.scratchTitle)}
        caption={intl.formatMessage(messages.scratchCaption)}
        onClick={onStartBlank}
      />
      <p className="text-footnote text-fg-secondary">{intl.formatMessage(messages.aiNote)}</p>
    </div>
  );
}

/** `OptionRow` (components.md): icon, title and caption as one button. */
function OptionRow({
  icon: Icon,
  title,
  caption,
  onClick,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly caption: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-surface-base border-line-control hover:bg-surface-hover active:bg-surface-selected flex w-full cursor-default items-start gap-4 rounded-lg border p-4 text-start transition-colors duration-(--bfhr-duration-fast)"
    >
      <span className="bg-accent-subtle text-accent-text flex size-9 shrink-0 items-center justify-center rounded-md">
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body text-fg-primary font-medium">{title}</span>
        <span className="text-footnote text-fg-secondary">{caption}</span>
      </span>
    </button>
  );
}

function StatusCard({ title, lines }: { readonly title: ReactNode; readonly lines: readonly string[] }) {
  return (
    <div
      role="status"
      className="border-line-subtle bg-surface-base flex items-start gap-3 rounded-lg border p-4"
    >
      <CircleCheck
        aria-hidden="true"
        className="text-success-text mt-0.5 size-5 shrink-0"
        strokeWidth={1.75}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-body text-fg-primary font-medium break-words">{title}</p>
        {lines.map((line) => (
          <p key={line} className="text-footnote text-fg-secondary">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
