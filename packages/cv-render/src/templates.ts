/**
 * The three ATS-safe templates. All of them are one column of real text in DOM reading order,
 * standard section headings, no tables, no text in images, no multi-column layout; they differ in
 * header alignment, heading style, entry layout and spacing only.
 */
import { EMBEDDED_FONTS } from "./fonts.generated";
import type { CvLanguage } from "./i18n";
import { type DensityScale, type FontPairDefinition, type PageGeometry, PT_PER_MM } from "./themes";
import type { TemplateId } from "./types";

type Localized = Readonly<Record<CvLanguage, string>>;

interface TemplateDefinition {
  readonly id: TemplateId;
  readonly name: Localized;
  readonly description: Localized;
  /** Headings printed in capitals (done in the text, Turkish-aware; see `upperCase`). */
  readonly upperCaseHeadings: boolean;
}

export const TEMPLATES: readonly TemplateDefinition[] = [
  {
    id: "classic",
    name: { en: "Classic", tr: "Klasik", de: "Klassisch" },
    description: {
      en: "Single column · Centred header · Ruled headings",
      tr: "Tek sütun · Ortalı başlık · Çizgili bölüm başlıkları",
      de: "Einspaltig · Zentrierter Kopf · Überschriften mit Linie",
    },
    upperCaseHeadings: true,
  },
  {
    id: "modern",
    name: { en: "Modern", tr: "Modern", de: "Modern" },
    description: {
      en: "Single column · Accent name · Open headings",
      tr: "Tek sütun · Vurgulu ad · Sade bölüm başlıkları",
      de: "Einspaltig · Name in Akzentfarbe · Offene Überschriften",
    },
    upperCaseHeadings: false,
  },
  {
    id: "compact",
    name: { en: "Compact", tr: "Kompakt", de: "Kompakt" },
    description: {
      en: "Single column · Dense · Fits more on one page",
      tr: "Tek sütun · Sık · Tek sayfaya daha çok sığar",
      de: "Einspaltig · Dicht · Mehr Inhalt auf einer Seite",
    },
    upperCaseHeadings: true,
  },
];

export function template(id: string): TemplateDefinition {
  return TEMPLATES.find((candidate) => candidate.id === id) ?? (TEMPLATES[0] as TemplateDefinition);
}

export function listTemplates(locale?: string): Array<{ id: TemplateId; name: string; description: string }> {
  const base = (locale ?? "en").toLowerCase().split(/[-_]/u)[0];
  const language: CvLanguage = base === "tr" || base === "de" ? base : "en";
  return TEMPLATES.map((item) => ({
    id: item.id,
    name: item.name[language],
    description: item.description[language],
  }));
}

function fontFaces(pair: FontPairDefinition): string {
  const ids = pair.heading === pair.body ? [pair.body] : [pair.heading, pair.body];
  return ids
    .map((id) => {
      const font = EMBEDDED_FONTS[id];
      const faces = font.faces.map(
        (face) =>
          `@font-face{font-family:"CV ${font.family}";font-style:normal;font-weight:${font.weights};font-display:block;` +
          `src:url(data:font/woff2;base64,${face.woff2Base64}) format("woff2");unicode-range:${face.unicodeRange}}`,
      );
      return `/* ${font.family} ${font.version}. ${font.copyright}. SIL Open Font License 1.1 (https://openfontlicense.org). */\n${faces.join("\n")}`;
    })
    .join("\n");
}

const pt = (value: number) => `${Math.round(value * 100) / 100}pt`;

/**
 * Space (pt) moved from a section's top margin into its heading's top padding. WebKit's print painter
 * draws every line whose glyph ink reaches into a page, and a heading line's ascenders and accents
 * (Ä, İ) rise above its line box. A heading that pagination pushed to the top of the next page
 * therefore poked into the page before, where it was clipped but still written to the PDF text layer
 * ("LANGUAGES" twice for an ATS). Padding keeps the ink inside the heading's own box, which starts
 * on the new page; the visible spacing is unchanged except at a page top.
 */
const HEADING_INK_PAD = 3;

