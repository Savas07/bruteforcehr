/**
 * The one CV renderer (@bfhr/cv-render, ADR 0009) as the editor uses it: the same HTML is the live
 * preview, the PDF (printed by the OS webview, src/lib/cvExport.ts) and the ATS check's source.
 */
import type { CvContent } from "@bfhr/core";
import { renderCvHtml, type CvRenderInput, type CvRenderResult, type TemplateId } from "@bfhr/cv-render";

const TEMPLATE_IDS: readonly string[] = ["classic", "modern", "compact"] satisfies readonly TemplateId[];

/** Render input of stored (or about-to-be-stored) CV content in the CV's own language. */
export function renderInput(content: CvContent, language: string, paper = content.meta.theme.paperSize): CvRenderInput {
  const { meta, ...resume } = content;
  const templateId = (TEMPLATE_IDS.includes(meta.template) ? meta.template : "classic") as TemplateId;
  return {
    resume,
    meta,
    templateId,
    theme: { accent: meta.theme.accentColor, fontPair: meta.theme.fontPair, density: meta.theme.density },
    paper,
    locale: language,
  };
}

export function renderCv(content: CvContent, language: string, paper?: CvContent["meta"]["theme"]["paperSize"]): CvRenderResult {
  return renderCvHtml(renderInput(content, language, paper));
}
