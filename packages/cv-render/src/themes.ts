import type { EmbeddedFontId } from "./fonts.generated";
import type { CvLanguage } from "./i18n";

export type Density = "compact" | "comfortable" | "spacious";
export type PaperSize = "a4" | "letter";

type Localized = Readonly<Record<CvLanguage, string>>;

function localize(value: Localized, locale: string | undefined): string {
  const base = (locale ?? "en").toLowerCase().split(/[-_]/u)[0];
  return base === "tr" || base === "de" ? value[base] : value.en;
}

/* ------------------------------------------------------------------------------------------------
 * Accent colours. Accents colour headings and the name, so every curated accent is text-safe:
 * ≥ 4.5:1 on white (WCAG AA for normal text), checked in themes.test.ts.
 * ---------------------------------------------------------------------------------------------- */

interface AccentDefinition {
  readonly id: string;
  readonly hex: string;
  readonly name: Localized;
}

const ACCENTS: readonly AccentDefinition[] = [
  { id: "navy", hex: "#2F5D8A", name: { en: "Navy", tr: "Lacivert", de: "Marineblau" } },
  { id: "teal", hex: "#1F635D", name: { en: "Teal", tr: "Deniz yeşili", de: "Petrol" } },
  { id: "green", hex: "#2F6B3A", name: { en: "Green", tr: "Yeşil", de: "Grün" } },
  { id: "blue", hex: "#1D4ED8", name: { en: "Blue", tr: "Mavi", de: "Blau" } },
  { id: "plum", hex: "#6B2E6B", name: { en: "Plum", tr: "Mürdüm", de: "Pflaume" } },
  { id: "burgundy", hex: "#8C2635", name: { en: "Burgundy", tr: "Bordo", de: "Bordeaux" } },
  { id: "brown", hex: "#7A4A1E", name: { en: "Brown", tr: "Kahverengi", de: "Braun" } },
  { id: "graphite", hex: "#2D3340", name: { en: "Graphite", tr: "Grafit", de: "Graphit" } },
];

export const DEFAULT_ACCENT = "#2F5D8A";

export function listAccents(locale?: string): Array<{ id: string; hex: string; name: string }> {
  return ACCENTS.map((accent) => ({ id: accent.id, hex: accent.hex, name: localize(accent.name, locale) }));
}

