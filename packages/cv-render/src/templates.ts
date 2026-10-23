/**
 * The three ATS-safe templates. All of them are one column of real text in DOM reading order,
 * standard section headings, no tables, no text in images, no multi-column layout; they differ in
 * header alignment, heading style, entry layout and spacing only.
 */
import { EMBEDDED_FONTS } from "./fonts.generated";
import type { CvLanguage } from "./i18n";
import { type DensityScale, type FontPairDefinition, type PageGeometry } from "./themes";
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
  return TEMPLATES.map((item) => ({ id: item.id, name: item.name[language], description: item.description[language] }));
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
  const headingFont = `"CV ${EMBEDDED_FONTS[pair.heading].family}", ${pair.headingFallback}`;
  const bodyFont = `"CV ${EMBEDDED_FONTS[pair.body].family}", ${pair.bodyFallback}`;
  const shared = `
@page{size:${page.paper === "letter" ? "letter" : "A4"};margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm}
:root{--accent:${accent};--ink:#1B1F24;--muted:#4B5261;--rule:#C3C9D2;--f:${pt(f)};--lh:${density.lineHeight}}
*,*::before,*::after{box-sizing:border-box}
html{background:transparent;-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;color:var(--ink);font-family:${bodyFont};font-size:var(--f);line-height:var(--lh);font-kerning:normal;font-variant-ligatures:none;font-synthesis:none;hyphens:manual;-webkit-hyphens:manual;overflow-wrap:break-word;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cv{width:${page.widthMm}mm;min-height:${page.heightMm}mm;margin:0 auto;padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;background:#fff}
@media print{html,body{background:#fff}.cv{width:auto;min-height:0;margin:0;padding:0}}
h1,h2,h3,p,ul{margin:0;padding:0}
a{color:inherit;text-decoration:none}
.cv-header{display:flex;gap:${pt(12 * s)};align-items:flex-start;break-inside:avoid;page-break-inside:avoid}
.cv-id{flex:1 1 auto;min-width:0}
.cv-name{font-family:${headingFont};font-weight:650;line-height:1.15;letter-spacing:-0.005em}
.cv-label{margin-top:${pt(2 * s)}}
.cv-contact,.cv-personal{margin-top:${pt(4 * s)};color:var(--muted);font-size:${pt(f * 0.92)}}
.cv-sep{color:var(--rule);padding:0 0.1em}
.cv-photo{flex:0 0 auto;width:30mm;height:40mm;object-fit:cover;border-radius:1.5mm}
.cv-section{margin-top:${pt(13 * s)}}
.cv-heading{font-family:${headingFont};color:var(--accent);font-weight:700;line-height:1.2;break-after:avoid;page-break-after:avoid;break-inside:avoid}
.cv-entry{margin-top:${pt(8 * s)}}
.cv-heading+.cv-entry,.cv-heading+.cv-text,.cv-heading+.cv-lines{margin-top:${pt(6 * s)}}
.cv-entry-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;column-gap:${pt(10)};break-after:avoid;page-break-after:avoid;break-inside:avoid}
.cv-entry-title{font-family:${bodyFont};font-size:var(--f);font-weight:650;line-height:var(--lh)}
.cv-dates{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;margin-left:auto}
.cv-entry-sub{color:var(--muted);break-after:avoid;page-break-after:avoid}
.cv-entry-summary,.cv-note{margin-top:${pt(2 * s)}}
.cv-note{color:var(--muted);font-size:${pt(f * 0.94)}}
.cv-bullets{margin-top:${pt(3 * s)};padding-left:1.15em}
.cv-bullets li{margin-top:${pt(1.5 * s)};padding-left:0.15em;break-inside:avoid;page-break-inside:avoid}
.cv-entry.is-short{break-inside:avoid;page-break-inside:avoid}
.cv-text p+p{margin-top:${pt(4 * s)}}
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
.cv--classic .cv-name{font-size:${pt(f * 2.2)}}
.cv--classic .cv-label{font-size:${pt(f * 1.1)};color:var(--muted)}
.cv--classic .cv-heading{font-size:${pt(f * 0.98)};letter-spacing:0.05em;padding-bottom:${pt(2.5)};border-bottom:0.75pt solid var(--accent)}
.cv--classic .cv-bullets{list-style-type:disc}
`,
    modern: `
.cv--modern .cv-header{padding-bottom:${pt(10 * s)};border-bottom:2pt solid var(--accent)}
.cv--modern .cv-name{font-size:${pt(f * 2.4)};color:var(--accent);font-weight:700}
.cv--modern .cv-label{font-size:${pt(f * 1.15)}}
.cv--modern .cv-section{margin-top:${pt(15 * s)}}
.cv--modern .cv-heading{font-size:${pt(f * 1.3)};font-weight:650}
.cv--modern .cv-entry-org{font-weight:400}
.cv--modern .cv-bullets{list-style-type:"–  "}
.cv--modern .cv-bullets li::marker{color:var(--accent)}
`,
    compact: `
.cv--compact .cv-name{font-size:${pt(f * 1.75)}}
.cv--compact .cv-label{display:inline;font-size:${pt(f * 1.02)};font-weight:600}
.cv--compact .cv-contact{margin-top:${pt(2 * s)}}
.cv--compact .cv-heading{font-size:${pt(f * 0.9)};letter-spacing:0.06em;padding-bottom:${pt(1.5)};border-bottom:0.5pt solid var(--rule)}
.cv--compact .cv-entry-org{font-weight:400}
.cv--compact .cv-bullets{list-style-type:disc;padding-left:1em}
.cv--compact .cv-bullets li{margin-top:${pt(0.5)}}
`,
  };
  return `${fontFaces(pair)}\n${shared}${own[templateId]}`;
}
