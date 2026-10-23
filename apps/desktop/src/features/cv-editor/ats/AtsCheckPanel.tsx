/**
 * ATS check for the inspector's Check tab (research/cv-editor.md "Readable by ATS" + "ATS
 * keyword-coverage panel"): exports the CV as our own PDF, reads the text back with pdf.js and
 * shows, per section, whether its heading and key facts survived; a pasted job description gives
 * keyword coverage against that same text. Facts, never grades: fractions, a neutral bar, status
 * as icon + text. Sized for the ~360 px inspector.
 */
import type { CvContent } from "@bfhr/core";
import type { CvLanguage, OutlineSection } from "@bfhr/cv-render";
import { Check, ChevronDown, CircleCheck, CircleX, Plus, TriangleAlert, type LucideIcon } from "lucide-react";
import { Collapsible } from "radix-ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../../shared/cx";
import { Button, IconButton } from "../../../shared/ui/Button";
import { InlineAlert } from "../../../shared/ui/InlineAlert";
import { ProgressNote } from "../../../shared/ui/ProgressNote";
import { extractPdfText } from "./extract";
import type { JobKeyword } from "./keywords";
import { atsReport, type AtsContact, type AtsSection, type AtsSectionStatus } from "./report";

const messages = defineMessages({
  heading: { id: "cv-editor.ats.heading", defaultMessage: "Readable by application systems" },
  intro: {
    id: "cv-editor.ats.intro",
    defaultMessage: "Exports your CV as a PDF and reads it back the way application systems do.",
  },
  run: { id: "cv-editor.ats.run", defaultMessage: "Run check" },
  again: { id: "cv-editor.ats.again", defaultMessage: "Check again" },
  running: { id: "cv-editor.ats.running", defaultMessage: "Checking your PDF…" },
  stepExport: { id: "cv-editor.ats.step.export", defaultMessage: "Creating the PDF" },
  stepRead: { id: "cv-editor.ats.step.read", defaultMessage: "Reading its text" },
  failedExport: { id: "cv-editor.ats.failed.export", defaultMessage: "Couldn't create the PDF." },
  failedRead: { id: "cv-editor.ats.failed.read", defaultMessage: "Couldn't read the PDF's text." },
  failedBody: {
    id: "cv-editor.ats.failed.body",
    defaultMessage: "Nothing changed in your CV. Try again in a moment.",
  },
  tryAgain: { id: "cv-editor.ats.tryAgain", defaultMessage: "Try again" },
  stale: { id: "cv-editor.ats.stale", defaultMessage: "You've edited your CV since this check." },
  noText: { id: "cv-editor.ats.noText.title", defaultMessage: "No text found in the PDF." },
  noTextBody: {
    id: "cv-editor.ats.noText.body",
    defaultMessage: "Application systems would see empty pages. Check again after your next export.",
  },
  summary: {
    id: "cv-editor.ats.summary",
    defaultMessage:
      "{found, number} of {total, plural, one {# section} other {# sections}} read back from the PDF.",
    description: "ATS round-trip fact line; never a grade",
  },
  contactHeading: { id: "cv-editor.ats.contact.heading", defaultMessage: "Contact details" },
  contactName: { id: "cv-editor.ats.contact.name", defaultMessage: "Name" },
  contactEmail: { id: "cv-editor.ats.contact.email", defaultMessage: "Email" },
  contactPhone: { id: "cv-editor.ats.contact.phone", defaultMessage: "Phone" },
  sectionsHeading: { id: "cv-editor.ats.sections.heading", defaultMessage: "Sections" },
  basicsTitle: { id: "cv-editor.ats.sections.basics", defaultMessage: "Name and contact details" },
  statusOk: { id: "cv-editor.ats.status.ok", defaultMessage: "Read back" },
  statusPartial: { id: "cv-editor.ats.status.partial", defaultMessage: "Partly read back" },
  statusMissing: { id: "cv-editor.ats.status.missing", defaultMessage: "Not found" },
  headingMissing: {
    id: "cv-editor.ats.headingMissing",
    defaultMessage: "The heading “{heading}” wasn't found. Parsers use standard headings to find sections.",
  },
  factsMissing: { id: "cv-editor.ats.factsMissing", defaultMessage: "Not in the PDF text: {items}" },
  parserSees: { id: "cv-editor.ats.parserSees", defaultMessage: "What a parser sees" },
  parserText: {
    id: "cv-editor.ats.parserText",
    defaultMessage: "Text read from the PDF, {pages, plural, one {# page} other {# pages}}",
  },
  jobHeading: { id: "cv-editor.ats.job.heading", defaultMessage: "Job description" },
  jobHint: {
    id: "cv-editor.ats.job.hint",
    defaultMessage: "Paste a job posting to see which of its keywords your PDF covers.",
  },
  jobNeedsCheck: {
    id: "cv-editor.ats.job.needsCheck",
    defaultMessage: "Run the check to compare these keywords with your PDF.",
  },
  noKeywords: { id: "cv-editor.ats.job.noKeywords", defaultMessage: "No keywords found in this text yet." },
  coverage: {
    id: "cv-editor.ats.coverage",
    defaultMessage:
      "Covers {covered, number} of {total, plural, one {# keyword} other {# keywords}} from this job",
    description: "Keyword coverage fact line; never a grade",
  },
  missingHeading: { id: "cv-editor.ats.keywords.missing", defaultMessage: "Missing ({count, number})" },
  coveredHeading: { id: "cv-editor.ats.keywords.covered", defaultMessage: "Covered ({count, number})" },
  mentioned: {
    id: "cv-editor.ats.keywords.mentioned",
    defaultMessage: "{count, plural, one {mentioned once} other {mentioned # times}}",
  },
  inPdf: { id: "cv-editor.ats.keywords.inPdf", defaultMessage: "in your PDF" },
  addToSkills: { id: "cv-editor.ats.keywords.add", defaultMessage: "Add “{keyword}” to Skills" },
  added: { id: "cv-editor.ats.keywords.added", defaultMessage: "added to Skills" },
  addedNote: {
    id: "cv-editor.ats.keywords.addedNote",
    defaultMessage: "Added to Skills. Check again to see them in your PDF.",
  },
  disclaimer: {
    id: "cv-editor.ats.disclaimer",
    defaultMessage: "Keyword checks are a guide, not a guarantee.",
  },
});

