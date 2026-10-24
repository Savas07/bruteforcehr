import { describe, expect, it } from "vitest";
import { deCv, enCv, inputFor, TEMPLATE_IDS } from "../test/samples";
import { type CoverLetterRenderInput, renderCoverLetterHtml, renderCvHtml } from "./index";

/** Snapshot-stable HTML: styles collapsed, and the package version masked. */
function body(html: string): string {
  return html
    .replace(/<style>[\s\S]*<\/style>/u, "<style>…</style>")
    .replace(/(<meta name="generator" content="BruteForceHR cv-render )[^"]+(">)/u, "$1x.y.z$2");
}

function letterFor(content: typeof enCv, locale: string, overrides: Partial<CoverLetterRenderInput> = {}): CoverLetterRenderInput {
  const cv = inputFor(content, locale);
  return {
    basics: cv.resume.basics,
    recipient: { company: "Halden Systems", contactName: "Lena Brandt" },
    date: "2026-10-24",
    subject: "Application: Product Designer",
    body: "Dear Lena Brandt,\n\nI'd like to apply for the Product Designer role.\nThank you for reading.\n\nKind regards,\nDeniz",
    templateId: cv.templateId,
    theme: cv.theme,
    paper: cv.paper,
    locale,
    ...overrides,
  };
}

describe("renderCoverLetterHtml", () => {
  it.each(TEMPLATE_IDS)("%s: stable structure (snapshot)", (templateId) => {
    expect(body(renderCoverLetterHtml(letterFor(enCv, "en", { templateId })).html)).toMatchSnapshot();
  });

  it("prints sender, recipient, date, subject and paragraphs in reading order", () => {
    const { html, title, lang } = renderCoverLetterHtml(letterFor(enCv, "en"));
    const name = enCv.basics?.name ?? "";
    expect(title).toBe(`${name} – Cover letter`);
    expect(lang).toBe("en");
    const order = [name, "Lena Brandt", "Halden Systems", "24 October 2026", "Application: Product Designer", "Dear Lena Brandt,"];
    const positions = order.map((text) => html.indexOf(text));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).toContain("<p>Dear Lena Brandt,</p>");
    expect(html).toContain("<p>I&#39;d like to apply for the Product Designer role.<br>Thank you for reading.</p>");
    expect(html).toContain('<time datetime="2026-10-24">');
  });

  it("uses the CV's page, theme and header so both documents match", () => {
    const cv = renderCvHtml(inputFor(enCv, "en"));
    const letter = renderCoverLetterHtml(letterFor(enCv, "en"));
    expect(letter.page).toEqual(cv.page);
    const cvHeader = /<header class="cv-header[\s\S]*?<\/header>/u.exec(cv.html)?.[0];
    expect(cvHeader).toBeDefined();
    expect(letter.html).toContain(cvHeader);
    expect(letter.html).toContain("Content-Security-Policy");
    expect(letter.html).not.toMatch(/<script/u);
  });

  it("writes the date and title in the letter's language", () => {
    const letter = renderCoverLetterHtml(letterFor(deCv, "de"));
    expect(letter.lang).toBe("de");
    expect(letter.html).toContain("24. Oktober 2026");
    expect(letter.title).toMatch(/– Anschreiben$/u);
  });

  it("escapes text, skips a blank subject and contact, and reports placeholders", () => {
    const letter = renderCoverLetterHtml(
      letterFor(enCv, "en", {
        recipient: { company: "A&B <Labs>", contactName: null },
        subject: "  ",
        body: "I improved conversion by [X%].",
      }),
    );
    expect(letter.html).toContain("<p>A&amp;B &lt;Labs&gt;</p>");
    expect(letter.html).not.toContain("cl-subject\">");
    expect(letter.placeholders).toEqual([{ path: "/body", text: "[X%]" }]);
    expect(letter.html).toContain('<mark class="cv-ph" data-placeholder="">[X%]</mark>');
  });
});
