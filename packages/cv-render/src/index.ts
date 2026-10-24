export { renderCvHtml } from "./html";
export {
  type CoverLetterRecipient,
  type CoverLetterRenderInput,
  type CoverLetterRenderResult,
  renderCoverLetterHtml,
} from "./letter";
export { buildCvDocx, buildCvDocxBase64 } from "./docx";
export {
  exportFileName,
  exportJsonResume,
  type ExportExtension,
  type ExportFileNameInput,
  JSON_RESUME_SCHEMA_URL,
  splitName,
} from "./export";
export { listTemplates } from "./templates";
export {
  contrastOnWhite,
  DEFAULT_ACCENT,
  DEFAULT_FONT_PAIR,
  type Density,
  listAccents,
  listFontPairs,
  type PageGeometry,
  pageGeometry,
  type PageMarginsMm,
  type PaperSize,
  printableAccent,
} from "./themes";
export { CV_LANGUAGES, type CvLanguage, cvLanguage, PRESENT_WORD, SECTION_HEADINGS, upperCase } from "./i18n";
export { PLACEHOLDER_PATTERN } from "./model";
export { CV_RENDER_VERSION } from "./version";
export type {
  CvRenderInput,
  CvRenderResult,
  CvRenderTheme,
  CvResume,
  OutlineSection,
  PlaceholderHit,
  TemplateId,
} from "./types";

/** Defaults for a new CV. */
export const DEFAULT_TEMPLATE = "classic";
export const DEFAULT_DENSITY = "comfortable";
