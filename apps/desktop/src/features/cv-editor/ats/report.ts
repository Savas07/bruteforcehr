/**
 * ATS round-trip report (research/cv-editor.md "Readable by ATS"): for every visible section of the
 * CV, did its standard heading and its key facts survive the trip through our own exported PDF,
 * and which of a pasted job description's keywords does that text cover. Pure and deterministic.
 */
import type { CvContent, CvStandardSection } from "@bfhr/core";
import { PRESENT_WORDS, STANDARD_HEADINGS, type AtsLanguage } from "./headings";
import { extractJobKeywords, isTechToken, type JobKeyword } from "./keywords";
import { foldText, TextIndex } from "./normalize";

export type AtsSectionStatus = "ok" | "partial" | "missing";

export interface AtsSection {
  /** `meta.sectionOrder` key: a standard section or `custom:<id>`. */
  readonly key: string;
  /** The heading the PDF should show (CV language); `null` for the name-and-contact header. */
  readonly title: string | null;
  readonly status: AtsSectionStatus;
  /** `null` when the section has no heading (the header). */
  readonly headingFound: boolean | null;
  /** Key facts read back, of `total`. */
  readonly found: number;
  readonly total: number;
  /** Facts not found in the PDF text, as the user wrote them (dates formatted). */
  readonly missing: readonly string[];
}

/** `null`: the CV doesn't have this detail, so there's nothing to read back. */
export interface AtsContact {
  readonly name: boolean | null;
  readonly email: boolean | null;
  readonly phone: boolean | null;
}

export interface AtsKeywordCoverage {
  readonly total: number;
  readonly matched: readonly JobKeyword[];
  readonly missing: readonly JobKeyword[];
}

export interface AtsReport {
  /** The PDF had any text at all (a scanned or outlined PDF has none). */
  readonly textFound: boolean;
  readonly sections: readonly AtsSection[];
  readonly contact: AtsContact;
  /** Headings and facts read back, 0–100. */
  readonly score: number;
  /** `null` without a job description. */
  readonly keywords: AtsKeywordCoverage | null;
}

export interface AtsReportInput {
  /** Plain text extracted from the exported PDF. */
  readonly text: string;
  readonly content: CvContent;
  /** The CV's language (headings, date words). */
  readonly language: AtsLanguage;
  readonly jobDescription?: string;
}

/** One fact to look for: what to show when it's missing, and how to find it. */
interface Fact {
  readonly label: string;
  readonly found: (index: TextIndex) => boolean;
}

const text = (value: string | undefined): Fact[] =>
  value?.trim() ? [{ label: value.trim(), found: (index) => index.has(value) }] : [];

/**
 * A date reads back when its year does: renderers print "03/2021", "Mar 2021", "März 2021" or just
 * "2021", and parsers key on the year. Shown formatted in the CV's language when missing.
 */
function date(value: string | undefined, language: AtsLanguage): Fact[] {
  if (!value) return [];
  const [year = "", month] = value.split("-");
  const label = month
    ? new Intl.DateTimeFormat(language, { month: "short", year: "numeric", timeZone: "UTC" }).format(
        new Date(Date.UTC(Number(year), Number(month) - 1, 1)),
      )
    : year;
  return [{ label, found: (index) => index.has(year) }];
}

/** The end of a date range: the end date, or the "Present" word for an ongoing one. */
function endDate(start: string | undefined, end: string | undefined, language: AtsLanguage): Fact[] {
  if (end) return date(end, language);
  if (!start) return [];
  const words = [...PRESENT_WORDS[language], ...PRESENT_WORDS.en];
  return [{ label: PRESENT_WORDS[language][0], found: (index) => words.some((word) => index.has(word)) }];
}

/** First words of the summary: enough to show the paragraph came through, robust to wrapping. */
const SUMMARY_WORDS = 8;

function basicsFacts(content: CvContent, language: AtsLanguage): { facts: Fact[]; headings: string[] } {
  const basics = content.basics ?? {};
  const summary = basics.summary?.trim();
  return {
    facts: [
      ...text(basics.name),
      ...text(basics.label),
      ...(basics.email?.trim()
        ? [{ label: basics.email.trim(), found: (index: TextIndex) => index.hasEmail(basics.email ?? "") }]
        : []),
      ...(basics.phone?.trim()
        ? [{ label: basics.phone.trim(), found: (index: TextIndex) => index.hasPhone(basics.phone ?? "") }]
        : []),
      ...text(basics.location?.city),
      ...(summary ? text(summary.split(/\s+/).slice(0, SUMMARY_WORDS).join(" ")) : []),
    ],
    // The summary paragraph sits under its own heading; the name block has none.
    headings: summary ? [...STANDARD_HEADINGS.summary[language]] : [],
  };
}

