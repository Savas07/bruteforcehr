// Prints cv-render HTML files with the server renderer (src/render/print.ts, what cvRenderPdf runs),
// for the cv-render parity check (packages/cv-render/scripts/parity.ts). On Linux x64 that is
// @sparticuz/chromium itself; elsewhere chrome-headless-shell of the same version.
//
//   pnpm --filter @bfhr/functions print:local <manifest.json>
//   manifest: [{ "html": "/abs/in.html", "pdf": "/abs/out.pdf" }, …]
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { browserVersion, closeBrowser, printHtmlToPdf } from "../src/render/print";
import { installLocalChromium } from "./local-chromium";

const manifestPath = process.argv[2];
if (manifestPath === undefined) {
  console.error("usage: print-local <manifest.json>");
  process.exit(2);
}
const manifest = z
  .array(z.object({ html: z.string().min(1), pdf: z.string().min(1) }))
  .parse(JSON.parse(await readFile(manifestPath, "utf8")));

if (!process.env["BFHR_CHROMIUM_PATH"] && !(process.platform === "linux" && process.arch === "x64")) {
  process.env["BFHR_CHROMIUM_PATH"] = await installLocalChromium();
}
try {
  // stdout: the browser version only (the parity report shows it).
  console.log(await browserVersion());
  for (const { html, pdf } of manifest) {
    await writeFile(pdf, await printHtmlToPdf(await readFile(html, "utf8")));
  }
} finally {
  await closeBrowser();
}
