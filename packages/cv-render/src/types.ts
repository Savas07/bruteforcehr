import type { CvContent, CvMeta } from "@bfhr/core";
import type { Density, PageGeometry, PaperSize } from "./themes";

export type TemplateId = "classic" | "modern" | "compact";

/** JSON Resume content without `meta` (CvContent is assignable: `meta` is ignored here). */
export type CvResume = Omit<CvContent, "meta">;

export interface CvRenderTheme {
  /** `#RRGGBB`; curated values from `listAccents()`, others are darkened to AA if needed. */
  readonly accent: string;
  /** Font pair id from `listFontPairs()`; unknown ids use the default pair. */
  readonly fontPair: string;
  readonly density: Density;
}

export interface CvRenderInput {
  readonly resume: CvResume;
  /** Section order, custom sections and the opt-in personal details (`meta.personal`). */
  readonly meta: Pick<CvMeta, "sectionOrder" | "customSections"> & Partial<Pick<CvMeta, "personal">>;
  readonly templateId: TemplateId;
  readonly theme: CvRenderTheme;
  readonly paper: PaperSize;
  /** The CV's language (BCP 47, e.g. "de" or "tr-TR"): headings, dates, `lang`. Not the UI language. */
  readonly locale: string;
  /**
   * Photo bytes for `basics.image` as a `data:image/jpeg|png;base64,…` URL, resolved by the caller
   * from Storage. Printed only when `meta.personal.showPhoto` is on.
   */
  readonly photo?: { readonly dataUrl: string };
}

/** A `[X%]`-style placeholder the AI left for the user to fill in (BRIEF §2.4). */
export interface PlaceholderHit {
  /** JSON pointer of the field holding it, e.g. `/work/0/highlights/1`. */
  readonly path: string;
  readonly text: string;
}

/** What the rendered document says, in order: the expected list for the ATS readback check. */
export interface OutlineSection {
  /** `work`, `summary`, `custom:talks`, … */
  readonly key: string;
  /** The heading exactly as printed. */
  readonly heading: string;
  /** Each entry's title (or line label) as printed. */
  readonly entries: readonly string[];
}

export interface CvRenderResult {
  /** Self-contained HTML document (embedded fonts, no scripts, no external requests). */
  readonly html: string;
  /** "Deniz Aksoy – CV"; also the `<title>`, which print-to-PDF uses as the PDF title. */
  readonly title: string;
  /** `lang` attribute of the document. */
  readonly lang: string;
  readonly page: PageGeometry;
  readonly placeholders: readonly PlaceholderHit[];
  readonly outline: readonly OutlineSection[];
}
