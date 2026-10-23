/**
 * PDF → plain text, the way an application system's parser reads our exported CV (ATS round-trip,
 * research/cv-editor.md "Readable by ATS"). pdf.js runs in a module worker bundled from 'self'
 * (Vite `?url` asset), so it works under the strict Tauri CSP (`worker-src 'self'`): no CDN, no
 * blob: wrapper, no eval, no wasm, nothing fetched. Where the webview can't start that worker, the
 * same bundled module parses on the main thread instead (a CV is a page or two).
 *
 * The `legacy` build is deliberate: the modern build calls `Map#getOrInsertComputed`,
 * `Math.sumPrecise` and friends unguarded, which WKWebView on macOS 13 (Safari 16, our build target)
 * and Node 22 (vitest) don't have. The legacy build ships those polyfills, also inside the worker.
 */
import { getDocument, PDFWorker, type PDFDocumentLoadingTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

/** The pdf.js worker couldn't be created or died while loading. */
class WorkerUnavailable extends Error {
  override name = "WorkerUnavailable";
}

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
 * opaque URL origin) in a blob: script, which the CSP rightly refuses.
 */
function startWorker(): TextWorker {
  let worker: Worker;
  try {
    worker = new Worker(workerUrl, { type: "module", name: "pdf-text" });
  } catch (error) {
    throw new WorkerUnavailable(`PDF text worker couldn't start (${workerUrl})`, { cause: error });
  }
  const failed = new Promise<never>((_, reject) => {
    worker.addEventListener(
      "error",
      (event) =>
        reject(
          new WorkerUnavailable(`PDF text worker failed (${workerUrl}): ${event.message || "load error"}`),
        ),
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

/** Set once a worker failed: later checks go straight to the main thread. */
let workerUnavailable = false;

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

async function readPages(task: PDFDocumentLoadingTask): Promise<PdfText> {
  const document = await task.promise;
  const pages: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    pages.push(pageText(content.items));
    page.cleanup();
  }
  return { pages, text: pages.join("\n\n") };
}

/** `worker` null: pdf.js parses on this thread (Node, or after `loadMainThreadParser`). */
async function parse(bytes: Uint8Array, worker: TextWorker | null): Promise<PdfText> {
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

/**
 * Evaluates the bundled worker module on this thread. It registers `globalThis.pdfjsWorker`,
 * which pdf.js then uses in place of a worker. Dynamic import: the specifier is the asset URL Vite
 * assigns at build time, loaded only on this fallback path (script-src 'self' admits it).
 */
async function loadMainThreadParser(): Promise<void> {
  await import(/* @vite-ignore */ workerUrl);
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  // Node (vitest) has no web workers; pdf.js loads its own parser on this thread there.
  if (typeof Worker !== "function") return parse(bytes, null);
  if (!workerUnavailable) {
    try {
      return await parse(bytes, startWorker());
    } catch (error) {
      if (!(error instanceof WorkerUnavailable)) throw error;
      console.warn("PDF text worker unavailable; reading the PDF on the main thread instead", error);
      workerUnavailable = true;
    }
  }
  await loadMainThreadParser();
  return parse(bytes, null);
}
