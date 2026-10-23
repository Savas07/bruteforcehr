// Headless Chromium print-to-PDF for the server render (docs/adr/0009-cv-rendering.md). In Cloud
// Functions (Linux x64) the browser is @sparticuz/chromium's chrome-headless-shell, unpacked to /tmp on
// the first call of an instance and reused while the instance stays warm. Local runs (tests on macOS,
// the parity script) point BFHR_CHROMIUM_PATH at a chrome-headless-shell of the same version
// (scripts/local-chromium.ts).
import { tmpdir } from "node:os";
import { join } from "node:path";
import chromium from "@sparticuz/chromium";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * Chromium build inside @sparticuz/chromium 153.0.0 (its release notes), which is also the build
 * puppeteer-core 25.11.0 drives. Bump all three together (pptr.dev/chromium-support).
 */
export const SERVER_CHROMIUM_VERSION = "153.0.8010.36";

/**
 * @sparticuz/chromium's serverless flags (no sandbox/zygote: the container runs as root; no WebGL),
 * without the ones that relax web security: we only load our own self-contained HTML.
 */
const RELAXED_SECURITY_FLAGS: Readonly<Record<string, true>> = {
  "--allow-running-insecure-content": true,
  "--disable-web-security": true,
  "--disable-site-isolation-trials": true,
};

async function launch(): Promise<Browser> {
  const local = process.env["BFHR_CHROMIUM_PATH"];
  if (local !== undefined && local !== "") {
    return puppeteer.launch({
      executablePath: local,
      headless: "shell",
      // Same text rendering as the server flags (no hinting: glyph advances as on macOS).
      args: ["--font-render-hinting=none"],
    });
  }
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(
      "@sparticuz/chromium runs on Linux x64 only; set BFHR_CHROMIUM_PATH (pnpm --filter @bfhr/functions chromium:local)",
    );
  }
  chromium.setGraphicsMode = false;
  const executablePath = await chromium.executablePath();
  // fonts.tar.br unpacks a fontconfig setup to /tmp/fonts; the package only points fontconfig at it on
  // Amazon Linux. CVs embed their fonts, so this only serves as the fallback for missing glyphs.
  process.env["FONTCONFIG_PATH"] ??= join(tmpdir(), "fonts");
  return puppeteer.launch({
    executablePath,
    headless: "shell",
    args: chromium.args.filter((flag) => RELAXED_SECURITY_FLAGS[flag] !== true),
  });
}

let browserPromise: Promise<Browser> | undefined;

/** One browser per instance; relaunched when it crashed or was closed. */
function browser(): Promise<Browser> {
  browserPromise ??= launch().then(
    (launched) => {
      launched.once("disconnected", () => {
        browserPromise = undefined;
      });
      return launched;
    },
    (error: unknown) => {
      browserPromise = undefined;
      throw error;
    },
  );
  return browserPromise;
}

/** The running browser's version string, e.g. `HeadlessChrome/153.0.8010.36`. */
export async function browserVersion(): Promise<string> {
  return (await browser()).version();
}

/**
 * Prints a cv-render HTML document the way the apps' Chromium exporters do: the document's own
 * `@page` size and margins, backgrounds, a tagged PDF, the `<title>` as PDF title. Page scripts are
 * off (the document has none, and its CSP forbids them anyway).
 */
export async function printHtmlToPdf(html: string): Promise<Uint8Array> {
  const page = await (await browser()).newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "load" });
    // Embedded data: fonts decode asynchronously; print only once every face is ready.
    await page.evaluate("document.fonts.ready.then(() => true)");
    return await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
      outline: false,
      timeout: 60_000,
    });
  } finally {
    await page.close();
  }
}

/** Number of pages of a PDF. */
export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  // pdf.js transfers the buffer to its worker; pass a copy so the caller's bytes stay usable.
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 });
  try {
    return (await task.promise).numPages;
  } finally {
    await task.destroy();
  }
}

/** Closes the shared browser (tests and local scripts; instances just stop). */
export async function closeBrowser(): Promise<void> {
  const running = browserPromise;
  browserPromise = undefined;
  if (running !== undefined) await (await running).close();
}
