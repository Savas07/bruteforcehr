/**
 * `ApplicationSummaryBlock` (components.md "Shared data display", apply.md "After applying"): what
 * was sent and where it stands. Shared by Job detail and Tracker detail.
 */
import { FileText } from "lucide-react";
import { useId } from "react";
import type { ApplicationSummaryVM } from "../model/blocks";
import { cx } from "../cx";
import { RelativeTimeChip } from "./RelativeTimeChip";
import { StatusPill } from "./StatusPill";

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
  const { cv, coverLetter } = summary;
  const documents = [
    { term: "CV", doc: cv, open: onOpenCv },
    { term: "Cover letter", doc: coverLetter, open: onOpenCoverLetter },
  ];
  return (
    <section aria-labelledby={headingId} className={cx("flex flex-col gap-3", className)}>
      <Heading id={headingId} className="text-headline text-fg-primary">
        Application
      </Heading>
      <dl className="text-callout grid grid-cols-[max-content_1fr] items-baseline gap-x-4 gap-y-2">
        <dt className="text-fg-secondary">Status</dt>
        <dd>
          <StatusPill status={summary.status} size="sm" />
        </dd>
        <dt className="text-fg-secondary">Applied via</dt>
        <dd className={summary.channel === null ? "text-fg-tertiary" : "text-fg-primary"}>
          {summary.channel ?? "Not recorded"}
        </dd>
        <dt className="text-fg-secondary">Applied</dt>
        <dd className="text-fg-primary">
          {summary.appliedAt ? (
            <RelativeTimeChip time={summary.appliedAt} />
          ) : (
            <span className="text-fg-tertiary">Not yet</span>
          )}
        </dd>
        {documents.map(({ term, doc, open }) => (
          <div key={term} className="contents">
            <dt className="text-fg-secondary">{term}</dt>
            <dd className="min-w-0">
              {doc === null ? (
                <span className="text-fg-tertiary">None attached</span>
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
          <p className="text-footnote text-fg-secondary font-medium">What usually happens next</p>
          <p className="text-callout text-fg-primary text-pretty">{summary.nextStep}</p>
        </div>
      )}
    </section>
  );
}