function channels(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(hex.trim());
  if (!match) return null;
  return [parseInt(match[1] ?? "0", 16), parseInt(match[2] ?? "0", 16), parseInt(match[3] ?? "0", 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio of a colour against white. */
export function contrastOnWhite(hex: string): number {
  const rgb = channels(hex);
  if (!rgb) return 1;
  return 1.05 / (luminance(rgb) + 0.05);
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/**
 * The accent the renderer actually prints: any `#RRGGBB` is accepted (older CVs, imports), but a
 * colour lighter than AA text contrast on white is darkened toward black until it reaches 4.5:1,
 * so headings and the name never become unreadable. Invalid values fall back to the default.
 */
export function printableAccent(hex: string): string {
  const rgb = channels(hex);
  if (!rgb) return DEFAULT_ACCENT;
  for (let step = 0; step <= 20; step += 1) {
    const factor = 1 - step * 0.05;
    const candidate: [number, number, number] = [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor];
    const out = toHex(candidate);
    if (contrastOnWhite(out) >= 4.5) return out;
  }
  return "#000000";
}

/* ------------------------------------------------------------------------------------------------
 * Font pairs. All faces are embedded (base64 WOFF2, SIL OFL 1.1), so output never depends on
 * installed fonts. DOCX cannot embed them portably; it names widely installed equivalents.
 * ---------------------------------------------------------------------------------------------- */

export interface FontPairDefinition {
  readonly id: string;
  readonly name: Localized;
  readonly heading: EmbeddedFontId;
  readonly body: EmbeddedFontId;
  /** CSS fallbacks after the embedded family. */
  readonly headingFallback: string;
  readonly bodyFallback: string;
  /** Word fonts for DOCX (installed with Office on macOS and Windows). */
  readonly docxHeading: string;
  readonly docxBody: string;
}

const SANS_FALLBACK = '"Helvetica Neue", Arial, sans-serif';
const SERIF_FALLBACK = 'Georgia, "Times New Roman", serif';

export const FONT_PAIRS: readonly FontPairDefinition[] = [
  {
    id: "inter-source-serif",
    name: { en: "Source Serif + Inter", tr: "Source Serif + Inter", de: "Source Serif + Inter" },
    heading: "source-serif-4",
    body: "inter",
    headingFallback: SERIF_FALLBACK,
    bodyFallback: SANS_FALLBACK,
    docxHeading: "Cambria",
    docxBody: "Calibri",
  },
  {
    id: "inter",
    name: { en: "Inter", tr: "Inter", de: "Inter" },
    heading: "inter",
    body: "inter",
    headingFallback: SANS_FALLBACK,
    bodyFallback: SANS_FALLBACK,
    docxHeading: "Calibri",
    docxBody: "Calibri",
  },
  {
    id: "source-sans-serif",
    name: {
      en: "Source Serif + Source Sans",
      tr: "Source Serif + Source Sans",
      de: "Source Serif + Source Sans",
    },
    heading: "source-serif-4",
    body: "source-sans-3",
    headingFallback: SERIF_FALLBACK,
    bodyFallback: SANS_FALLBACK,
    docxHeading: "Cambria",
    docxBody: "Calibri",
  },
];

export const DEFAULT_FONT_PAIR = "inter-source-serif";

export function fontPair(id: string): FontPairDefinition {
  return FONT_PAIRS.find((pair) => pair.id === id) ?? (FONT_PAIRS[0] as FontPairDefinition);
}

export function listFontPairs(locale?: string): Array<{ id: string; name: string }> {
  return FONT_PAIRS.map((pair) => ({ id: pair.id, name: localize(pair.name, locale) }));
}

/* ------------------------------------------------------------------------------------------------
 * Density and page geometry.
 * ---------------------------------------------------------------------------------------------- */

export interface DensityScale {
  /** Body size in pt (templates scale from it). */
  readonly fontPt: number;
  readonly lineHeight: number;
  /** Multiplier for vertical gaps. */
  readonly space: number;
}

export const DENSITIES: Readonly<Record<Density, DensityScale>> = {
  compact: { fontPt: 9.5, lineHeight: 1.3, space: 0.75 },
  comfortable: { fontPt: 10, lineHeight: 1.38, space: 1 },
  spacious: { fontPt: 10.5, lineHeight: 1.45, space: 1.25 },
};

export function densityScale(density: string): DensityScale {
  return density === "compact" || density === "spacious" ? DENSITIES[density] : DENSITIES.comfortable;
}

export interface PageMarginsMm {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface PageGeometry {
  readonly paper: PaperSize;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly widthPt: number;
  readonly heightPt: number;
  /** Printable area inset. `@page` uses it; native paginators (UIPrintPageRenderer) must too. */
  readonly marginsMm: PageMarginsMm;
}

const PAPER_MM: Readonly<Record<PaperSize, { width: number; height: number }>> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
};

export const PT_PER_MM = 72 / 25.4;

/**
 * Page margins in pt per density (≈ 12/14, 16/18 and 20/22 mm on A4; Letter is 6.5 mm shorter and
 * trims the vertical ones). They are chosen so that Chromium and WebKit print the same page:
 * - every margin is a multiple of 3 pt: Chromium floors `@page` margins to whole CSS px (0.75 pt)
 *   and WebKit/Quartz rounds them up to whole points (16 mm = 45.35 pt printed at 45 pt in Chromium
 *   and 46 pt in WebKit);
 * - the printable width and height are multiples of 4 pt on WebKit's whole-point paper (A4 595 × 842,
 *   Letter 612 × 792): WebKit lays a page out `floor(1.25 × printable size)` CSS px wide and tall and
 *   scales that to the paper, so anything else printed every CV ~0.1 % larger than Chromium, enough to
 *   wrap a line that fits in Chromium. On A4 that needs an odd left + right sum, hence 3 pt more on
 *   the left. `themes.test.ts` checks both rules.
 */
export const MARGINS_PT: Readonly<
  Record<Density, Readonly<Record<PaperSize, { top: number; right: number; bottom: number; left: number }>>>
> = {
  compact: {
    a4: { top: 33, right: 36, bottom: 33, left: 39 },
    letter: { top: 30, right: 42, bottom: 30, left: 42 },
  },
  comfortable: {
    a4: { top: 45, right: 48, bottom: 45, left: 51 },
    letter: { top: 42, right: 54, bottom: 42, left: 54 },
  },
  spacious: {
    a4: { top: 57, right: 60, bottom: 57, left: 63 },
    letter: { top: 48, right: 60, bottom: 48, left: 60 },
  },
};

export function pageGeometry(paper: string, density: string): PageGeometry {
  const size: PaperSize = paper === "letter" ? "letter" : "a4";
  const scale: Density = density === "compact" || density === "spacious" ? density : "comfortable";
  const { width, height } = PAPER_MM[size];
  const margins = MARGINS_PT[scale][size];
  return {
    paper: size,
    widthMm: width,
    heightMm: height,
    widthPt: Math.round(width * PT_PER_MM * 100) / 100,
    heightPt: Math.round(height * PT_PER_MM * 100) / 100,
    marginsMm: {
      top: margins.top / PT_PER_MM,
      right: margins.right / PT_PER_MM,
      bottom: margins.bottom / PT_PER_MM,
      left: margins.left / PT_PER_MM,
    },
  };
}
