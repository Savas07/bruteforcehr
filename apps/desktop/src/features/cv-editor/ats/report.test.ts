import type { CvContent } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { sampleCv } from "./__fixtures__/sampleCv";
import { extractJobKeywords } from "./keywords";
import { foldText, TextIndex } from "./normalize";
import { atsReport, type AtsReport } from "./report";

/** What a parser reads from a clean export of `sampleCv` (lines as pdf.js joins them). */
const cleanText = `Ayşe Yılmaz
Senior Backend Engineer
ayse.yilmaz@example.com · +49 30 1234 5678 · Berlin
SUMMARY
Backend engineer who builds efficient, well-tested services for logistics platforms.
EXPERIENCE
Senior Backend Engineer, Müller & Söhne GmbH Mar 2021 – Present
Moved the order pipeline to Kubernetes and cut deployment time with a new CI/CD setup.
Software Engineer, Kargo Teknoloji A.Ş. Sep 2017 – Feb 2021
Built the courier tracking API in Node.js and TypeScript.

EDUCATION
Orta Doğu Teknik Üniversitesi Sep 2013 – Jun 2017
BSc, Computer Engineering
SKILLS
Backend: C#, .NET, Node.js, TypeScript, PostgreSQL
Operations: Kubernetes, Docker, CI/CD
LANGUAGES
Turkish (Native), German (Fluent), English (Fluent)
CERTIFICATIONS
Certified Kubernetes Administrator, CNCF, May 2022
TALKS
Zero-downtime deploys at scale, GoDays Berlin`;

const statusOf = (report: AtsReport, key: string) => report.sections.find((section) => section.key === key);

describe("foldText", () => {
  it("ignores case, diacritics, ligatures, smart quotes and odd spaces", () => {
    expect(foldText("Ayşe  YILMAZ")).toBe("ayse yilmaz");
    expect(foldText("İŞ DENEYİMİ")).toBe(foldText("İş Deneyimi"));
    expect(foldText("Straße")).toBe("strasse");
    expect(foldText("Certiﬁcations")).toBe("certifications");
    expect(foldText("O’Brien’s “team”")).toBe(`o'brien's "team"`);
    expect(foldText("a\u00A0b\u200Bc\u00ADd")).toBe("a bcd");
  });

  it("joins words hyphenated at a line end, but keeps capitalised compounds", () => {
    expect(foldText("interna-\ntionalisation")).toBe("internationalisation");
    expect(foldText("Full-\nStack")).toBe("full-\nstack");
  });
});

describe("TextIndex", () => {
  const index = new TextIndex(
    "Skills\nC#, .NET, Node.js and CI/CD\nPhone: +49 (30) 1234-5678\nE X P E R I E N C E",
  );

  it("matches whole words only for short needles", () => {
    expect(index.has("C#")).toBe(true);
    expect(index.has(".net")).toBe(true);
    expect(index.has("node.js")).toBe(true);
    expect(index.has("CI/CD")).toBe(true);
    expect(index.has("Node")).toBe(true);
    expect(index.has("od")).toBe(false);
  });

  it("matches phone numbers digit by digit and spaced-out headings", () => {
    expect(index.hasPhone("+49 30 12345678")).toBe(true);
    expect(index.hasPhone("+49 30 999")).toBe(false);
    expect(index.hasLine("Experience")).toBe(true);
    expect(index.hasLine("Skills")).toBe(true);
    expect(index.hasLine("Education")).toBe(false);
  });
});

