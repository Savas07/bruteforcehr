// Critique captures: prints every template × paper × language (and the every-section CV with photo
// and date of birth) to PDF in Chromium and, on macOS, in WebKit (WKWebView + NSPrintOperation, the
// desktop/iOS path), reads the text layer back with pdf.js and rasterises the pages for review.
// Output (gitignored): artifacts/cv-render/<paper>/<template>-<lang>[-full][-webkit].pdf, -p<N>.png.
// Usage: pnpm --filter @bfhr/cv-render critique
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCvDocx, renderCvHtml } from "../src/index";
import { extractPdfText, launchChromium, missingInOrder, printPdf } from "../test/pdf";
import { deCv, enCv, fullCv, inputFor, PAPERS, TEMPLATE_IDS, trCv } from "../test/samples";

const require = createRequire(import.meta.url);
const pdfjsBuild = dirname(require.resolve("pdfjs-dist/build/pdf.mjs"));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const out = join(repoRoot, "artifacts/cv-render");
await mkdir(out, { recursive: true });

const webkitPrint = process.platform === "darwin" ? join(out, "webkit-print") : undefined;
if (webkitPrint) {
  execFileSync("swiftc", ["-O", fileURLToPath(new URL("webkit-print.swift", import.meta.url)), "-o", webkitPrint]);
}

const browser = await launchChromium();
const viewer = await browser.newPage();
await viewer.route("https://pdfjs.local/**", async (route) => {
  const file = new URL(route.request().url()).pathname.slice(1);
  await route.fulfill({ body: await readFile(join(pdfjsBuild, file)), contentType: "text/javascript" });
});
await viewer.route("https://viewer.local/", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><script type="module">
      import * as pdfjs from "https://pdfjs.local/pdf.mjs";
      pdfjs.GlobalWorkerOptions.workerSrc = "https://pdfjs.local/pdf.worker.mjs";
      window.rasterise = async (base64, scale) => {
        const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const pdf = await pdfjs.getDocument({ data }).promise;
        const pages = [];
        for (let n = 1; n <= pdf.numPages; n += 1) {
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width; canvas.height = viewport.height;
          await page.render({ canvas, viewport }).promise;
          pages.push(canvas.toDataURL("image/png").split(",")[1]);
        }
        return pages;
      };
      window.ready = true;
    </script>`,
  }),
);
await viewer.goto("https://viewer.local/");
await viewer.waitForFunction("window.ready === true");

// A grey 3:4 placeholder instead of a real face, only to judge the photo slot.
const photo = await (async () => {
  const page = await browser.newPage({ viewport: { width: 300, height: 400 } });
  await page.setContent('<body style="margin:0;background:#C9CED6"></body>');
  const png = await page.screenshot({ type: "jpeg", quality: 80 });
  await page.close();
  return `data:image/jpeg;base64,${Buffer.from(png).toString("base64")}`;
})();

const report: string[] = [];
const cases = [
  ["en", enCv, ""],
  ["de", deCv, ""],
  ["tr", trCv, ""],
  ["de", fullCv, "-full"],
] as const;

async function rasterise(pdf: Uint8Array, name: string, paper: string): Promise<number> {
  // The viewer page defines `rasterise`; its result is PNG base64 strings, one per page.
  const pages = (await viewer.evaluate(`rasterise(${JSON.stringify(Buffer.from(pdf).toString("base64"))}, 2)`)) as string[];
  for (const [index, png] of pages.entries()) {
    await writeFile(join(out, paper, `${name}-p${index + 1}.png`), Buffer.from(png, "base64"));
  }
  return pages.length;
}

for (const paper of PAPERS) {
  await mkdir(join(out, paper), { recursive: true });
  for (const templateId of TEMPLATE_IDS) {
    for (const [locale, content, suffix] of cases) {
      const input = inputFor(content, locale, templateId, paper);
      const full = suffix ? { ...input, photo: { dataUrl: photo } } : input;
      const result = renderCvHtml(full);
      const name = `${templateId}-${locale}${suffix}`;
      const htmlPath = join(out, paper, `${name}.html`);
      await writeFile(htmlPath, result.html);
      await writeFile(join(out, paper, `${name}.docx`), await buildCvDocx(full));

      const pdf = await printPdf(browser, result);
      await writeFile(join(out, paper, `${name}.pdf`), pdf);
      const pages = await rasterise(pdf, name, paper);
      const missing = missingInOrder(result, (await extractPdfText(pdf)).text);
      let line = `${paper} ${name}: chromium ${pages} page(s), readback ${missing.length === 0 ? "complete" : `MISSING ${missing.join("; ")}`}`;

      if (webkitPrint) {
        const webkitPdfPath = join(out, paper, `${name}-webkit.pdf`);
        execFileSync(webkitPrint, [htmlPath, webkitPdfPath, String(result.page.widthPt), String(result.page.heightPt)], {
          timeout: 60_000,
        });
        const webkitPdf = new Uint8Array(await readFile(webkitPdfPath));
        const webkitPages = await rasterise(webkitPdf, `${name}-webkit`, paper);
        const webkitText = (await extractPdfText(webkitPdf)).text;
        const webkitMissing = missingInOrder(result, webkitText);
        const broken = webkitText.split("\n").filter((text) => text.includes("$") || text.includes("\uFFFD"));
        line += ` · webkit ${webkitPages} page(s), readback ${webkitMissing.length === 0 ? "complete" : `MISSING ${webkitMissing.join("; ")}`}`;
        if (broken.length > 0) line += ` · BROKEN GLYPHS: ${broken.join(" | ")}`;
      }
      report.push(line);
    }
  }
}
await browser.close();
await writeFile(join(out, "report.txt"), `${report.join("\n")}\n`);
console.log(report.join("\n"));