/** Key facts per standard section, item by item. */
function sectionFacts(
  content: CvContent,
  section: Exclude<CvStandardSection, "basics">,
  language: AtsLanguage,
): Fact[] {
  switch (section) {
    case "work":
      return (content.work ?? []).flatMap((item) => [
        ...text(item.position),
        ...text(item.name),
        ...date(item.startDate, language),
        ...endDate(item.startDate, item.endDate, language),
      ]);
    case "projects":
      return (content.projects ?? []).flatMap((item) => text(item.name));
    case "education":
      return (content.education ?? []).flatMap((item) => [...text(item.institution), ...text(item.area)]);
    case "skills":
      return (content.skills ?? []).flatMap((item) => [
        ...text(item.name),
        ...(item.keywords ?? []).flatMap((keyword) => text(keyword)),
      ]);
    case "languages":
      return (content.languages ?? []).flatMap((item) => text(item.language));
    case "certificates":
      return (content.certificates ?? []).flatMap((item) => text(item.name));
    case "awards":
      return (content.awards ?? []).flatMap((item) => text(item.title));
    case "publications":
      return (content.publications ?? []).flatMap((item) => text(item.name));
    case "volunteer":
      return (content.volunteer ?? []).flatMap((item) => [
        ...text(item.position),
        ...text(item.organization),
      ]);
    case "interests":
      return (content.interests ?? []).flatMap((item) => text(item.name));
    case "references":
      return (content.references ?? []).flatMap((item) => text(item.name));
  }
}

interface SectionPlan {
  readonly key: string;
  readonly title: string | null;
  /** Any one of these as a line counts; empty when the section has no heading. */
  readonly headings: readonly string[];
  readonly facts: readonly Fact[];
}

/** Visible sections in render order; sections with nothing in them aren't rendered, so skipped. */
function plan(content: CvContent, language: AtsLanguage): SectionPlan[] {
  const plans: SectionPlan[] = [];
  for (const key of new Set(content.meta.sectionOrder)) {
    if (key === "basics") {
      const { facts, headings } = basicsFacts(content, language);
      if (facts.length > 0) plans.push({ key, title: null, headings, facts });
    } else if (key.startsWith("custom:")) {
      const custom = content.meta.customSections.find((section) => `custom:${section.id}` === key);
      const facts = (custom?.items ?? []).flatMap((item) => [...text(item.title), ...text(item.subtitle)]);
      if (custom && facts.length > 0)
        plans.push({ key, title: custom.title, headings: [custom.title], facts });
    } else {
      const section = key as Exclude<CvStandardSection, "basics">;
      const facts = sectionFacts(content, section, language);
      const headings = STANDARD_HEADINGS[section][language];
      if (facts.length > 0) plans.push({ key, title: headings[0], headings, facts });
    }
  }
  return plans;
}

/** Inflection a keyword may carry in the CV ("API" → "APIs", "yazılım" → "yazılımları"). */
const SUFFIX_LETTERS: Readonly<Record<AtsLanguage, number>> = { en: 2, de: 2, tr: 5 };

/** Keywords shorter than this match exactly: suffix tolerance would turn "Java" into "Javas…". */
const INFLECTABLE_MIN_LENGTH = 5;

function keywordCoverage(
  index: TextIndex,
  jobDescription: string,
  language: AtsLanguage,
): AtsKeywordCoverage {
  const keywords = extractJobKeywords(jobDescription, language);
  const matched: JobKeyword[] = [];
  const missing: JobKeyword[] = [];
  for (const keyword of keywords) {
    const inflectable =
      !keyword.keyword.split(" ").some(isTechToken) &&
      foldText(keyword.keyword).length >= INFLECTABLE_MIN_LENGTH;
    const found = index.has(keyword.keyword, { suffixLetters: inflectable ? SUFFIX_LETTERS[language] : 0 });
    (found ? matched : missing).push(keyword);
  }
  return { total: keywords.length, matched, missing };
}

export function atsReport({ text: pdfText, content, language, jobDescription }: AtsReportInput): AtsReport {
  const index = new TextIndex(pdfText);
  let found = 0;
  let total = 0;
  const sections = plan(content, language).map((section): AtsSection => {
    const headingFound =
      section.headings.length === 0 ? null : section.headings.some((heading) => index.hasLine(heading));
    const missing = section.facts.filter((fact) => !fact.found(index)).map((fact) => fact.label);
    const factsFound = section.facts.length - missing.length;
    const checks = section.facts.length + (headingFound === null ? 0 : 1);
    const passed = factsFound + (headingFound ? 1 : 0);
    found += passed;
    total += checks;
    return {
      key: section.key,
      title: section.title,
      status: passed === checks ? "ok" : passed === 0 ? "missing" : "partial",
      headingFound,
      found: factsFound,
      total: section.facts.length,
      missing,
    };
  });

  const basics = content.basics ?? {};
  const present = (value: string | undefined): value is string => Boolean(value?.trim());
  const contact: AtsContact = {
    name: present(basics.name) ? index.has(basics.name) : null,
    email: present(basics.email) ? index.hasEmail(basics.email) : null,
    phone: present(basics.phone) ? index.hasPhone(basics.phone) : null,
  };

  const job = jobDescription?.trim();
  return {
    textFound: !index.empty,
    sections,
    contact,
    score: total === 0 ? 0 : Math.round((found / total) * 100),
    keywords: job ? keywordCoverage(index, job, language) : null,
  };
}
