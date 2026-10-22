/**
 * `ApplicationSummaryBlock` (components.md "Shared data display", apply.md "After applying"): what
 * was sent and where it stands. Shared by Job detail and Tracker detail.
 */
import { FileText } from "lucide-react";
import { useId } from "react";
import { defineMessages, useIntl } from "react-intl";
import type { ApplicationSummaryVM } from "../model/blocks";
import { cx } from "../cx";
import { RelativeTimeChip } from "./RelativeTimeChip";
import { StatusPill } from "./StatusPill";

const messages = defineMessages({
  heading: { id: "shared.ui.applicationSummaryBlock.heading", defaultMessage: "Application" },
  status: { id: "shared.ui.applicationSummaryBlock.status", defaultMessage: "Status" },
  appliedVia: { id: "shared.ui.applicationSummaryBlock.appliedVia", defaultMessage: "Applied via" },
  notRecorded: { id: "shared.ui.applicationSummaryBlock.notRecorded", defaultMessage: "Not recorded" },
  applied: {
    id: "shared.ui.applicationSummaryBlock.applied",
    defaultMessage: "Applied",
    description: "Row label: date the application was sent",
  },
  notYet: { id: "shared.ui.applicationSummaryBlock.notYet", defaultMessage: "Not yet" },
  cv: { id: "shared.ui.applicationSummaryBlock.cv", defaultMessage: "CV" },
  coverLetter: { id: "shared.ui.applicationSummaryBlock.coverLetter", defaultMessage: "Cover letter" },
  noneAttached: { id: "shared.ui.applicationSummaryBlock.noneAttached", defaultMessage: "None attached" },
  nextStep: { id: "shared.ui.applicationSummaryBlock.nextStep", defaultMessage: "What usually happens next" },
});

export interface ApplicationSummaryBlockProps {
  /** Status, channel, date, pinned documents and next step (`applicationSummaryVM`). */
  summary: ApplicationSummaryVM;
  /** Opens the pinned CV in the CV editor. Without it the CV name is plain text. */
  onOpenCv?: (cvId: string) => void;
  /** Opens the pinned cover letter. Without it the name is plain text. */
  onOpenCoverLetter?: (coverLetterId: string) => void;
  /** Heading level of "Application": 2 in a side panel, 3 under a section heading. */
  headingLevel?: 2 | 3;
  className?: string;
}

/**
 * "Application" section: a description list of Status (pill), Applied via, Applied (time), CV and
 * Cover letter (links when openable), then "What usually happens next". Missing values are said
 * in words, never left blank.
 */
export function ApplicationSummaryBlock({
  summary,
  onOpenCv,
  onOpenCoverLetter,
  headingLevel = 2,
  className,
}: ApplicationSummaryBlockProps) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const intl = useIntl();
  const { cv, coverLetter } = summary;
  const documents = [
    { key: "cv", term: intl.formatMessage(messages.cv), doc: cv, open: onOpenCv },
    {
      key: "coverLetter",
      term: intl.formatMessage(messages.coverLetter),
      doc: coverLetter,
      open: onOpenCoverLetter,
    },
  ];
  return (
    <section aria-labelledby={headingId} className={cx("flex flex-col gap-3", className)}>
      <Heading id={headingId} className="text-headline text-fg-primary">
        {intl.formatMessage(messages.heading)}
      </Heading>
      <dl className="text-callout grid grid-cols-[max-content_1fr] items-baseline gap-x-4 gap-y-2">
        <dt className="text-fg-secondary">{intl.formatMessage(messages.status)}</dt>
        <dd>
          <StatusPill status={summary.status} size="sm" />
        </dd>
        <dt className="text-fg-secondary">{intl.formatMessage(messages.appliedVia)}</dt>
        <dd className={summary.channel === null ? "text-fg-tertiary" : "text-fg-primary"}>
          {summary.channel ?? intl.formatMessage(messages.notRecorded)}
        </dd>
        <dt className="text-fg-secondary">{intl.formatMessage(messages.applied)}</dt>
        <dd className="text-fg-primary">
          {summary.appliedAt ? (
            <RelativeTimeChip time={summary.appliedAt} />
          ) : (
            <span className="text-fg-tertiary">{intl.formatMessage(messages.notYet)}</span>
          )}
        </dd>
        {documents.map(({ key, term, doc, open }) => (
          <div key={key} className="contents">
            <dt className="text-fg-secondary">{term}</dt>
            <dd className="min-w-0">
              {doc === null ? (
                <span className="text-fg-tertiary">{intl.formatMessage(messages.noneAttached)}</span>
              ) : open ? (
                <button
                  type="button"
                  className="text-accent-text inline-flex min-h-6 items-start gap-1.5 rounded-xs text-start hover:underline"
                  onClick={() => open(doc.id)}
                >
                  <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                  <span className="text-pretty">{doc.label}</span>
                </button>
              ) : (
                <span className="text-fg-primary">{doc.label}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {summary.nextStep !== null && (
        <div className="bg-surface-sunken rounded-md px-3 py-2">
          <p className="text-footnote text-fg-secondary font-medium">
            {intl.formatMessage(messages.nextStep)}
          </p>
          <p className="text-callout text-fg-primary text-pretty">{summary.nextStep}</p>
        </div>
      )}
    </section>
  );
}