type Stage = "export" | "read";

type Run =
  | { readonly state: "idle" }
  | { readonly state: "running"; readonly stage: Stage; readonly startedAt: Date }
  | { readonly state: "failed"; readonly stage: Stage }
  | {
      readonly state: "done";
      readonly text: string;
      readonly pages: number;
      /** The outline of the render behind the PDF, when the caller passed one. */
      readonly outline: readonly OutlineSection[] | undefined;
      /** The content the PDF was made from: the round-trip compares against this. */
      readonly content: CvContent;
    };

// Icon shape + text carry the status; no red: something not read back is a thing to fix, not an
// error (system.md "Calm"). Amber for both partial and missing, told apart by icon and label.
const statusIcon: Record<AtsSectionStatus, { icon: LucideIcon; className: string }> = {
  ok: { icon: CircleCheck, className: "text-success-text" },
  partial: { icon: TriangleAlert, className: "text-warning-text" },
  missing: { icon: CircleX, className: "text-warning-text" },
};

const statusLabel = {
  ok: messages.statusOk,
  partial: messages.statusPartial,
  missing: messages.statusMissing,
} as const;

function SubHeading({ children }: { children: string }) {
  return <h4 className="text-fg-secondary mb-2 text-footnote font-semibold">{children}</h4>;
}

function StatusLine({ status, label }: { status: AtsSectionStatus; label: string }) {
  const intl = useIntl();
  const { icon: Icon, className } = statusIcon[status];
  return (
    <span className="flex items-start gap-2">
      <Icon aria-hidden="true" className={cx("mt-0.5 size-4 shrink-0", className)} strokeWidth={1.75} />
      <span className="min-w-0 flex-1 text-callout">
        {label}
        <span className="text-fg-secondary"> · {intl.formatMessage(statusLabel[status])}</span>
      </span>
    </span>
  );
}

