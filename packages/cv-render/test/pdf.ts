// Test/critique helpers: print the renderer's HTML to PDF in headless Chromium (the server path,
// ADR 0009) and read the PDF's text layer back with pdf.js, the way an ATS parser would.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { type Browser, chromium } from "playwright";
import type { CvRenderResult } from "../src/index";

export async function launchChromium(): Promise<Browser> {
  return chromium.launch();
}

/** Chromium print-to-PDF honouring the document's own `@page` size and margins. */
export async function printPdf(browser: Browser, result: CvRenderResult): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    await page.setContent(result.html, { waitUntil: "load" });
    // Embedded data: fonts decode asynchronously; print only once every face is ready.
    await page.evaluate("document.fonts.ready.then(() => true)");
    return await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: false });
  } finally {
    await page.close();
  }
}

export interface PdfText {
  readonly pages: number;
  /** All text, pages joined, one line per text line, whitespace collapsed. */
  readonly text: string;
  readonly title: string | undefined;
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  // pdf.js rejects Node Buffers (Playwright's return type); copy into a plain Uint8Array.
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0 });
  const document = await task.promise;
  const lines: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    let line = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
  }
  const { info } = (await document.getMetadata()) as { info: { Title?: string } };
  const text = lines
    .map((value) => value.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
  await task.destroy();
  return { pages: document.numPages, text, title: info.Title };
}

/**
 * Checks that every section heading and every entry of the outline appears in the text, in order.
 * Returns the missing items (empty = the PDF reads back completely).
 */
export function missingInOrder(result: CvRenderResult, text: string): string[] {
  const flat = text.replace(/\s+/gu, " ");
  const missing: string[] = [];
  let cursor = 0;
  const find = (needle: string, label: string) => {
    const at = flat.indexOf(needle.replace(/\s+/gu, " "), cursor);
    if (at < 0) missing.push(label);
    else cursor = at + needle.length;
  };
  for (const section of result.outline) {
    find(section.heading, `heading ${section.key}: ${section.heading}`);
    for (const entry of section.entries) find(entry, `${section.key} entry: ${entry}`);
  }
  return missing;
}
