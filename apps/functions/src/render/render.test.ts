// The server render without mocks: real cv-render HTML printed by real Chromium. On Linux x64 (CI)
// that is @sparticuz/chromium, the binary Cloud Functions runs; elsewhere chrome-headless-shell of
// the same version (scripts/local-chromium.ts, downloaded on first run).
import { createHash } from "node:crypto";
import type { CvRenderPdfRequest } from "@bfhr/core";
import { renderCvHtml } from "@bfhr/cv-render";
import { populatedDataset } from "@bfhr/fixtures";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installLocalChromium } from "../../scripts/local-chromium";
import { pdfRenderJob, UnknownTemplateError } from "./input";
import { browserVersion, closeBrowser, pdfPageCount, printHtmlToPdf, SERVER_CHROMIUM_VERSION } from "./print";

const cvEn = populatedDataset.cvs.find((cv) => cv.id === "cv-en");
const cvDe = populatedDataset.cvs.find((cv) => cv.id === "cv-de");
const revisionOf = (id: string | undefined) => {
  const revision = populatedDataset.cvRevisions.find((candidate) => candidate.id === id);
  if (revision === undefined) throw new Error(`fixture revision ${String(id)} missing`);
  return revision;
};
if (cvEn === undefined || cvDe === undefined) throw new Error("fixture CVs missing");
const revisionEn = revisionOf(cvEn.currentRevisionId);
const revisionDe = revisionOf(cvDe.currentRevisionId);
const request = (extra: Partial<CvRenderPdfRequest> = {}): CvRenderPdfRequest => ({
  cvId: "cv-en",
  ...extra,
});

async function pdfLines(bytes: Uint8Array): Promise<string> {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 });
  const document = await task.promise;
  let text = "";
  for (let number = 1; number <= document.numPages; number += 1) {
    const content = await (await document.getPage(number)).getTextContent();
    for (const item of content.items) if ("str" in item) text += item.hasEOL ? `${item.str}\n` : item.str;
  }
  await task.destroy();
  return text.replace(/\s+/gu, " ");
}

describe("pdfRenderJob", () => {
  it("prints the revision with its stored template, theme and paper in the CV's language", () => {
    const { input, fileName } = pdfRenderJob(cvDe, revisionDe, request({ cvId: "cv-de" }));
    const { meta } = revisionDe.content;
    expect(input.templateId).toBe(meta.template);
    expect(input.theme).toEqual({
      accent: meta.theme.accentColor,
      fontPair: meta.theme.fontPair,
      density: meta.theme.density,
    });
    expect(input.paper).toBe(meta.theme.paperSize);
    expect(input.locale).toBe("de");
    expect(input.photo).toBeUndefined();
    expect(fileName).toBe("Deniz-Aksoy-CV.pdf");
  });

  it("applies the request's template, theme, paper and file name", () => {
    const { input, fileName } = pdfRenderJob(
      cvEn,
      revisionEn,
      request({
        templateId: "compact",
        theme: { density: "spacious" },
        paper: "letter",
        fileName: "Deniz-Aksoy-CV-Lumenfold.pdf",
      }),
      { dataUrl: "data:image/png;base64,AAAA" },
    );
    expect(input.templateId).toBe("compact");
    expect(input.theme.density).toBe("spacious");
    expect(input.theme.accent).toBe(revisionEn.content.meta.theme.accentColor);
    expect(input.paper).toBe("letter");
    expect(input.photo).toEqual({ dataUrl: "data:image/png;base64,AAAA" });
    expect(fileName).toBe("Deniz-Aksoy-CV-Lumenfold.pdf");
  });

  it("refuses an unknown requested template; a stored unknown one renders with the default", () => {
    expect(() => pdfRenderJob(cvEn, revisionEn, request({ templateId: "fancy" }))).toThrow(
      UnknownTemplateError,
    );
    const stored = {
      ...revisionEn,
      content: { ...revisionEn.content, meta: { ...revisionEn.content.meta, template: "retired" } },
    };
    expect(pdfRenderJob(cvEn, stored, request()).input.templateId).toBe("classic");
  });
});

describe("printHtmlToPdf (real Chromium)", () => {
  beforeAll(async () => {
    if (!process.env["BFHR_CHROMIUM_PATH"] && !(process.platform === "linux" && process.arch === "x64")) {
      process.env["BFHR_CHROMIUM_PATH"] = await installLocalChromium();
    }
  }, 300_000);
  afterAll(() => closeBrowser());

  it("runs the Chromium build that ships in @sparticuz/chromium", async () => {
    expect(await browserVersion()).toContain(SERVER_CHROMIUM_VERSION);
  }, 120_000);

  it.each([
    ["en", cvEn, revisionEn],
    ["de", cvDe, revisionDe],
  ] as const)(
    "prints the %s CV with every heading and entry in the text layer",
    async (_, cv, revision) => {
      const rendered = renderCvHtml(pdfRenderJob(cv, revision, request({ cvId: cv.id })).input);
      const bytes = await printHtmlToPdf(rendered.html);
      expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
      const pages = await pdfPageCount(bytes);
      expect(pages).toBeGreaterThanOrEqual(1);
      expect(pages).toBeLessThanOrEqual(3);
      // The count must not consume the bytes that get hashed and stored.
      expect(createHash("sha256").update(bytes).digest("hex")).toMatch(/^[a-f0-9]{64}$/);
      expect(bytes.byteLength).toBeGreaterThan(10_000);

      const text = await pdfLines(bytes);
      expect(text).toContain("Deniz Aksoy");
      let cursor = 0;
      for (const section of rendered.outline) {
        for (const expected of [section.heading, ...section.entries]) {
          const at = text.indexOf(expected.replace(/\s+/gu, " "), cursor);
          expect(at, `${section.key}: ${expected}`).toBeGreaterThanOrEqual(0);
          cursor = at + expected.length;
        }
      }
    },
    120_000,
  );

  it("embeds the CV's own fonts (no system fallback) and honours the paper size", async () => {
    const letter = renderCvHtml(pdfRenderJob(cvEn, revisionEn, request({ paper: "letter" })).input);
    const bytes = await printHtmlToPdf(letter.html);
    const task = getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 });
    const page = await (await task.promise).getPage(1);
    const [, , width, height] = page.view;
    await task.destroy();
    expect(Math.round(width ?? 0)).toBe(Math.round(letter.page.widthPt));
    expect(Math.round(height ?? 0)).toBe(Math.round(letter.page.heightPt));
    // Every font in the PDF is one the HTML embeds (Skia writes the variable faces as Type 3 fonts
    // with their family name), so no glyph came from a system font.
    const families = new Set(
      [...new TextDecoder("latin1").decode(bytes).matchAll(/\/FontFamily \(([^)]+)\)/gu)].map(
        (match) => match[1],
      ),
    );
    expect([...families].sort()).toEqual(["Inter", "Source Serif 4"]);
  }, 120_000);
});