describe("atsReport", () => {
  it("reports every visible section as read back from clean text", () => {
    const report = atsReport({ text: cleanText, content: sampleCv, language: "en" });
    expect(report.sections.map((section) => section.key)).toEqual([
      "basics",
      "summary",
      ...sampleCv.meta.sectionOrder.slice(1),
    ]);
    for (const section of report.sections) expect(section).toMatchObject({ status: "ok", missing: [] });
    expect(statusOf(report, "basics")).toMatchObject({ title: null, headingFound: null, total: 5 });
    expect(statusOf(report, "summary")).toMatchObject({ title: "Summary", headingFound: true });
    expect(statusOf(report, "work")).toMatchObject({
      title: "Experience",
      headingFound: true,
      found: 8,
      total: 8,
    });
    expect(statusOf(report, "custom:talks")?.title).toBe("Talks");
    expect(report.score).toBe(100);
    expect(report.keywords).toBeNull();
  });

  it("lists what didn't read back, with dates formatted in the CV's language", () => {
    const text = cleanText
      .replace("Kargo Teknoloji A.Ş.", "")
      .replace("Feb 2021", "")
      .replace("EDUCATION\n", "")
      .replace(/SKILLS[\s\S]*?(?=LANGUAGES)/, "");
    const report = atsReport({ text, content: sampleCv, language: "en" });
    // 2021 still appears (the first job's start), so only the employer is missing from work.
    expect(statusOf(report, "work")).toMatchObject({ status: "partial", missing: ["Kargo Teknoloji A.Ş."] });
    expect(statusOf(report, "education")).toMatchObject({
      status: "partial",
      headingFound: false,
      missing: [],
    });
    // C#, .NET, PostgreSQL, Docker and the group name "Operations" appear nowhere else.
    expect(statusOf(report, "skills")).toMatchObject({
      status: "partial",
      headingFound: false,
      missing: ["C#", ".NET", "PostgreSQL", "Operations", "Docker"],
    });
    expect(report.score).toBeLessThan(100);
  });

  it("formats a missing date in the CV's language", () => {
    const content: CvContent = {
      ...sampleCv,
      work: [{ name: "Acme", position: "Engineer", startDate: "2019-03", endDate: "2020-05" }],
      meta: { ...sampleCv.meta, sectionOrder: ["work"] },
    };
    const report = atsReport({ text: "Berufserfahrung\nEngineer, Acme 2019 –", content, language: "de" });
    expect(statusOf(report, "work")).toMatchObject({ status: "partial", missing: ["Mai 2020"] });
    const ongoing = atsReport({
      text: "Deneyim\nEngineer, Acme 2019",
      content: { ...content, work: [{ name: "Acme", position: "Engineer", startDate: "2019-03" }] },
      language: "tr",
    });
    expect(statusOf(ongoing, "work")?.missing).toEqual(["Günümüz"]);
  });

  it("looks for the standard heading in the CV's language", () => {
    const content: CvContent = { ...sampleCv, meta: { ...sampleCv.meta, sectionOrder: ["work", "skills"] } };
    const tr = atsReport({
      text: cleanText.replace("EXPERIENCE", "DENEYİM").replace("SKILLS", "YETENEKLER"),
      content,
      language: "tr",
    });
    expect(tr.sections.map((section) => [section.title, section.headingFound])).toEqual([
      ["Deneyim", true],
      ["Yetenekler", true],
    ]);
    const de = atsReport({ text: cleanText, content, language: "de" });
    expect(de.sections.map((section) => [section.title, section.headingFound])).toEqual([
      ["Berufserfahrung", false],
      ["Kenntnisse", false],
    ]);
  });

  it("shows upper-cased printed headings as written, and finds them", () => {
    const outline = [
      { key: "summary", heading: "SUMMARY", entries: [] },
      { key: "custom:talks", heading: "TALKS", entries: ["Zero-downtime deploys at scale"] },
    ];
    const report = atsReport({ text: cleanText, content: sampleCv, language: "en", outline });
    expect(report.sections.map((section) => [section.key, section.title, section.status])).toEqual([
      ["basics", null, "ok"],
      ["summary", "Summary", "ok"],
      ["custom:talks", "Talks", "ok"],
    ]);
    const tr = atsReport({
      text: "DENEYİM\nSenior Backend Engineer",
      content: sampleCv,
      language: "tr",
      outline: [{ key: "work", heading: "DENEYİM", entries: ["Senior Backend Engineer"] }],
    });
    expect(tr.sections.find((section) => section.key === "work")).toMatchObject({
      title: "Deneyim",
      headingFound: true,
    });
  });

  it("checks exactly what the renderer printed when given its outline", () => {
    const content: CvContent = { ...sampleCv, meta: { ...sampleCv.meta, sectionOrder: ["basics", "work"] } };
    const outline = [
      { key: "work", heading: "Work history", entries: ["Senior Backend Engineer", "Staff Engineer"] },
    ];
    const report = atsReport({
      text: cleanText.replace("EXPERIENCE", "WORK HISTORY"),
      content,
      language: "en",
      outline,
    });
    // Header first, then the outline's sections only: no summary, because the outline has none.
    expect(report.sections.map((section) => section.key)).toEqual(["basics", "work"]);
    expect(statusOf(report, "work")).toMatchObject({
      title: "Work history",
      headingFound: true,
      status: "partial",
      // Printed titles and the content's own facts, each once.
      total: 9,
      missing: ["Staff Engineer"],
    });
  });

  it("skips hidden and empty sections and flags contact details the CV doesn't have", () => {
    const content: CvContent = {
      basics: { name: "Ayşe Yılmaz" },
      projects: [],
      meta: { ...sampleCv.meta, sectionOrder: ["basics", "projects"], customSections: [] },
    };
    const report = atsReport({ text: "AYSE YILMAZ", content, language: "en" });
    expect(report.sections.map((section) => section.key)).toEqual(["basics"]);
    expect(report.contact).toEqual({ name: true, email: null, phone: null });
  });

  it("says when the PDF has no text at all", () => {
    const report = atsReport({ text: " \n ", content: sampleCv, language: "en" });
    expect(report.textFound).toBe(false);
    expect(report.score).toBe(0);
    expect(report.contact).toEqual({ name: false, email: false, phone: false });
    for (const section of report.sections) expect(section.status).toBe("missing");
  });

  it("covers job keywords case- and diacritic-insensitively against the PDF text", () => {
    const jobDescription = `Senior Backend Engineer (m/w/d)
We are looking for an engineer with strong C# and .NET skills. You run services on Kubernetes,
own our CI/CD pipelines and write Node.js services. Experience with Terraform and Google Cloud is a plus.
Kubernetes experience is a must; event-driven architecture and event-driven design are core to the role.`;
    const report = atsReport({ text: cleanText, content: sampleCv, language: "en", jobDescription });
    const matched = report.keywords?.matched.map((keyword) => keyword.keyword);
    const missing = report.keywords?.missing.map((keyword) => keyword.keyword);
    expect(matched).toEqual(expect.arrayContaining(["C#", ".NET", "Kubernetes", "CI/CD", "Node.js"]));
    expect(missing).toEqual(expect.arrayContaining(["Terraform", "Google Cloud", "event-driven"]));
    expect(report.keywords?.total).toBe((matched?.length ?? 0) + (missing?.length ?? 0));
    expect(report.keywords?.matched.find((keyword) => keyword.keyword === "Kubernetes")?.count).toBe(2);
    expect(
      atsReport({ text: cleanText, content: sampleCv, language: "en", jobDescription: "  " }).keywords,
    ).toBeNull();
  });
});

