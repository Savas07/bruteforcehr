// ATS round trip: render → Chromium print-to-PDF → pdf.js text layer → every section heading and
// entry present, in order, for every template × paper × language. Needs Playwright's Chromium
// (`pnpm --filter @bfhr/cv-render exec playwright install chromium`; CI installs it).
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deCv, enCv, fullCv, inputFor, PAPERS, PHOTO_DATA_URL, TEMPLATE_IDS, trCv } from "../test/samples";
import { extractPdfText, launchChromium, missingInOrder, printPdf } from "../test/pdf";
import { renderCvHtml } from "./index";

let browser: Browser;

beforeAll(async () => {
  browser = await launchChromium();
}, 60_000);
afterAll(() => browser.close());

const CVS = [
  ["en", enCv],
  ["de", deCv],
  ["tr", trCv],
] as const;

describe("ATS round trip (Chromium PDF → pdf.js text)", () => {
  for (const templateId of TEMPLATE_IDS) {
    for (const paper of PAPERS) {
      it.each(CVS)(
        `${templateId} · ${paper} · %s reads back every section and entry in order`,
        async (locale, content) => {
          const result = renderCvHtml(inputFor(content, locale, templateId, paper));
          const pdf = await extractPdfText(await printPdf(browser, result));
          expect(missingInOrder(result, pdf.text)).toEqual([]);
          expect(pdf.title).toBe(result.title);
          // Contact details and dates survive as text.
          expect(pdf.text).toContain("Deniz Aksoy");
          expect(pdf.text).toContain("deniz.aksoy@example.com");
          expect(pdf.text).toContain(
            locale === "en"
              ? "Mar 2022 – Present"
              : locale === "de"
                ? "März 2022 – heute"
                : "Mar 2022 – Günümüz",
          );
        },
      );
    }
  }

  it("keeps Turkish and German letters intact in the text layer", async () => {
    const tr = await extractPdfText(await printPdf(browser, renderCvHtml(inputFor(trCv, "tr", "classic"))));
    for (const word of [
      "DENEYİM",
      "İLGİ ALANLARI",
      "Işık fotoğrafçılığı",
      "İstanbul Teknik Üniversitesi",
      "Şub 2020",
    ]) {
      expect(tr.text).toContain(word);
    }
    const de = await extractPdfText(await printPdf(browser, renderCvHtml(inputFor(deCv, "de", "modern"))));
    for (const word of ["Berufserfahrung", "Käufer:innen", "Vorträge", "Grundkenntnisse (A2)"]) {
      expect(de.text).toContain(word);
    }
  });

  it.each([
    ["inter-source-serif", ["CV Source Serif 4", "CV Inter"]],
    ["inter", ["CV Inter"]],
    ["source-sans-serif", ["CV Source Serif 4", "CV Source Sans 3"]],
  ] as const)("%s: the embedded faces load (no system font fallback)", async (fontPair, families) => {
    const input = inputFor(trCv, "tr", "classic");
    const result = renderCvHtml({ ...input, theme: { ...input.theme, fontPair } });
    const page = await browser.newPage();
    await page.setContent(result.html, { waitUntil: "load" });
    const faces = (await page.evaluate(
      "document.fonts.ready.then(set => [...set].map(face => `${face.family} ${face.status}`))",
    )) as string[];
    await page.close();
    // Turkish text needs both the Latin and the Latin Extended face of each family.
    for (const family of families) {
      expect(
        faces.filter((face) => face === `${family} loaded`),
        faces.join(),
      ).toHaveLength(2);
    }
    expect(faces.filter((face) => face.endsWith("error"))).toEqual([]);
  });

  it("reads back the every-section CV with photo, date of birth and a placeholder", async () => {
    for (const templateId of TEMPLATE_IDS) {
      const result = renderCvHtml({
        ...inputFor(fullCv, "en", templateId),
        photo: { dataUrl: PHOTO_DATA_URL },
      });
      const pdf = await extractPdfText(await printPdf(browser, result));
      expect(missingInOrder(result, pdf.text)).toEqual([]);
      expect(pdf.text).toContain("Date of birth: 14 May 1996");
      expect(pdf.text).toContain("Raised checkout conversion by [X%] after the redesign.");
    }
  });
});