/**
 * `font-size` plus a `line-height` of `ratio` × size, snapped to a multiple of 0.8 pt. WebKit floors
 * every line box to whole layout px, and a WebKit print px is 0.8 pt (see the zoom note below), so
 * an unsnapped 13.8 pt line printed as 13.6 pt in WebKit but 13.8 pt in Chromium: a full page drifted
 * ~9 pt apart. Multiples of 0.8 pt are whole px in WebKit and exact in Chromium.
 */
const lineHeight = (sizePt: number, ratio: number) => `${(Math.round((sizePt * ratio) / 0.8) * 8) / 10}pt`;
const type = (sizePt: number, ratio: number) =>
  `font-size:${pt(sizePt)};line-height:${lineHeight(sizePt, ratio)}`;

export interface StyleInput {
  readonly templateId: TemplateId;
  readonly accent: string;
  readonly pair: FontPairDefinition;
  readonly density: DensityScale;
  readonly page: PageGeometry;
}

/** The whole stylesheet: fonts, page box, shared rules, then the template's own rules. */
export function stylesheet({ templateId, accent, pair, density, page }: StyleInput): string {
  const m = page.marginsMm;
  const f = density.fontPt * (templateId === "compact" ? 0.93 : 1);
  const s = density.space * (templateId === "compact" ? 0.8 : 1);
  const lh = density.lineHeight;
  const headingFont = `"CV ${EMBEDDED_FONTS[pair.heading].family}", ${pair.headingFallback}`;
  const bodyFont = `"CV ${EMBEDDED_FONTS[pair.body].family}", ${pair.bodyFallback}`;
  // Text-layer safety for ATS parsers: no ligatures (an "fi" glyph can extract as one odd char),
  // no hyphenation (breaks words in the text layer), and no Turkish `locl` glyph variants:
  // Chromium honours `font-feature-settings`, WebKit/CoreText only `-webkit-locale` (with lang="tr"
  // Quartz writes the i.TRK glyph without a ToUnicode entry, so "Deniz" extracted as "Den$z").
  // `lang` stays the CV language for screen readers.
  //
  // WebKit prints (macOS NSPrintOperation, iOS UIPrintPageRenderer) lay the page out 1.25× wider in
  // CSS px than the paper's points (WebCore PrintContext's minimum shrink factor), so 1 CSS px
  // prints as 0.8 pt instead of 0.75 pt and every CV came out 6.7 % larger than in Chromium, with
  // different page breaks. `zoom: 0.9375` (0.75 / 0.8) restores true sizes; the @supports test
  // matches WebKit only (`-webkit-nbsp-mode` exists nowhere else).
  const shared = `
@page{size:${page.paper === "letter" ? "letter" : "A4"};margin:${pt(m.top * PT_PER_MM)} ${pt(m.right * PT_PER_MM)} ${pt(m.bottom * PT_PER_MM)} ${pt(m.left * PT_PER_MM)}}
:root{--accent:${accent};--ink:#1B1F24;--muted:#4B5261;--rule:#C3C9D2;--f:${pt(f)};--lh:${lineHeight(f, lh)}}
*,*::before,*::after{box-sizing:border-box}
html{background:transparent;-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;color:var(--ink);font-family:${bodyFont};font-size:var(--f);line-height:var(--lh);font-kerning:normal;font-variant-ligatures:none;font-feature-settings:"locl" 0;-webkit-locale:"en";font-synthesis:none;hyphens:manual;-webkit-hyphens:manual;overflow-wrap:break-word;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cv{width:${page.widthMm}mm;min-height:${page.heightMm}mm;margin:0 auto;padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;background:#fff}
@media print{html,body{background:#fff}.cv{width:auto;min-height:0;margin:0;padding:0}}
@media print{@supports (-webkit-nbsp-mode:space){.cv{zoom:0.9375}}}
h1,h2,h3,p,ul{margin:0;padding:0}
a{color:inherit;text-decoration:none}
.cv-header{display:flex;gap:${pt(12 * s)};align-items:flex-start;break-inside:avoid;page-break-inside:avoid}
.cv-id{flex:1 1 auto;min-width:0}
.cv-name{font-family:${headingFont};font-weight:650;letter-spacing:-0.005em}
.cv-label{margin-top:${pt(2 * s)}}
.cv-contact,.cv-personal{margin-top:${pt(4 * s)};color:var(--muted);${type(f * 0.92, lh)}}
.cv-contact>[data-cv-path]{white-space:nowrap}
.cv-sep{padding:0 0.1em}
.cv-photo{flex:0 0 auto;width:30mm;height:40mm;object-fit:cover;border-radius:1.5mm}
.cv-keep,.cv-entry-top{break-inside:avoid;page-break-inside:avoid}
.cv-section{margin-top:${pt(13 * s - HEADING_INK_PAD)}}
.cv-heading{font-family:${headingFont};color:var(--accent);font-weight:700;padding-top:${pt(HEADING_INK_PAD)};break-inside:avoid}
.cv-entry{margin-top:${pt(8 * s)}}
.cv-heading+.cv-entry,.cv-heading+.cv-text,.cv-heading+.cv-lines{margin-top:${pt(6 * s)}}
.cv-entry-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;column-gap:${pt(10)};break-inside:avoid}
.cv-entry-title{font-family:${bodyFont};font-size:var(--f);font-weight:650;line-height:var(--lh)}
.cv-dates{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;margin-left:auto}
.cv-entry-sub{color:var(--muted)}
.cv-entry-summary,.cv-note{margin-top:${pt(2 * s)}}
.cv-note{color:var(--muted);${type(f * 0.94, lh)}}
.cv-bullets{margin-top:${pt(3 * s)};padding-left:1.3em}
.cv-bullets li{margin-top:${pt(1.5 * s)};break-inside:avoid;page-break-inside:avoid}
.cv-entry.is-short{break-inside:avoid;page-break-inside:avoid}
.cv-text p+p{margin-top:${pt(4 * s)}}
.cv-lines{break-inside:avoid;page-break-inside:avoid}
.cv-lines p+p{margin-top:${pt(2 * s)}}
.cv-line-label{font-weight:650}
p,li{orphans:3;widows:3}
.cv-link{color:var(--muted)}
mark.cv-ph{color:inherit;background:#FFF1B8;box-shadow:0 0 0 0.6pt #9C5D00 inset;border-radius:1.5pt;padding:0 1.5pt}
`;
  const own: Record<TemplateId, string> = {
    classic: `
.cv--classic .cv-header{text-align:center;justify-content:center}
.cv--classic .cv-header.has-photo{text-align:left}
.cv--classic .cv-name{${type(f * 2.2, 1.15)}}
.cv--classic .cv-label{${type(f * 1.1, lh)};color:var(--muted)}
.cv--classic .cv-heading{${type(f * 0.98, 1.2)};letter-spacing:0.05em;padding-bottom:${pt(2.5)};border-bottom:0.75pt solid var(--accent)}
.cv--classic .cv-bullets{list-style-type:disc}
`,
    modern: `
.cv--modern .cv-header{padding-bottom:${pt(10 * s)};border-bottom:2pt solid var(--accent)}
.cv--modern .cv-name{${type(f * 2.4, 1.15)};color:var(--accent);font-weight:700}
.cv--modern .cv-label{${type(f * 1.15, lh)}}
.cv--modern .cv-section{margin-top:${pt(15 * s - HEADING_INK_PAD)}}
.cv--modern .cv-heading{${type(f * 1.3, 1.2)};font-weight:650}
.cv--modern .cv-entry-org{font-weight:400}
.cv--modern .cv-bullets{list-style-type:"–  "}
.cv--modern .cv-bullets li::marker{color:var(--accent)}
`,
    compact: `
.cv--compact .cv-name{${type(f * 1.75, 1.15)}}
.cv--compact .cv-photo{width:24mm;height:32mm}
.cv--compact .cv-label{${type(f * 1.02, lh)};font-weight:600}
.cv--compact .cv-contact{margin-top:${pt(2 * s)}}
.cv--compact .cv-heading{${type(f * 0.9, 1.2)};letter-spacing:0.06em;padding-bottom:${pt(1.5)};border-bottom:0.5pt solid var(--rule)}
.cv--compact .cv-entry-org{font-weight:400}
.cv--compact .cv-bullets{list-style-type:disc}
.cv--compact .cv-bullets li{margin-top:${pt(0.5)}}
`,
  };
  return `${fontFaces(pair)}\n${shared}${own[templateId]}`;
}
