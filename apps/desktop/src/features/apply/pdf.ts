/**
 * The application's attachments as PDFs: the pinned CV revision through the CV editor's renderer
 * (`renderCv`, ADR 0009) and the cover letter through `renderCoverLetterHtml` with the CV's
 * template, theme and paper, both printed offline by the OS webview (`printCvPdf`).
 */
import type { CvContent, Job } from "@bfhr/core";
import { exportFileName, renderCoverLetterHtml, splitName } from "@bfhr/cv-render";
import { isTauri } from "@tauri-apps/api/core";
import { printCvPdf } from "../../lib/cvExport";
import { renderCv, renderInput } from "../cv-editor/render";

export interface PdfFile {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

export interface AttachmentPdfs {
  readonly cv: PdfFile;
  readonly letter: PdfFile | null;
}

/**
 * Prints `html`. Design builds opened in a plain browser (the capture harness) have no shell to
 * print with; there the HTML's bytes stand in, since the design store keeps only their size.
 */
function printPdf(html: string, paper: CvContent["meta"]["theme"]["paperSize"]): Promise<Uint8Array> {
  if (__BFHR_DESIGN__ && !isTauri()) return Promise.resolve(new TextEncoder().encode(html));
  return printCvPdf(html, paper);
}

export interface LetterInput {
  readonly body: string;
  readonly subject: string;
  readonly language: string;
  /** `YYYY-MM-DD` on the user's calendar (`letterDay`). */
  readonly day: string;
}

export interface AttachmentRequest {
  readonly content: CvContent;
  /** The CV's language (headings, dates). */
  readonly cvLanguage: string;
  readonly job: Pick<Job, "company">;
  /** The letter, or null without one. */
  readonly letter: LetterInput | null;
}

/**
 * The cover letter alone, in the CV's template, theme and paper (the kit's "Save as PDF").
 * Rejects with `CvExportError` when printing fails.
 */
export async function makeLetterPdf(content: CvContent, job: Pick<Job, "company">, letter: LetterInput): Promise<PdfFile> {
  const paper = content.meta.theme.paperSize;
  const { firstName, lastName } = splitName(content.basics?.name);
  const base = renderInput(content, letter.language);
  const html = renderCoverLetterHtml({
    basics: base.resume.basics,
    recipient: { company: job.company },
    date: letter.day,
    subject: letter.subject,
    body: letter.body,
    templateId: base.templateId,
    theme: base.theme,
    paper,
    locale: letter.language,
  }).html;
  return {
    fileName: exportFileName({ firstName, lastName, company: job.company, ext: "pdf", locale: letter.language, document: "coverLetter" }),
    bytes: await printPdf(html, paper),
  };
}

/** Renders and prints the CV (+ letter). Rejects with `CvExportError` when printing fails. */
export async function makeAttachmentPdfs({ content, cvLanguage, job, letter }: AttachmentRequest): Promise<AttachmentPdfs> {
  const { firstName, lastName } = splitName(content.basics?.name);
  const cv: PdfFile = {
    fileName: exportFileName({ firstName, lastName, company: job.company, ext: "pdf", locale: cvLanguage }),
    bytes: await printPdf(renderCv(content, cvLanguage).html, content.meta.theme.paperSize),
  };
  return { cv, letter: letter ? await makeLetterPdf(content, job, letter) : null };
}
