import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { deCv, fullCv, inputFor, PHOTO_DATA_URL, TEMPLATE_IDS, trCv } from "../test/samples";
import { buildCvDocx, buildCvDocxBase64, renderCvHtml } from "./index";

async function documentXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("no word/document.xml");
  return xml;
}

/** Visible text in reading order, one paragraph per line. */
function paragraphsOf(xml: string): string[] {
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/gu)]
    .map((match) =>
      [...match[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/gu)]
        .map((part) => (part[0] === "<w:tab/>" ? "\t" : (part[1] ?? "")))
        .join("")
        .replace(/&amp;/gu, "&")
        .replace(/&lt;/gu, "<")
        .replace(/&gt;/gu, ">")
        .replace(/&quot;/gu, '"')
        .replace(/&apos;/gu, "'"),
    )
    .filter((text) => text.trim() !== "");
}

describe("buildCvDocx", () => {
  it.each(TEMPLATE_IDS)(
    "%s: real headings and lists, no tables, same order as the HTML",
    async (templateId) => {
      const input = inputFor(fullCv, "en", templateId);
      const xml = await documentXml(await buildCvDocx(input));
      expect(xml).not.toContain("<w:tbl");
      expect(xml).not.toContain("<w:txbxContent");
      expect(xml).not.toContain("<w:cols ");
      expect(xml).toContain('<w:pStyle w:val="Title"/>');
      expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
      expect(xml).toContain('<w:pStyle w:val="Heading3"/>');
      expect(xml).toContain("<w:numPr>");

      const text = paragraphsOf(xml).join("\n");
      let cursor = 0;
      for (const section of renderCvHtml(input).outline) {
        const found = text.indexOf(section.heading, cursor);
        expect(found, `${section.heading} after ${cursor}`).toBeGreaterThanOrEqual(cursor);
        cursor = found + section.heading.length;
        for (const entry of section.entries) {
          const at = text.indexOf(entry, cursor);
          expect(at, `${section.key}: ${entry}`).toBeGreaterThanOrEqual(cursor);
          cursor = at + entry.length;
        }
      }
    },
  );

  it("uses the paper size and the CV language", async () => {
    const a4 = await documentXml(await buildCvDocx(inputFor(deCv, "de", "classic", "a4")));
    expect(a4).toMatch(/<w:pgSz w:w="11906" w:h="16838"/u);
    const letter = await documentXml(await buildCvDocx(inputFor(deCv, "de", "classic", "letter")));
    expect(letter).toMatch(/<w:pgSz w:w="12240" w:h="15840"/u);
    const zip = await JSZip.loadAsync(await buildCvDocx(inputFor(trCv, "tr")));
    expect(await zip.file("word/styles.xml")?.async("string")).toContain('w:val="tr"');
    expect(paragraphsOf(await documentXml(await buildCvDocx(inputFor(trCv, "tr"))))).toContain("DENEYİM");
  });

  it("highlights placeholders and adds the opt-in photo", async () => {
    const bytes = await buildCvDocx({ ...inputFor(fullCv, "de"), photo: { dataUrl: PHOTO_DATA_URL } });
    const xml = await documentXml(bytes);
    expect(xml).toMatch(/<w:highlight w:val="yellow"\/>[\s\S]*?<w:t xml:space="preserve">\[X%\]<\/w:t>/u);
    expect(xml).toContain("Geburtsdatum: 14. Mai 1996");
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).some((name) => name.startsWith("word/media/"))).toBe(true);
    const without = await JSZip.loadAsync(await buildCvDocx(inputFor(fullCv, "de")));
    expect(Object.keys(without.files).some((name) => name.startsWith("word/media/"))).toBe(false);
  });

  it("returns the same document as base64", async () => {
    const base64 = await buildCvDocxBase64(inputFor(deCv, "de"));
    const xml = await documentXml(Uint8Array.from(Buffer.from(base64, "base64")));
    expect(xml).toContain("Berufserfahrung".toUpperCase());
  });
});
