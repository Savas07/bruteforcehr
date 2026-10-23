/**
 * CV export through the Tauri backend: printing the CV's HTML to a PDF (src-tauri/src/cv_pdf.rs)
 * and saving an exported file through the native Save dialog (src-tauri/src/export_file.rs).
 * The main window's capability grants exactly these two commands.
 */
import { invoke } from "@tauri-apps/api/core";

/** Page size of the printed PDF; the HTML's `@page` rules carry the margins. */
export type PaperSize = "a4" | "letter";

/**
 * What `saveExportFile` saves; picks the Save dialog's file-type filter and the extension: CVs
 * (`pdf`, `docx`, `json`), interviews as iCalendar (`ics`), applications as a spreadsheet (`csv`).
 */
export type ExportKind = "pdf" | "docx" | "json" | "ics" | "csv";

/** The formats a CV exports to. */
export type CvExportKind = Extract<ExportKind, "pdf" | "docx" | "json">;

/** Rejection of both commands (mirrors `CommandError` in src-tauri/src/commands.rs). */
export interface CvExportError {
  /** `invalid-export`: arguments refused (empty or oversized HTML/file, bad file name or kind). */
  readonly kind: "invalid-export" | "print-failed" | "save-failed";
  readonly message: string;
}

/** Header names `save_export` reads (src-tauri/src/export_file.rs). */
const FILE_NAME_HEADER = "bfhr-file-name";
const KIND_HEADER = "bfhr-export-kind";

/**
 * Prints the CV's self-contained HTML (`renderCvHtml` from `@bfhr/cv-render`) to a PDF, offline,
 * with the OS webview: real A4 / Letter pages, selectable text. Rejects with `CvExportError`.
 */
export async function printCvPdf(html: string, paper: PaperSize): Promise<Uint8Array> {
  const pdf = await invoke<ArrayBuffer>("print_cv_pdf", { html, paper });
  return new Uint8Array(pdf);
}

/**
 * Shows the native Save dialog suggesting `fileName` (`exportFileName` from `@bfhr/cv-render`; it
 * must end in the kind's extension), writes `bytes` to the chosen file and returns its path, or
 * null when the user cancels. Rejects with `CvExportError`.
 */
export function saveExportFile(
  bytes: Uint8Array,
  fileName: string,
  kind: ExportKind,
): Promise<string | null> {
  // The bytes travel as the raw request body; headers are ASCII, so the name is percent-encoded.
  return invoke<string | null>("save_export", bytes, {
    headers: { [FILE_NAME_HEADER]: encodeURIComponent(fileName), [KIND_HEADER]: kind },
  });
}
