import { readFileSync } from "node:fs";
import path from "node:path";
import { renderCvHtml, type TemplateId } from "@bfhr/cv-render";
import { describe, expect, it } from "vitest";
import { sampleCv } from "./__fixtures__/sampleCv";
import { extractPdfText } from "./extract";
import { atsReport } from "./report";

// `sampleCv` rendered by @bfhr/cv-render and printed by Chromium (`__fixtures__/generate.ts`).
const fixture = (template: TemplateId): Uint8Array =>
  new Uint8Array(readFileSync(path.join(import.meta.dirname, `__fixtures__/sample-cv-${template}.pdf`)));

const { meta, ...resume } = sampleCv;
const outline = (templateId: TemplateId) =>
  renderCvHtml({
    resume,
    meta,
    templateId,
    theme: { accent: meta.theme.accentColor, fontPair: meta.theme.fontPair, density: meta.theme.density },
    paper: meta.theme.paperSize,
    locale: "en",
  }).outline;

describe("extractPdfText", () => {
  it("reads a real PDF as lines of text, page by page", async () => {
    const { pages, text } = await extractPdfText(fixture("classic"));
    expect(pages.length).toBeGreaterThan(0);
    expect(text).toBe(pages.join("\n\n"));
    expect(text).toMatch(/^Ayşe Yılmaz$/m);
    expect(text).toContain("ayse.yilmaz@example.com");
    expect(text).toContain("Orta Doğu Teknik Üniversitesi");
    expect(text).toContain("Node.js");
  });

  it("leaves the caller's bytes usable (pdf.js detaches what it's given)", async () => {
    const bytes = fixture("classic");
    await extractPdfText(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
    await expect(extractPdfText(bytes)).resolves.toMatchObject({ pages: expect.any(Array) });
  });

  it("works without async iteration of ReadableStream (WKWebView on macOS)", async () => {
    const prototype = ReadableStream.prototype;
    const iterator = Object.getOwnPropertyDescriptor(prototype, Symbol.asyncIterator);
    if (!iterator) throw new Error("this runtime has no ReadableStream async iteration to remove");
    Reflect.deleteProperty(prototype, Symbol.asyncIterator);
    try {
      const { text } = await extractPdfText(fixture("classic"));
      expect(text).toMatch(/^Ayşe Yılmaz$/m);
    } finally {
      Object.defineProperty(prototype, Symbol.asyncIterator, iterator);
    }
  });

  it("rejects bytes that aren't a PDF", async () => {
    await expect(extractPdfText(new TextEncoder().encode("not a pdf"))).rejects.toThrow();
  });

  for (const template of ["classic", "modern", "compact"] as const) {
    it(`round-trips every section of the ${template} template, with and without its outline`, async () => {
      const { text } = await extractPdfText(fixture(template));
      const expected = [
        ["basics", "ok", []],
        ["summary", "ok", []],
        ["work", "ok", []],
        ["education", "ok", []],
        ["skills", "ok", []],
        ["languages", "ok", []],
        ["certificates", "ok", []],
        ["custom:talks", "ok", []],
      ];
      for (const report of [
        atsReport({ text, content: sampleCv, language: "en" }),
        atsReport({ text, content: sampleCv, language: "en", outline: outline(template) }),
      ]) {
        expect(report.textFound).toBe(true);
        expect(report.sections.map((section) => [section.key, section.status, section.missing])).toEqual(
          expected,
        );
        expect(report.contact).toEqual({ name: true, email: true, phone: true });
        expect(report.score).toBe(100);
      }
    });
  }
});
