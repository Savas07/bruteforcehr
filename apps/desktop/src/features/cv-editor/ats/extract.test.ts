import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sampleCv } from "./__fixtures__/sampleCv";
import { extractPdfText } from "./extract";
import { atsReport } from "./report";

// Chromium-printed CV (`__fixtures__/generate.ts`): embedded font subsets, two A4 pages.
const bytes = new Uint8Array(readFileSync(path.join(import.meta.dirname, "__fixtures__/sample-cv.pdf")));

describe("extractPdfText", () => {
  it("reads every page of a real PDF as lines of text", async () => {
    const { pages, text } = await extractPdfText(bytes);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatch(/^Ayşe Yılmaz$/m);
    expect(pages[0]).toContain("ayse.yilmaz@example.com");
    expect(pages[0]).toMatch(/^EXPERIENCE$/m);
    expect(pages[1]).toMatch(/^EDUCATION$/m);
    expect(pages[1]).toContain("Orta Doğu Teknik Üniversitesi");
    expect(pages[1]).toContain("C#, .NET, Node.js, TypeScript, PostgreSQL");
    expect(text).toBe(pages.join("\n\n"));
  });

  it("leaves the caller's bytes usable (pdf.js detaches what it's given)", async () => {
    await extractPdfText(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
    await expect(extractPdfText(bytes)).resolves.toMatchObject({ pages: expect.any(Array) });
  });

  it("rejects bytes that aren't a PDF", async () => {
    await expect(extractPdfText(new TextEncoder().encode("not a pdf"))).rejects.toThrow();
  });

  it("round-trips every section of the sample CV", async () => {
    const { text } = await extractPdfText(bytes);
    const report = atsReport({ text, content: sampleCv, language: "en" });
    expect(report.textFound).toBe(true);
    expect(report.sections.map((section) => [section.key, section.status, section.missing])).toEqual([
      ["basics", "ok", []],
      ["work", "ok", []],
      ["education", "ok", []],
      ["skills", "ok", []],
      ["languages", "ok", []],
      ["certificates", "ok", []],
      ["custom:talks", "ok", []],
    ]);
    expect(report.contact).toEqual({ name: true, email: true, phone: true });
    expect(report.score).toBe(100);
  });
});
