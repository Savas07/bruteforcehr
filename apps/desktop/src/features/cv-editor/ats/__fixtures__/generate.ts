// Regenerates `sample-cv-<template>.pdf` (ATS extraction tests): `sampleCv.ts` rendered by
// @bfhr/cv-render in each template and printed to PDF by Chromium, as the desktop export does.
// Run from apps/desktop after building the renderer's IIFE:
//
//   pnpm --filter @bfhr/cv-render build
//   node src/features/cv-editor/ats/__fixtures__/generate.ts
//
// Runs on Node 22 type stripping; needs the Playwright Chromium (`pnpm exec playwright install chromium`).
import { writeFileSync } from "node:fs";
import path from "node:path";
import type * as CvRender from "@bfhr/cv-render";
import type { CvRenderInput, TemplateId } from "@bfhr/cv-render";
import { chromium } from "playwright";
import { sampleCv } from "./sampleCv.ts";

declare global {
  // Set by dist/cv-render.iife.js (packages/cv-render/src/iife.ts).
  var BFHRCvRender: typeof CvRender;
}

const iife = path.resolve(import.meta.dirname, "../../../../../../../packages/cv-render/dist/cv-render.iife.js");
const templates: readonly TemplateId[] = ["classic", "modern", "compact"];
const { meta, ...resume } = sampleCv;

const browser = await chromium.launch();
try {
  for (const templateId of templates) {
    const input: CvRenderInput = {
      resume,
      meta,
      templateId,
      theme: { accent: meta.theme.accentColor, fontPair: meta.theme.fontPair, density: meta.theme.density },
      paper: meta.theme.paperSize,
      locale: "en",
    };
    // A fresh page each time: the rendered document's CSP would block the next script tag.
    const page = await browser.newPage();
    await page.addScriptTag({ path: iife });
    const html = await page.evaluate((value) => globalThis.BFHRCvRender.renderCvHtml(value).html, input);
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true });
    const out = path.join(import.meta.dirname, `sample-cv-${templateId}.pdf`);
    writeFileSync(out, pdf);
    console.log(`wrote ${path.relative(process.cwd(), out)} (${pdf.length} bytes)`);
    await page.close();
  }
} finally {
  await browser.close();
}