function ContactRow({ contact }: { contact: AtsContact }) {
  const intl = useIntl();
  const rows = (
    [
      ["name", messages.contactName],
      ["email", messages.contactEmail],
      ["phone", messages.contactPhone],
    ] as const
  ).filter(([field]) => contact[field] !== null);
  if (rows.length === 0) return null;
  return (
    <section>
      <SubHeading>{intl.formatMessage(messages.contactHeading)}</SubHeading>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {rows.map(([field, label]) => (
          <li key={field}>
            <StatusLine status={contact[field] ? "ok" : "missing"} label={intl.formatMessage(label)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionRow({ section }: { section: AtsSection }) {
  const intl = useIntl();
  return (
    <li className="flex flex-col gap-1 py-2">
      <StatusLine status={section.status} label={section.title ?? intl.formatMessage(messages.basicsTitle)} />
      {section.headingFound === false && section.title !== null && (
        <p className="text-fg-secondary pl-6 text-footnote">
          {intl.formatMessage(messages.headingMissing, { heading: section.title })}
        </p>
      )}
      {section.missing.length > 0 && (
        <p className="text-fg-secondary pl-6 text-footnote break-words">
          {intl.formatMessage(messages.factsMissing, {
            items: intl.formatList(section.missing, { type: "unit" }),
          })}
        </p>
      )}
    </li>
  );
}

function KeywordChip({
  keyword,
  covered,
  added,
  onAdd,
}: {
  keyword: JobKeyword;
  covered: boolean;
  added: boolean;
  onAdd: ((keyword: string) => void) | undefined;
}) {
  const intl = useIntl();
  return (
    <li
      className={cx(
        "border-line-subtle flex h-7 max-w-full items-center gap-1 rounded-full border pl-2.5 text-footnote",
        covered || added || !onAdd ? "pr-2.5" : "pr-0.5",
      )}
    >
      {(covered || added) && (
        <Check aria-hidden="true" className="text-success-text size-3.5 shrink-0" strokeWidth={1.75} />
      )}
      <span className="truncate">{keyword.keyword}</span>
      {keyword.count > 1 && (
        <span aria-hidden="true" className="text-fg-tertiary tabular-nums">
          {keyword.count}×
        </span>
      )}
      <span className="sr-only">
        {[
          keyword.count > 1 ? intl.formatMessage(messages.mentioned, { count: keyword.count }) : null,
          covered ? intl.formatMessage(messages.inPdf) : null,
          added ? intl.formatMessage(messages.added) : null,
        ]
          .filter(Boolean)
          .map((part) => `, ${part}`)
          .join("")}
      </span>
      {!covered && !added && onAdd && (
        <IconButton
          icon={Plus}
          size="sm"
          className="rounded-full"
          label={intl.formatMessage(messages.addToSkills, { keyword: keyword.keyword })}
          onClick={() => onAdd(keyword.keyword)}
        />
      )}
    </li>
  );
}

export interface AtsCheckPanelProps {
  /** Renders the CV exactly as the user would export it. */
  readonly makePdf: () => Promise<Uint8Array>;
  /** The CV being edited; a check compares against the content its PDF was made from. */
  readonly content: CvContent;
  /** The CV's language (standard headings, date words). */
  readonly language: CvLanguage;
  /**
   * `renderCvHtml(...).outline` for `content`, as `makePdf` renders it: the check then follows the
   * printed headings and entry titles exactly. Without it, sections come from `meta.sectionOrder`.
   */
  readonly outline?: readonly OutlineSection[];
  /** Adds a missing job keyword to the CV's skills. Without it, missing keywords are listed only. */
  readonly onAddKeyword?: (keyword: string) => void;
}

export function AtsCheckPanel({ makePdf, content, language, outline, onAddKeyword }: AtsCheckPanelProps) {
  const intl = useIntl();
  const headingId = useId();
  const jobId = useId();
  const jobHintId = useId();
  const [run, setRun] = useState<Run>({ state: "idle" });
  const [jobDescription, setJobDescription] = useState("");
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [textOpen, setTextOpen] = useState(false);
  // Each check gets a number; a result from an older (or unmounted) check is dropped.
  const generation = useRef(0);
  useEffect(() => () => void (generation.current += 1), []);

  const check = async (): Promise<void> => {
    const current = ++generation.current;
    const snapshot = { content, outline };
    let stage: Stage = "export";
    setRun({ state: "running", stage, startedAt: new Date() });
    try {
      const bytes = await makePdf();
      if (generation.current !== current) return;
      stage = "read";
      setRun((previous) => (previous.state === "running" ? { ...previous, stage } : previous));
      const { pages, text } = await extractPdfText(bytes);
      if (generation.current !== current) return;
      setAdded(new Set());
      setRun({ state: "done", text, pages: pages.length, ...snapshot });
    } catch (error) {
      console.error(`ATS check failed (${stage})`, error);
      if (generation.current === current) setRun({ state: "failed", stage });
    }
  };

  const done = run.state === "done" ? run : null;
  const report = useMemo(
    () =>
      done &&
      atsReport({
        text: done.text,
        content: done.content,
        language,
        jobDescription,
        ...(done.outline && { outline: done.outline }),
      }),
    [done, language, jobDescription],
  );
  const okSections = report?.sections.filter((section) => section.status === "ok").length ?? 0;
  const summary =
    report && intl.formatMessage(messages.summary, { found: okSections, total: report.sections.length });
  const keywords = report?.keywords ?? null;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <div>
          <h3 id={headingId} className="text-fg-secondary mb-1 text-footnote font-semibold">
            {intl.formatMessage(messages.heading)}
          </h3>
          <p className="text-fg-secondary text-footnote">{intl.formatMessage(messages.intro)}</p>
        </div>
        {run.state === "running" ? (
          <ProgressNote
            label={intl.formatMessage(messages.running)}
            startedAt={run.startedAt}
            steps={[
              {
                label: intl.formatMessage(messages.stepExport),
                state: run.stage === "export" ? "active" : "done",
              },
              {
                label: intl.formatMessage(messages.stepRead),
                state: run.stage === "read" ? "active" : "pending",
              },
            ]}
          />
        ) : (
          <Button
            variant={run.state === "idle" ? "primary" : "secondary"}
            className="self-start"
            onClick={() => void check()}
          >
            {intl.formatMessage(
              run.state === "idle"
                ? messages.run
                : run.state === "failed"
                  ? messages.tryAgain
                  : messages.again,
            )}
          </Button>
        )}
        {run.state === "failed" && (
          <InlineAlert
            tone="error"
            fromAction
            title={intl.formatMessage(run.stage === "export" ? messages.failedExport : messages.failedRead)}
          >
            {intl.formatMessage(messages.failedBody)}
          </InlineAlert>
        )}
        {/* Announces the outcome once; the lists below are read on demand. */}
        <p role="status" className="sr-only">
          {summary ?? ""}
        </p>
        {done && report && (
          <>
            {done.content !== content && (
              <InlineAlert tone="info" title={intl.formatMessage(messages.stale)} />
            )}
            {!report.textFound ? (
              <InlineAlert tone="warning" title={intl.formatMessage(messages.noText)}>
                {intl.formatMessage(messages.noTextBody)}
              </InlineAlert>
            ) : (
              <p aria-hidden="true" className="text-callout">
                {summary}
              </p>
            )}
            <ContactRow contact={report.contact} />
            {report.sections.length > 0 && (
              <section>
                <SubHeading>{intl.formatMessage(messages.sectionsHeading)}</SubHeading>
                <ul className="divide-line-subtle flex flex-col divide-y">
                  {report.sections.map((section) => (
                    <SectionRow key={section.key} section={section} />
                  ))}
                </ul>
              </section>
            )}
            <Collapsible.Root open={textOpen} onOpenChange={setTextOpen}>
              <Collapsible.Trigger asChild>
                <Button size="sm" variant="plain" className="-ml-2">
                  {intl.formatMessage(messages.parserSees)}
                  <ChevronDown
                    aria-hidden="true"
                    className={cx(
                      "ml-1 inline size-3.5 transition-transform duration-(--bfhr-duration-fast)",
                      textOpen && "rotate-180",
                    )}
                    strokeWidth={1.75}
                  />
                </Button>
              </Collapsible.Trigger>
              <Collapsible.Content>
                {/* Focusable so the scrollable text can be read and scrolled from the keyboard. */}
                <pre
                  tabIndex={0}
                  aria-label={intl.formatMessage(messages.parserText, { pages: done.pages })}
                  className="bg-surface-sunken border-line-subtle mt-2 max-h-80 overflow-auto rounded-md border p-2 font-mono text-caption1 break-words whitespace-pre-wrap"
                >
                  {done.text}
                </pre>
              </Collapsible.Content>
            </Collapsible.Root>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <label htmlFor={jobId} className="text-fg-secondary text-footnote font-semibold">
          {intl.formatMessage(messages.jobHeading)}
        </label>
        <textarea
          id={jobId}
          aria-describedby={jobHintId}
          rows={5}
          value={jobDescription}
          onChange={(event) => setJobDescription(event.target.value)}
          className="border-line-control bg-surface-base -mt-2 w-full resize-y rounded-md border px-2 py-1.5 text-callout leading-snug"
        />
        <p id={jobHintId} className="text-fg-secondary -mt-1 text-footnote">
          {intl.formatMessage(
            jobDescription.trim() !== "" && !done ? messages.jobNeedsCheck : messages.jobHint,
          )}
        </p>
        {keywords && keywords.total === 0 && (
          <p className="text-fg-tertiary text-footnote">{intl.formatMessage(messages.noKeywords)}</p>
        )}
        {keywords && keywords.total > 0 && (
          <>
            <div>
              <p className="text-callout">
                {intl.formatMessage(messages.coverage, {
                  covered: keywords.matched.length,
                  total: keywords.total,
                })}
              </p>
              {/* Neutral bar: a fact, never a grade colour. */}
              <div aria-hidden="true" className="bg-line-subtle mt-2 h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-fg-secondary h-full rounded-full"
                  style={{ width: `${(keywords.matched.length / keywords.total) * 100}%` }}
                />
              </div>
            </div>
            {keywords.missing.length > 0 && (
              <section>
                <SubHeading>
                  {intl.formatMessage(messages.missingHeading, { count: keywords.missing.length })}
                </SubHeading>
                <ul className="flex flex-wrap gap-1.5">
                  {keywords.missing.map((keyword) => (
                    <KeywordChip
                      key={keyword.keyword}
                      keyword={keyword}
                      covered={false}
                      added={added.has(keyword.keyword)}
                      onAdd={
                        onAddKeyword &&
                        ((value) => {
                          onAddKeyword(value);
                          setAdded((previous) => new Set(previous).add(value));
                        })
                      }
                    />
                  ))}
                </ul>
                {added.size > 0 && (
                  <p role="status" className="text-fg-secondary mt-2 text-footnote">
                    {intl.formatMessage(messages.addedNote)}
                  </p>
                )}
              </section>
            )}
            {keywords.matched.length > 0 && (
              <section>
                <SubHeading>
                  {intl.formatMessage(messages.coveredHeading, { count: keywords.matched.length })}
                </SubHeading>
                <ul className="flex flex-wrap gap-1.5">
                  {keywords.matched.map((keyword) => (
                    <KeywordChip
                      key={keyword.keyword}
                      keyword={keyword}
                      covered
                      added={false}
                      onAdd={undefined}
                    />
                  ))}
                </ul>
              </section>
            )}
            <p className="text-fg-tertiary text-caption1">{intl.formatMessage(messages.disclaimer)}</p>
          </>
        )}
      </section>
    </div>
  );
}
