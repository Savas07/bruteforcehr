/**
 * PDF → plain text, the way an application system's parser reads our exported CV (ATS round-trip,
 * research/cv-editor.md "Readable by ATS"). pdf.js runs in a module worker bundled from 'self'
 * (Vite `?url` asset), so it works under the strict Tauri CSP (`worker-src 'self'`): no CDN, no
 * blob: wrapper, no eval, no wasm, nothing fetched.
 *
 * The `legacy` build is deliberate: the modern build calls `Map#getOrInsertComputed`,
 * `Math.sumPrecise` and friends unguarded, which WKWebView on macOS 13 (Safari 16, our build target)
 * and Node 22 (vitest) don't have. The legacy build ships those polyfills, also inside the worker.
 */
import { getDocument, PDFWorker } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

/**
 * A fresh module worker per check, terminated afterwards. Created here rather than by pdf.js from
 * `workerSrc`: pdf.js wraps a worker URL it doesn't consider same-origin (`tauri://localhost` has an
 * opaque URL origin) in a blob: script, which the CSP rightly refuses. Node (vitest) has no web
 * workers; there pdf.js parses on the main thread.
 */
function startWorker(): { pdfWorker: PDFWorker; stop: () => void } | null {
  if (typeof Worker !== "function") return null;
  const worker = new Worker(workerUrl, { type: "module", name: "pdf-text" });
  // `create`, not the constructor: pdf.js types the constructor's `port` as `null` only.
  const pdfWorker = PDFWorker.create({ port: worker });
  return {
    pdfWorker,
    stop: () => {
      pdfWorker.destroy();
      worker.terminate();
    },
  };
}

export interface PdfText {
  /** One string per page, lines separated by `\n`. */
  readonly pages: readonly string[];
  /** All pages, separated by a blank line. */
  readonly text: string;
}

/** Item shape of pdf.js `getTextContent()` we read (marked-content items have no `str`). */
interface TextItem {
  readonly str: string;
  readonly hasEOL: boolean;
}

function isTextItem(item: object): item is TextItem {
  return "str" in item;
}

/** Joins a page's text items into lines, trimming the trailing spaces pdf.js leaves at line ends. */
function pageText(items: readonly object[]): string {
  let text = "";
  for (const item of items) {
    if (!isTextItem(item)) continue;
    text += item.str;
    if (item.hasEOL) text += "\n";
  }
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  const worker = startWorker();
  try {
    const task = getDocument({
      // pdf.js transfers (detaches) the buffer it's given; the caller keeps its bytes.
      data: bytes.slice(),
      ...(worker && { worker: worker.pdfWorker }),
      // Text only: no font loading into the document, no wasm image decoders, nothing fetched.
      disableFontFace: true,
      useWasm: false,
      useSystemFonts: false,
      stopAtErrors: false,
    });
    try {
      const document = await task.promise;
      const pages: string[] = [];
      for (let number = 1; number <= document.numPages; number += 1) {
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        pages.push(pageText(content.items));
        page.cleanup();
      }
      return { pages, text: pages.join("\n\n") };
    } finally {
      await task.destroy();
    }
  } finally {
    worker?.stop();
  }
}
