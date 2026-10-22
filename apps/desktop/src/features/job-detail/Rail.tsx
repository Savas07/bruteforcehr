/**
 * The job detail rail (job-detail.md "Decision — Desktop" 3 and 5): the Details card (Q&A facts,
 * "Not stated" explicit and neutral) and "Found on" (Direct from employer above Job boards, the
 * Apply listing tagged, fields that differ footnoted, ↗ links to the default browser).
 */
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Button } from "../../shared/ui/Button";
import { RelativeTimeChip } from "../../shared/ui/RelativeTimeChip";
import { SourceTag } from "../../shared/ui/SourceTag";
import type { FactVM, JobDetailCopyVM, SourceRowVM, SourcesVM } from "./model";

const messages = defineMessages({
  opensInBrowser: {
    id: "job-detail.view.opensInBrowser",
    defaultMessage: "(opens in your browser)",
    description: "Screen-reader suffix on external links",
  },
  differences: {
    id: "job-detail.view.differences",
    defaultMessage: "Shown differently here",
    description: "Label before the fields a source lists differently from the main listing",
  },
});

/** Facts the header already shows (chips, salary line); the folded grid leaves them out. */
const inHeader: Readonly<Partial<Record<FactVM["key"], true>>> = {
  salary: true,
  workMode: true,
  whereTheyHire: true,
  employmentType: true,
};

export function DetailsCard({ facts, copy }: { facts: readonly FactVM[]; copy: JobDetailCopyVM }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="border-line-subtle rounded-lg border p-4 @max-[759px]:border-0 @max-[759px]:border-y @max-[759px]:rounded-none @max-[759px]:px-0 @max-[759px]:py-3"
    >
      <h3 id={headingId} className="text-headline mb-3 @max-[759px]:sr-only">
        {copy.details}
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 @max-[759px]:grid-cols-3 @max-[759px]:gap-y-2">
        {facts.map((fact) => (
          <div
            key={fact.key}
            // Under the header the chips and salary line already say these.
            className={cx("min-w-0", inHeader[fact.key] && "@max-[759px]:hidden")}
          >
            <dt className="text-fg-secondary text-footnote">{fact.label}</dt>
            <dd className={cx("text-callout", fact.notStated && "text-fg-tertiary")}>
              {fact.time ? (
                <time dateTime={fact.time.iso} title={fact.time.absolute}>
                  {fact.value}
                </time>
              ) : (
                fact.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SourceRow({
  row,
  copy,
  onOpen,
}: {
  row: SourceRowVM;
  copy: JobDetailCopyVM;
  onOpen: (url: string) => void;
}) {
  const intl = useIntl();
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-fg-link text-callout inline-flex items-center gap-0.5 font-medium hover:underline"
          onClick={(event) => {
            event.preventDefault();
            onOpen(row.url);
          }}
        >
          {row.name}
          <ArrowUpRight aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          <span className="sr-only"> {intl.formatMessage(messages.opensInBrowser)}</span>
        </a>
        {row.posted && <RelativeTimeChip time={row.posted} />}
      </div>
      {(row.badge || row.usedForApply) && (
        <div className="flex flex-wrap gap-1">
          {row.badge && <SourceTag source={row.badge} />}
          {row.usedForApply && (
            <span className="bg-accent-subtle text-accent-text inline-flex h-5 items-center rounded-sm px-1.5 text-caption1 font-medium">
              {copy.usedForApply}
            </span>
          )}
        </div>
      )}
      {row.differences.length > 0 && (
        <div className="text-fg-secondary text-footnote">
          <span className="sr-only">{intl.formatMessage(messages.differences)}: </span>
          {row.differences.map((difference) => (
            <p key={difference}>
              <span aria-hidden="true">* </span>
              {difference}
            </p>
          ))}
        </div>
      )}
      {row.unreachable && (
        <p className="text-warning-text text-footnote flex gap-1.5">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
          {row.unreachable}
        </p>
      )}
    </li>
  );
}

export function SourcesList({
  sources,
  copy,
  onOpen,
}: {
  sources: SourcesVM;
  copy: JobDetailCopyVM;
  onOpen: (url: string) => void;
}) {
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const differs = sources.groups.some((group) => group.rows.some((row) => row.differences.length > 0));
  const shown = expanded ? sources.total : sources.collapsedCount;
  // Fill the groups in order (Direct from employer first) up to `shown` rows.
  const groups = sources.groups.map((group, index) => {
    const before = sources.groups.slice(0, index).reduce((count, previous) => count + previous.rows.length, 0);
    return { label: group.label, rows: group.rows.slice(0, Math.max(0, shown - before)) };
  });
  return (
    <section aria-labelledby={headingId} className="border-line-subtle rounded-lg border p-4">
      <h3 id={headingId} className="text-headline mb-1">
        {sources.title}
      </h3>
      {groups.map(({ label, rows }) => {
        if (rows.length === 0) return null;
        return (
          <div key={label} className="mt-2">
            <h4 className="text-fg-secondary text-footnote font-medium">{label}</h4>
            <ul className="divide-line-subtle divide-y">
              {rows.map((row) => (
                <SourceRow key={row.key} row={row} copy={copy} onOpen={onOpen} />
              ))}
            </ul>
          </div>
        );
      })}
      {sources.showAllLabel && (
        <Button size="sm" variant="plain" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? copy.showLess : sources.showAllLabel}
        </Button>
      )}
      <p className="text-fg-tertiary text-footnote border-line-subtle mt-3 border-t pt-3">
        {differs && <span aria-hidden="true">* </span>}
        {copy.sourcesFootnote}
      </p>
    </section>
  );
}