describe("extractJobKeywords", () => {
  it("keeps tech-like tokens and names, drops stopwords and job-ad filler", () => {
    const keywords = extractJobKeywords(
      "You have 5+ years of experience with TypeScript, React and PostgreSQL. Knowledge of UI/UX and AWS, e.g. Lambda.",
      "en",
    ).map((keyword) => keyword.keyword);
    expect(keywords).toEqual(expect.arrayContaining(["TypeScript", "React", "PostgreSQL", "UI/UX", "AWS"]));
    for (const filler of ["You", "years", "experience", "Knowledge", "e.g", "5+"])
      expect(keywords).not.toContain(filler);
  });

  it("finds repeated word pairs and splits slash lists of words", () => {
    const keywords = extractJobKeywords(
      "Machine learning is central. You bring machine learning research and Kubernetes/Docker skills.",
      "en",
    ).map((keyword) => keyword.keyword);
    expect(keywords).toContain("Machine learning");
    expect(keywords).not.toContain("learning");
    expect(keywords).toEqual(expect.arrayContaining(["Kubernetes", "Docker"]));
  });

  it("handles Turkish suffixes and German capitalised nouns", () => {
    const tr = extractJobKeywords(
      "En az 3 yıl Python'da deneyimli, Docker ve Kubernetes bilgisi olan adaylar arıyoruz.",
      "tr",
    );
    expect(tr.map((keyword) => keyword.keyword)).toEqual(["Python", "Docker", "Kubernetes"]);
    const de = extractJobKeywords(
      "Du hast Erfahrung mit Kubernetes und arbeitest gern im Team mit Kubernetes.",
      "de",
    );
    expect(de.map((keyword) => keyword.keyword)).toEqual(["Kubernetes"]);
  });

  it("matches inflected forms of plain words in the CV", () => {
    const report = atsReport({
      text: "Yazılımları geliştirdim. Mikroservisler",
      content: { meta: { ...sampleCv.meta, sectionOrder: [] } },
      language: "tr",
      jobDescription: "Yazılım geliştirme: yazılım ve mikroservis. Mikroservis mimarisi.",
    });
    expect(report.keywords?.matched.map((keyword) => keyword.keyword)).toEqual(
      expect.arrayContaining(["Yazılım", "mikroservis"]),
    );
  });
});
