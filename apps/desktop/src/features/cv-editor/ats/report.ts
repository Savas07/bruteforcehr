/**
 * ATS round-trip report (research/cv-editor.md "Readable by ATS"): for every printed section of the
 * CV, did its heading and its key facts survive the trip through our own exported PDF, and which of
 * a pasted job description's keywords does that text cover. Pure and deterministic.
 *
 * Headings and the "Present" word come from @bfhr/cv-render, the renderer behind every export. With
 * its `outline` (what the render printed: headings and entry titles, in order) the check follows the
 * document exactly; without it, it derives the same sections from `meta.sectionOrder`.
 */
import type { CvContent, CvStandardSection } from "@bfhr/core";
import { type CvLanguage, type OutlineSection, PRESENT_WORD, SECTION_HEADINGS } from "@bfhr/cv-render";
import { extractJobKeywords, isTechToken, type JobKeyword } from "./keywords";
import { foldText, TextIndex } from "./normalize";

export type AtsSectionStatus = "ok" | "partial" | "missing";

export interface AtsSection {
  /** `basics` (the header), `summary`, a standard section or `custom:<id>`, as cv-render keys them. */
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
  readonly language: CvLanguage;
  /** `renderCvHtml(...).outline` of the render the PDF came from: check exactly what was printed. */
  readonly outline?: readonly OutlineSection[];
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
 * A date reads back when its year does: parsers key on the year, whatever the month format.
 * Shown formatted in the CV's language when missing.
 */
function date(value: string | undefined, language: CvLanguage): Fact[] {
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
function endDate(start: string | undefined, end: string | undefined, language: CvLanguage): Fact[] {
  if (end) return date(end, language);
  if (!start) return [];
  const present = PRESENT_WORD[language];
  return [{ label: present, found: (index) => index.has(present) }];
}

/** First words of the summary: enough to show the paragraph came through, robust to wrapping. */
const SUMMARY_WORDS = 8;

/** The name-and-contact header: printed first, without a heading. */
function headerFacts(content: CvContent): Fact[] {
  const { name, label, email, phone, location } = content.basics ?? {};
  return [
    ...text(name),
    ...text(label),
    ...(email?.trim() ? [{ label: email.trim(), found: (index: TextIndex) => index.hasEmail(email) }] : []),
    ...(phone?.trim() ? [{ label: phone.trim(), found: (index: TextIndex) => index.hasPhone(phone) }] : []),
    ...text(location?.city),
  ];
}

type HeadedSection = Exclude<CvStandardSection, "basics"> | "summary";

/** Key facts of a section (`summary`, a standard section or `custom:<id>`), item by item. */
function contentFacts(content: CvContent, key: string, language: CvLanguage): Fact[] {
  if (key.startsWith("custom:")) {
    const custom = content.meta.customSections.find((section) => `custom:${section.id}` === key);
    return (custom?.items ?? []).flatMap((item) => [...text(item.title), ...text(item.subtitle)]);
  }
  switch (key as HeadedSection) {
    case "summary": {
      const summary = content.basics?.summary?.trim();
      return summary ? text(summary.split(/\s+/).slice(0, SUMMARY_WORDS).join(" ")) : [];
    }
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
    default:
      return [];
  }
}

interface SectionPlan {
  readonly key: string;
  /** The heading in sentence case for the panel; `null` for the header. */
  readonly title: string | null;
  /** The heading as printed (templates may upper-case it), looked for as a line of the PDF text. */
  readonly printedHeading: string | null;
  readonly facts: readonly Fact[];
}

/** The heading cv-render prints for a section key, `null` for keys it doesn't render. */
function standardHeading(content: CvContent, key: string, language: CvLanguage): string | null {
  if (key.startsWith("custom:"))
    return (
      content.meta.customSections.find((section) => `custom:${section.id}` === key)?.title.trim() ?? null
    );
  return SECTION_HEADINGS[language][key as HeadedSection] ?? null;
}

/**
 * Printed sections in order, header first. With an outline: its sections, headings and entry
 * titles, plus the content's own facts (employer, dates, skill keywords). Without: the order
 * cv-render uses (`basics` = header, then the summary), skipping sections with nothing in them.
 */
function plan(content: CvContent, language: CvLanguage, outline?: readonly OutlineSection[]): SectionPlan[] {
  const order = [...new Set(content.meta.sectionOrder)];
  const header = order.includes("basics") ? headerFacts(content) : [];
  const plans: SectionPlan[] =
    header.length > 0 ? [{ key: "basics", title: null, printedHeading: null, facts: header }] : [];

  const sections: { key: string; heading: string | null; printed: readonly string[] }[] = outline
    ? outline.map((section) => ({ key: section.key, heading: section.heading, printed: section.entries }))
    : order
        .flatMap((key) => (key === "basics" ? ["summary"] : [key]))
        .map((key) => ({ key, heading: standardHeading(content, key, language), printed: [] }));

  for (const { key, heading, printed } of sections) {
    if (heading === null) continue;
    const seen = new Set<string>();
    const facts = [
      ...printed.flatMap((entry) => text(entry)),
      ...contentFacts(content, key, language),
    ].filter((fact) => {
      const folded = foldText(fact.label);
      if (seen.has(folded)) return false;
      seen.add(folded);
      return true;
    });
    // A section the renderer printed is checked even when it has no facts (its heading still counts).
    if (facts.length === 0 && !outline) continue;
    // Templates may print headings upper-cased ("EXPERIENCE"); the panel shows them as written.
    const written = standardHeading(content, key, language);
    const title = written !== null && foldText(written) === foldText(heading) ? written : heading;
    plans.push({ key, title, printedHeading: heading, facts });
  }
  return plans;
}

/** Inflection a keyword may carry in the CV ("API" → "APIs", "yazılım" → "yazılımları"). */
const SUFFIX_LETTERS: Readonly<Record<CvLanguage, number>> = { en: 2, de: 2, tr: 5 };

/** Keywords shorter than this match exactly: suffix tolerance would turn "Java" into "Javas…". */
const INFLECTABLE_MIN_LENGTH = 5;

function keywordCoverage(index: TextIndex, jobDescription: string, language: CvLanguage): AtsKeywordCoverage {
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

export function atsReport({
  text: pdfText,
  content,
  language,
  outline,
  jobDescription,
}: AtsReportInput): AtsReport {
  const index = new TextIndex(pdfText);
  let found = 0;
  let total = 0;
  const sections = plan(content, language, outline).map((section): AtsSection => {
    const headingFound = section.printedHeading === null ? null : index.hasLine(section.printedHeading);
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
