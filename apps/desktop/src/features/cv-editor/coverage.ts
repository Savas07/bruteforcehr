/**
 * Keyword coverage for the inspector's Check tab (research/cv-editor.md "ATS keyword-coverage
 * panel", decisions.md: keywords extracted once per job, matching against the CV deterministic,
 * so coverage updates live while typing and works offline). Facts, never grades.
 */
import { defineMessages, type IntlShape } from "react-intl";
import { draftText, type CvDraft } from "./draft";

export interface CvCoverage {
  /** Keywords counted (the job's minus those the user said they don't have). */
  readonly total: number;
  readonly covered: readonly string[];
  readonly missing: readonly string[];
  /** "Covers 3 of 5 keywords from this job". */
  readonly fact: string;
}

const messages = defineMessages({
  fact: {
    id: "cv-editor.check.fact",
    defaultMessage: "Covers {covered, number} of {total, plural, one {# keyword} other {# keywords}} from this job",
    description: "Keyword coverage fact line; never a grade",
  },
});

export function keywordCoverage(
  keywords: readonly string[],
  draft: CvDraft,
  excluded: ReadonlySet<string>,
  intl: IntlShape,
): CvCoverage {
  const text = draftText(draft);
  const counted = keywords.filter((keyword) => !excluded.has(keyword));
  const covered = counted.filter((keyword) => text.includes(keyword.toLocaleLowerCase()));
  const missing = counted.filter((keyword) => !covered.includes(keyword));
  return {
    total: counted.length,
    covered,
    missing,
    fact: intl.formatMessage(messages.fact, { covered: covered.length, total: counted.length }),
  };
}
