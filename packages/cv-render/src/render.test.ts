import { CvContentSchema } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { deCv, enCv, fullCv, inputFor, PHOTO_DATA_URL, TEMPLATE_IDS, trCv } from "../test/samples";
import { renderCvHtml, SECTION_HEADINGS } from "./index";

/** The document without the stylesheet (fonts make it ~300 kB): what snapshots compare. */
function body(html: string): string {
  return html.replace(/<style>[\s\S]*<\/style>/u, "<style>…</style>");
}

function headings(html: string): string[] {
  return [...html.matchAll(/<h2 class="cv-heading">([^<]*)<\/h2>/gu)].map((match) => match[1] ?? "");
}

describe("renderCvHtml", () => {
  it("accepts the fixture CVs (they are valid CvContent)", () => {
    for (const content of [enCv, deCv, trCv, fullCv]) expect(CvContentSchema.safeParse(content).success).toBe(true);
  });

  it.each(TEMPLATE_IDS)("%s: stable structure (snapshot)", (templateId) => {
    for (const [content, locale] of [
      [enCv, "en"],
      [deCv, "de"],
      [trCv, "tr"],
    ] as const) {
      const result = renderCvHtml(inputFor(content, locale, templateId));
      expect(body(result.html)).toMatchSnapshot(`${templateId}-${locale}`);
      expect(result.outline).toMatchSnapshot(`${templateId}-${locale}-outline`);
    }
  });

  it("prints sections in meta.sectionOrder and hides the rest", () => {
    const result = renderCvHtml(inputFor(enCv, "en", "modern"));
    expect(result.outline.map((section) => section.key)).toEqual([
      "summary",
      "work",
      "projects",
      "skills",
      "education",
      "languages",
      "custom:talks",
    ]);
    // Certificates hold content but aren't in sectionOrder.
    expect(result.html).not.toContain("Web Accessibility Specialist");
    const reordered = renderCvHtml({
      ...inputFor(enCv, "en", "modern"),
      meta: { ...enCv.meta, sectionOrder: ["basics", "skills", "work"] },
    });
    expect(headings(reordered.html)).toEqual(["Summary", "Skills", "Experience"]);
  });

  it("uses standard headings in the CV's own language", () => {
    expect(headings(renderCvHtml(inputFor(enCv, "en", "modern")).html)).toEqual([
      "Summary",
      "Experience",
      "Projects",
      "Skills",
      "Education",
      "Languages",
      "Talks",
    ]);
    expect(headings(renderCvHtml(inputFor(deCv, "de-DE", "modern")).html)).toEqual([
      "Profil",
      "Berufserfahrung",
      "Kenntnisse",
      "Ausbildung",
      "Sprachen",
      "Vorträge",
    ]);
    for (const language of ["en", "tr", "de"] as const) {
      expect(Object.keys(SECTION_HEADINGS[language])).toHaveLength(12);
    }
  });

  it("upper-cases headings with Turkish rules (i → İ, ı → I) in classic and compact", () => {
    const result = renderCvHtml(inputFor(trCv, "tr", "classic"));
    expect(headings(result.html)).toEqual(["ÖZET", "DENEYİM", "YETENEKLER", "EĞİTİM", "DİLLER", "İLGİ ALANLARI"]);
    expect(result.outline.map((section) => section.heading)).toContain("İLGİ ALANLARI");
    expect(result.html).toContain('<html lang="tr">');
    // German ß upper-cases to SS; English is unaffected.
    const de = renderCvHtml({
      ...inputFor(deCv, "de", "compact"),
      meta: { ...deCv.meta, customSections: [{ id: "x", title: "Größe", items: [{ title: "a" }] }], sectionOrder: ["custom:x"] },
    });
    expect(headings(de.html)).toEqual(["GRÖSSE"]);
  });

  it("formats dates in the CV's language, open ends as Present / Günümüz / heute", () => {
    expect(renderCvHtml(inputFor(enCv, "en")).html).toContain("Mar 2022 – Present");
    expect(renderCvHtml(inputFor(deCv, "de")).html).toContain("März 2022 – heute");
    expect(renderCvHtml(inputFor(deCv, "de")).html).toContain("Feb. 2020 – Feb. 2022");
    const tr = renderCvHtml(inputFor(trCv, "tr")).html;
    expect(tr).toContain("Mar 2022 – Günümüz");
    expect(tr).toContain("Şub 2020 – Şub 2022");
    expect(tr).toContain("Eyl 2015 – Haz 2019");
    // A custom item with only a start date is a one-off, not ongoing.
    expect(renderCvHtml(inputFor(enCv, "en")).html).toMatch(/<span class="cv-dates">Apr 2025<\/span>/u);
  });

  it("is self-contained and ATS-safe: no scripts, tables, external URLs or images by default", () => {
    for (const templateId of TEMPLATE_IDS) {
      const { html } = renderCvHtml(inputFor(fullCv, "en", templateId));
      expect(html).not.toMatch(/<script|<table|<iframe|<object|<link /iu);
      expect(html).not.toMatch(/url\((?!data:)/u);
      expect(html).not.toMatch(/src="(?!data:)/u);
      expect(html).toContain("Content-Security-Policy");
      expect(html).toContain("@font-face");
      expect(html).toContain("break-after:avoid");
      expect(html).toContain("orphans:3;widows:3");
      expect(html).not.toContain("<img");
    }
  });

  it("escapes content and keeps only safe links", () => {
    const { html } = renderCvHtml(
      inputFor(
        {
          basics: {
            name: '<img src=x onerror="alert(1)">',
            url: "javascript:alert(1)",
            profiles: [{ network: "Site", url: "example.org/me" }],
          },
          work: [{ position: "A & B <Lead>", name: "Co \"Q\"", highlights: ["</li><script>x</script>"] }],
          meta: { ...enCv.meta, sectionOrder: ["basics", "work"], customSections: [] },
        },
        "en",
      ),
    );
    expect(html).not.toContain("<script>x");
    expect(html).not.toContain('<img src=x');
    expect(html).toContain("A &amp; B &lt;Lead&gt;");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("javascript:alert(1)</span>");
    expect(html).toContain('href="https://example.org/me"');
  });

  it("marks [X%] placeholders visibly and reports them", () => {
    const result = renderCvHtml(inputFor(fullCv, "en"));
    expect(result.html).toContain('Raised checkout conversion by <mark class="cv-ph" data-placeholder="">[X%]</mark>');
    expect(result.html).toContain("mark.cv-ph{");
    expect(result.placeholders).toEqual([{ path: "/work/0/highlights/0", text: "[X%]" }]);
    expect(renderCvHtml(inputFor(enCv, "en")).placeholders).toEqual([]);
  });

  it("emits data-cv-path JSON pointers for click-to-locate", () => {
    const { html } = renderCvHtml(inputFor(enCv, "en"));
    expect(html).toContain('data-cv-path="/work/0/highlights/1"');
    expect(html).toContain('data-cv-path="/basics/name"');
    expect(html).toContain('data-cv-path="/meta/customSections/0/items/0"');
    expect(html).toContain('data-cv-section="work"');
  });

  it("prints photo and date of birth only when the variant opted in", () => {
    const withPhoto = { ...inputFor(fullCv, "de"), photo: { dataUrl: PHOTO_DATA_URL } };
    const on = renderCvHtml(withPhoto).html;
    expect(on).toContain(`<img class="cv-photo" src="${PHOTO_DATA_URL}"`);
    expect(on).toContain("Geburtsdatum: 14. Mai 1996");
    expect(renderCvHtml({ ...withPhoto, locale: "tr" }).html).toContain("Doğum tarihi: 14 Mayıs 1996");
    expect(renderCvHtml({ ...withPhoto, locale: "en" }).html).toContain("Date of birth: 14 May 1996");

    const off = renderCvHtml({
      ...withPhoto,
      meta: { ...fullCv.meta, personal: { showPhoto: false, showDateOfBirth: false, dateOfBirth: "1996-05-14" } },
    }).html;
    expect(off).not.toContain("<img");
    expect(off).not.toContain("1996");
    // No `personal` at all (UK/US default) and a photo that isn't a JPEG/PNG data URL are ignored too.
    const { personal: _personal, ...metaWithout } = fullCv.meta;
    expect(renderCvHtml({ ...withPhoto, meta: metaWithout }).html).not.toContain("<img");
    expect(renderCvHtml({ ...withPhoto, photo: { dataUrl: "https://evil.example/p.jpg" } }).html).not.toContain("<img");
  });

  it("reports page geometry with fixed margins and uses them in @page", () => {
    const a4 = renderCvHtml(inputFor(enCv, "en", "classic", "a4"));
    expect(a4.page).toMatchObject({ paper: "a4", widthMm: 210, heightMm: 297, widthPt: 595.28, heightPt: 841.89 });
    expect(a4.html).toContain("@page{size:A4;margin:16mm 18mm 16mm 18mm}");
    const letter = renderCvHtml(inputFor(enCv, "en", "classic", "letter"));
    expect(letter.page).toMatchObject({ paper: "letter", widthPt: 612, heightPt: 792 });
    expect(letter.html).toContain("@page{size:letter;margin:14mm 19mm 14mm 19mm}");
  });

  it("titles the document in the CV language", () => {
    expect(renderCvHtml(inputFor(enCv, "en")).title).toBe("Deniz Aksoy – CV");
    expect(renderCvHtml(inputFor(deCv, "de")).title).toBe("Deniz Aksoy – Lebenslauf");
    expect(renderCvHtml(inputFor(trCv, "tr")).title).toBe("Deniz Aksoy – Özgeçmiş");
  });

  it("falls back for unknown template, font pair and accent values", () => {
    const result = renderCvHtml({
      ...inputFor(enCv, "en"),
      templateId: "fancy" as "classic",
      theme: { accent: "#FFFF00", fontPair: "comic", density: "comfortable" },
    });
    expect(result.html).toContain('data-template="classic"');
    expect(result.html).toContain('"CV Source Serif 4"');
    expect(result.html).not.toContain("--accent:#FFFF00");
  });
});
