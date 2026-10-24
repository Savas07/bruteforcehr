/**
 * Cover letters (BRIEF §4.4): the same renderer contract as the CV (ADR 0009). One self-contained
 * HTML document with the CV's template, accent, fonts, density and page geometry, so the letter
 * and the CV look like one set. Letter layout: the CV's name and contact block as the sender, the
 * recipient and the date, an optional subject line, then the body paragraphs as written.
 */
import { escapeHtml, headerHtml, htmlDocument, inline } from "./html";
import { CV_WORDS, cvLanguage, formatDay, langTag } from "./i18n";
import { buildDocument, splitPlaceholders } from "./model";
import { stylesheet, template } from "./templates";
import { densityScale, fontPair, type PageGeometry, type PaperSize, pageGeometry, printableAccent } from "./themes";
import type { CvRenderTheme, CvResume, PlaceholderHit, TemplateId } from "./types";

export interface CoverLetterRecipient {
  readonly company: string;
  /** The hiring contact when known ("Lena Brandt"). */
  readonly contactName?: string | null;
}

export interface CoverLetterRenderInput {
  /** The sender block: the CV's `basics` (name, label, location, email, phone, links). */
  readonly basics: CvResume["basics"];
  readonly recipient: CoverLetterRecipient;
  /** Letter date as `YYYY-MM-DD`, printed in the letter's language ("24 October 2026"). */
  readonly date: string;
  /** Subject line ("Application: Product Designer"); omitted when null or blank. */
  readonly subject?: string | null;
  /** Plain text as the user wrote it: blank lines separate paragraphs, single newlines break lines. */
  readonly body: string;
  readonly templateId: TemplateId;
  readonly theme: CvRenderTheme;
  readonly paper: PaperSize;
  /** The letter's language (BCP 47): date, title, `lang`. */
  readonly locale: string;
}

export interface CoverLetterRenderResult {
  readonly html: string;
  /** "Deniz Aksoy – Cover letter"; also the `<title>` (the PDF title). */
  readonly title: string;
  readonly lang: string;
  readonly page: PageGeometry;
  /** `[X%]`-style gaps left in the subject or body (path `/subject` or `/body`). */
  readonly placeholders: readonly PlaceholderHit[];
}

const LETTER_CSS = `
.cl .cv-header{text-align:left;justify-content:flex-start}
.cl-meta{display:flex;justify-content:space-between;align-items:flex-start;gap:12pt;margin-top:28pt;break-inside:avoid;page-break-inside:avoid}
.cl-recipient{font-style:normal}
.cl-date{margin-left:auto;white-space:nowrap;color:var(--muted)}
.cl-subject{margin-top:24pt;font-weight:650}
.cl-body{margin-top:16pt}
.cl-body p+p{margin-top:calc(var(--lh) * 0.75)}
`;

/** Renders a cover letter as one self-contained HTML document (embedded fonts, no scripts, CSP). */
export function renderCoverLetterHtml(input: CoverLetterRenderInput): CoverLetterRenderResult {
  const language = cvLanguage(input.locale);
  const lang = langTag(input.locale, language);
  const templateId = template(input.templateId).id;
  const page = pageGeometry(input.paper, input.theme.density);
  const css =
    stylesheet({
      templateId,
      accent: printableAccent(input.theme.accent),
      pair: fontPair(input.theme.fontPair),
      density: densityScale(input.theme.density),
      page,
    }) + LETTER_CSS;

  // The CV's own header model: same contact order, link sanitising and country names.
  const head = buildDocument({
    resume: { basics: input.basics ?? {} },
    meta: { sectionOrder: ["basics"], customSections: [] },
    templateId,
    theme: input.theme,
    paper: input.paper,
    locale: input.locale,
  }).header;

  const recipient = [input.recipient.contactName, input.recipient.company]
    .map((line) => line?.trim() ?? "")
    .filter((line) => line !== "")
    .map((line) => `<p>${inline(line)}</p>`)
    .join("");
  const subjectText = input.subject?.trim() ?? "";
  const subject = subjectText === "" ? "" : `<p class="cl-subject">${inline(subjectText)}</p>`;
  const date = `<p class="cl-date"><time datetime="${escapeHtml(input.date)}">${escapeHtml(formatDay(input.date, language))}</time></p>`;
  const paragraphs = input.body
    .replace(/\r\n?/gu, "\n")
    .trim()
    .split(/\n\s*\n/u)
    .map((block) => `<p>${block.split("\n").map(inline).join("<br>")}</p>`)
    .join("");
  const main =
    `<main class="cv cv--${templateId} cl" data-template="${templateId}">` +
    (head ? headerHtml(head) : "") +
    `<div class="cl-meta"><address class="cl-recipient">${recipient}</address>${date}</div>` +
    subject +
    `<div class="cl-body">${paragraphs}</div></main>`;

  const name = input.basics?.name?.trim();
  const words = CV_WORDS[language];
  const title = name ? `${name} – ${words.coverLetter}` : words.coverLetter;
  return {
    html: htmlDocument(lang, title, css, main),
    title,
    lang,
    page,
    placeholders: (
      [
        ["/subject", input.subject ?? ""],
        ["/body", input.body],
      ] as const
    ).flatMap(([path, text]) =>
      splitPlaceholders(text)
        .filter((part) => part.placeholder)
        .map((part) => ({ path, text: part.text })),
    ),
  };
}
