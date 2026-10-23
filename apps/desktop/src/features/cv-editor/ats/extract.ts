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
import {
  getDocument,
  PDFWorker,
  type PDFDocumentLoadingTask,
  type PDFPageProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

interface TextWorker {
  readonly pdfWorker: PDFWorker;
  /**
   * Rejects when the worker script fails to load or run. pdf.js never notices a dead port
   * worker, so without this a failed load would leave the check waiting forever.
   */
  readonly failed: Promise<never>;
  readonly stop: () => void;
}

/**
 * A fresh module worker per check, terminated afterwards. Created here rather than by pdf.js from
 * `workerSrc`: pdf.js wraps a worker URL it doesn't consider same-origin (`tauri://localhost` has an
 * opaque URL origin) in a blob: script, which the CSP rightly refuses. Node (vitest) has no web
 * workers; there pdf.js parses on the main thread.
 */
function startWorker(): TextWorker | null {
  if (typeof Worker !== "function") return null;
  const worker = new Worker(workerUrl, { type: "module", name: "pdf-text" });
  const failed = new Promise<never>((_, reject) => {
    worker.addEventListener(
      "error",
      (event) => reject(new Error(`PDF text worker failed (${workerUrl}): ${event.message || "load error"}`)),
      { once: true },
    );
  });
  // `create`, not the constructor: pdf.js types the constructor's `port` as `null` only.
  const pdfWorker = PDFWorker.create({ port: worker });
  return {
    pdfWorker,
    failed,
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

/** Item shape of pdf.js text content we read (marked-content items have no `str`). */
interface TextItem {
  readonly str: string;
  readonly hasEOL: boolean;
}

function isTextItem(item: object): item is TextItem {
  return "str" in item;
}

/**
 * A page's text items. Not `page.getTextContent()`: it reads the stream with `for await`, and
 * WKWebView on macOS has no async iteration for `ReadableStream` ("undefined is not a function"),
 * which the legacy build doesn't polyfill. A reader loop works everywhere.
 */
async function textItems(page: PDFPageProxy): Promise<object[]> {
  // pdf.js types the stream as `ReadableStream<any>`; each chunk is a slice of the page's items.
  const stream: ReadableStream<{ readonly items: readonly object[] }> = page.streamTextContent();
  const reader = stream.getReader();
  const items: object[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return items;
    items.push(...value.items);
  }
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

async function readPages(task: PDFDocumentLoadingTask): Promise<PdfText> {
  const document = await task.promise;
  const pages: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    pages.push(pageText(await textItems(page)));
    page.cleanup();
  }
  return { pages, text: pages.join("\n\n") };
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  const worker = startWorker();
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
    return await (worker ? Promise.race([readPages(task), worker.failed]) : readPages(task));
  } finally {
    if (worker) {
      // Not awaited: `destroy` waits for the worker's reply, which a dead worker never sends, and
      // terminating the worker frees everything anyway.
      void task.destroy().catch(() => undefined);
      worker.stop();
    } else {
      await task.destroy();
    }
  }
}
