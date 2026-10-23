import { CvContentSchema } from "@bfhr/core";
import { storagePaths } from "@bfhr/api";
import { describe, expect, it } from "vitest";
import {
  IMPORT_MAX_BYTES,
  applyReviewEdits,
  buildImportedCv,
  buildReviewModel,
  checkImportFile,
  checkImportFiles,
  classifyImportError,
  confidenceAt,
  defaultImportMeta,
  defaultImportTitle,
  detectImportKind,
  guessCvLanguage,
  importSectionOrder,
  newImportFileId,
  normalizePointer,
  normalizeResumeDate,
  paperSizeForLocale,
  parseCvImportResponse,
  pointerOf,
  reviewFieldProblem,
} from "./model";
import type { JsonResume } from "./schema";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const resume: JsonResume = {
  basics: {
    name: "Deniz Aksoy",
    label: "Frontend Engineer",
    email: "deniz@example.com",
    summary: "Frontend engineer with seven years of experience building design systems.",
    location: { city: "Istanbul", countryCode: "TR" },
  },
  work: [
    {
      name: "Acme",
      position: "Senior Engineer",
      startDate: "2021-03",
      highlights: ["Led the design system", "Cut bundle size by 40%"],
    },
    { name: "Globex", position: "Engineer", startDate: "2018", endDate: "2021-02" },
  ],
  education: [{ institution: "Boğaziçi University", area: "Computer Engineering", studyType: "BSc" }],
  skills: [{ name: "Frontend", keywords: ["React", "TypeScript"] }],
  awards: [],
};

describe("import files", () => {
  it("detects the kind by extension, falling back to the MIME type", () => {
    expect(detectImportKind({ name: "CV.PDF", type: "" })).toBe("pdf");
    expect(detectImportKind({ name: "cv.docx", type: "application/octet-stream" })).toBe("docx");
    expect(detectImportKind({ name: "resume.json", type: "" })).toBe("json_resume");
    expect(
      detectImportKind({ name: "Basic_LinkedInDataExport.zip", type: "application/x-zip-compressed" }),
    ).toBe("linkedin_zip");
    expect(detectImportKind({ name: "cv", type: "application/pdf" })).toBe("pdf");
    expect(detectImportKind({ name: "cv.doc", type: "application/msword" })).toBeNull();
    expect(detectImportKind({ name: "cv.pages", type: DOCX })).toBeNull();
    expect(detectImportKind({ name: "x.constructor", type: "" })).toBeNull();
  });

  it("checks type, emptiness and the 20 MB limit, and picks the content type storage.rules allows", () => {
    expect(checkImportFile({ name: "cv.pdf", type: "", size: 10 })).toEqual({
      ok: true,
      file: { kind: "pdf", requestKind: "pdf", contentType: "application/pdf" },
    });
    expect(checkImportFile({ name: "cv.docx", type: "", size: 10 })).toMatchObject({
      file: { kind: "docx", requestKind: "docx", contentType: DOCX },
    });
    expect(checkImportFile({ name: "r.json", type: "text/plain", size: 10 })).toMatchObject({
      file: { kind: "json_resume", requestKind: "json", contentType: "application/json" },
    });
    expect(checkImportFile({ name: "e.zip", type: "application/x-zip-compressed", size: 10 })).toMatchObject({
      file: { requestKind: "linkedin-zip", contentType: "application/x-zip-compressed" },
    });
    expect(checkImportFile({ name: "e.zip", type: "", size: 10 })).toMatchObject({
      file: { contentType: "application/zip" },
    });
    expect(checkImportFile({ name: "cv.pdf", type: "", size: IMPORT_MAX_BYTES })).toMatchObject({ ok: true });
    expect(checkImportFile({ name: "cv.pdf", type: "", size: IMPORT_MAX_BYTES + 1 })).toEqual({
      ok: false,
      problem: "tooLarge",
    });
    expect(checkImportFile({ name: "cv.pdf", type: "", size: 0 })).toEqual({ ok: false, problem: "empty" });
    expect(checkImportFile({ name: "cv.txt", type: "text/plain", size: 0 })).toEqual({
      ok: false,
      problem: "unsupported",
    });
  });

  it("takes exactly one file", () => {
    expect(checkImportFiles([])).toEqual({ ok: false, problem: "multiple" });
    const file = { name: "cv.pdf", type: "", size: 1 };
    expect(checkImportFiles([file, file])).toEqual({ ok: false, problem: "multiple" });
    expect(checkImportFiles([file])).toMatchObject({ ok: true });
  });

  it("makes ids that are valid Storage path segments", () => {
    const id = newImportFileId();
    expect(storagePaths.cvImport("u1", id)).toBe(`users/u1/cv-imports/${id}`);
    expect(newImportFileId(() => "fixed-id")).toBe("fixed-id");
    expect(() => newImportFileId(() => "a/b")).toThrow();
  });
});

describe("cvImport response", () => {
  const valid = {
    resume,
    confidence: { "/work/0/startDate": 0.4 },
    warnings: ["Page 3 was an image, so it was skipped."],
    model: "claude-sonnet",
    promptVersion: "cv-import@3",
  };

  it("accepts the contract and drops unknown keys", () => {
    const parsed = parseCvImportResponse({
      ...valid,
      extra: true,
      resume: { ...resume, meta: { template: "x" } },
    });
    expect(parsed?.resume.work?.[0]?.name).toBe("Acme");
    expect(parsed && "meta" in parsed.resume).toBe(false);
  });

  it("rejects malformed answers", () => {
    expect(parseCvImportResponse(null)).toBeNull();
    expect(parseCvImportResponse({ ...valid, confidence: { "/basics": 2 } })).toBeNull();
    expect(parseCvImportResponse({ ...valid, resume: { work: [{ startDate: "March 2021" }] } })).toBeNull();
    expect(parseCvImportResponse({ ...valid, warnings: undefined })).toBeNull();
  });
});

describe("confidence by JSON Pointer", () => {
  it("builds and normalizes pointers", () => {
    expect(pointerOf("work", 0, "startDate")).toBe("/work/0/startDate");
    expect(pointerOf("a/b", "c~d")).toBe("/a~1b/c~0d");
    expect(normalizePointer("#/work/0/")).toBe("/work/0");
    expect(normalizePointer("work/0")).toBe("/work/0");
    expect(normalizePointer("/")).toBe("");
  });

  it("uses the lowest score of the pointer, its parents and its children", () => {
    const confidence = {
      "/work/1": 0.5,
      "/work/0/highlights/1": 0.6,
      "/basics/name": 0.95,
      "/work/0/name": 0.9,
    };
    expect(confidenceAt(confidence, "/work/1/position")).toBe(0.5);
    expect(confidenceAt(confidence, "/work/0/highlights")).toBe(0.6);
    expect(confidenceAt(confidence, "/work/0/name")).toBe(0.9);
    expect(confidenceAt(confidence, "/basics/name")).toBe(0.95);
    expect(confidenceAt(confidence, "/basics/email")).toBeNull();
    expect(confidenceAt(confidence, "/work/10/name")).toBeNull();
    expect(confidenceAt({ "": 0.3 }, "/skills/0/name")).toBe(0.3);
  });
});

describe("review model", () => {
  const confidence = {
    "/work/0/startDate": 0.4,
    "/work/1": 0.7,
    "/basics/name": 0.99,
    "/skills/0/keywords/1": 0.5,
  };
  const model = buildReviewModel(resume, confidence);

  it("groups header, summary and non-empty sections in render order", () => {
    expect(model.sections.map((section) => section.key)).toEqual([
      "basics",
      "summary",
      "work",
      "education",
      "skills",
    ]);
    const work = model.sections.find((section) => section.key === "work");
    expect(work?.items).toHaveLength(2);
    expect(work?.items[0]?.fields.map((field) => field.key)).toEqual([
      "position",
      "organization",
      "startDate",
      "endDate",
      "highlights",
    ]);
    expect(work?.items[0]?.headingPointers).toEqual(["/work/0/position", "/work/0/name"]);
  });

  it("shows list fields joined and flags low-confidence fields, parents included", () => {
    const field = (pointer: string) => model.fields.find((candidate) => candidate.pointer === pointer);
    expect(field("/work/0/highlights")?.value).toBe("Led the design system\nCut bundle size by 40%");
    expect(field("/skills/0/keywords")).toMatchObject({ value: "React, TypeScript", flagged: true });
    expect(field("/work/0/startDate")).toMatchObject({ flagged: true, confidence: 0.4 });
    expect(field("/basics/name")).toMatchObject({ flagged: false, confidence: 0.99 });
    expect(model.sections.find((section) => section.key === "work")?.flaggedCount).toBe(6);
    expect(model.flagged.map((flagged) => flagged.pointer)).toEqual([
      "/work/0/startDate",
      "/work/1/position",
      "/work/1/name",
      "/work/1/startDate",
      "/work/1/endDate",
      "/work/1/highlights",
      "/skills/0/keywords",
    ]);
  });

  it("counts the fields that came back with a value", () => {
    // Name, headline, email, city, country, summary; 4 + 4 work; 3 education; 2 skills.
    expect(model.filledCount).toBe(6 + 8 + 3 + 2);
  });

  it("shows optional fields only with a value or a flag", () => {
    const flaggedUrl = buildReviewModel(resume, { "/work/0/url": 0.2 });
    expect(flaggedUrl.fields.some((field) => field.pointer === "/work/0/url")).toBe(true);
    expect(model.fields.some((field) => field.pointer === "/work/0/url")).toBe(false);
    // A doubtful `/work/1` flags its shown fields but doesn't surface its empty optional ones.
    expect(model.fields.some((field) => field.pointer === "/work/1/summary")).toBe(false);
  });
});

describe("applying review edits", () => {
  const model = buildReviewModel(resume, {});

  it("keeps untouched values exactly and applies edits by pointer", () => {
    const edited = applyReviewEdits(resume, model, {
      "/basics/name": "  Deniz Aksoy-Yılmaz ",
      "/work/0/startDate": "03/2021",
      "/work/0/highlights": "• Led the design system\n\n- Cut bundle size by 40%\nMentored four engineers",
      "/skills/0/keywords": "React, TypeScript,, Node.js",
      "/basics/label": "",
      "/basics/phone": "+90 555 000 00 00",
    });
    expect(edited.basics?.name).toBe("Deniz Aksoy-Yılmaz");
    expect(edited.basics && "label" in edited.basics).toBe(false);
    expect(edited.basics?.phone).toBe("+90 555 000 00 00");
    expect(edited.work?.[0]?.startDate).toBe("2021-03");
    expect(edited.work?.[0]?.highlights).toEqual([
      "Led the design system",
      "Cut bundle size by 40%",
      "Mentored four engineers",
    ]);
    expect(edited.skills?.[0]?.keywords).toEqual(["React", "TypeScript", "Node.js"]);
    expect(edited.work?.[1]).toEqual(resume.work?.[1]);
    expect(resume.basics?.name).toBe("Deniz Aksoy");
  });

  it("creates missing parents and removes emptied lists", () => {
    const bare = buildReviewModel({}, {});
    const edited = applyReviewEdits({}, bare, { "/basics/location/city": "Berlin", "/basics/summary": "  " });
    expect(edited).toEqual({ basics: { location: { city: "Berlin" } } });
    const cleared = applyReviewEdits(resume, model, { "/work/0/highlights": " \n " });
    expect(cleared.work?.[0] && "highlights" in cleared.work[0]).toBe(false);
  });

  it("explains values that can't be saved", () => {
    expect(reviewFieldProblem({ kind: "date" }, "2021-03")).toBeNull();
    expect(reviewFieldProblem({ kind: "date" }, "3.2021")).toBeNull();
    expect(reviewFieldProblem({ kind: "date" }, "")).toBeNull();
    expect(reviewFieldProblem({ kind: "date" }, "March 2021")).toBe("invalidDate");
    expect(reviewFieldProblem({ kind: "text" }, "x".repeat(501))).toBe("tooLong");
    expect(reviewFieldProblem({ kind: "lines" }, Array.from({ length: 101 }, () => "a").join("\n"))).toBe(
      "tooMany",
    );
    expect(normalizeResumeDate(" 7-2020 ")).toBe("2020-07");
  });
});

describe("the new CV", () => {
  it("derives paper size from the locale", () => {
    expect(paperSizeForLocale("en-US")).toBe("letter");
    expect(paperSizeForLocale("en-GB")).toBe("a4");
    expect(paperSizeForLocale("tr-TR")).toBe("a4");
    expect(paperSizeForLocale("not a locale")).toBe("a4");
  });

  it("orders basics first, then sections with content", () => {
    expect(importSectionOrder(resume)).toEqual(["basics", "work", "education", "skills"]);
    expect(importSectionOrder({ projects: [{ name: " " }] })).toEqual(["basics"]);
  });

  it("builds meta defaults that satisfy the schema", () => {
    const meta = defaultImportMeta(resume, "en-US");
    expect(meta).toEqual({
      template: "classic",
      theme: {
        accentColor: "#0F766E",
        fontPair: "inter-source-serif",
        density: "comfortable",
        paperSize: "letter",
      },
      sectionOrder: ["basics", "work", "education", "skills"],
      customSections: [],
    });
    expect(CvContentSchema.safeParse({ ...resume, meta }).success).toBe(true);
  });

  it("guesses the CV language from its text", () => {
    expect(guessCvLanguage(resume, "de")).toBe("en");
    expect(
      guessCvLanguage(
        {
          basics: {
            summary:
              "Yedi yıllık deneyime sahip, tasarım sistemleri ve erişilebilirlik üzerinde çalışan bir mühendis.",
          },
        },
        "en",
      ),
    ).toBe("tr");
    expect(
      guessCvLanguage(
        {
          basics: {
            summary:
              "Ich bin Ingenieurin mit Erfahrung in der Entwicklung von Designsystemen und Barrierefreiheit.",
          },
        },
        "en",
      ),
    ).toBe("de");
    expect(guessCvLanguage({ basics: { name: "Deniz" } }, "tr-TR")).toBe("tr");
    expect(guessCvLanguage({}, "fr-FR")).toBe("en");
  });

  it("names the CV after the file, or the person for LinkedIn exports", () => {
    expect(defaultImportTitle("Deniz_Aksoy_CV_2025.pdf", "pdf", resume)).toBe("Deniz Aksoy CV 2025");
    expect(defaultImportTitle("Basic_LinkedInDataExport_10-23-2026.zip", "linkedin_zip", resume)).toBe(
      "Deniz Aksoy",
    );
    expect(defaultImportTitle(".pdf", "pdf", resume)).toBe(".pdf");
    expect(defaultImportTitle("___.pdf", "pdf", resume)).toBe("Deniz Aksoy");
  });

  it("assembles a valid ImportedCv", () => {
    const cv = buildImportedCv({
      resume,
      title: "  Deniz Aksoy CV ",
      language: "en",
      locale: "en-GB",
      kind: "pdf",
      storagePath: "users/u1/cv-imports/f1",
      fileName: "Deniz_Aksoy_CV_2025.pdf",
    });
    expect(cv.title).toBe("Deniz Aksoy CV");
    expect(cv.content.meta.theme.paperSize).toBe("a4");
    expect(cv.content.work?.[0]?.name).toBe("Acme");
    expect(cv.importedFrom).toEqual({
      kind: "pdf",
      storagePath: "users/u1/cv-imports/f1",
      fileName: "Deniz_Aksoy_CV_2025.pdf",
    });
    expect(() =>
      buildImportedCv({
        resume,
        title: " ",
        language: "en",
        locale: "en",
        kind: "pdf",
        storagePath: "p",
        fileName: "f",
      }),
    ).toThrow();
  });
});

describe("import errors", () => {
  const online = { online: true };
  const error = (code: string, reason?: string) => ({ code, ...(reason && { details: { reason } }) });

  it("maps callable errors by code and reason", () => {
    expect(classifyImportError(error("functions/resource-exhausted", "daily_cap"), online)).toBe("dailyCap");
    expect(classifyImportError(error("functions/failed-precondition", "ai_disabled"), online)).toBe(
      "aiDisabled",
    );
    expect(classifyImportError(error("functions/failed-precondition", "no_text"), online)).toBe("noText");
    expect(classifyImportError(error("functions/failed-precondition", "unreadable_file"), online)).toBe(
      "unreadableFile",
    );
    expect(classifyImportError(error("functions/permission-denied", "email_unverified"), online)).toBe(
      "emailUnverified",
    );
    expect(classifyImportError(error("functions/unauthenticated"), online)).toBe("signedOut");
    expect(classifyImportError(error("functions/invalid-argument"), online)).toBe("invalidFile");
    expect(classifyImportError(error("functions/not-found"), online)).toBe("fileMissing");
    expect(classifyImportError(error("functions/deadline-exceeded"), online)).toBe("timeout");
    expect(classifyImportError(error("functions/unavailable"), online)).toBe("offline");
    expect(classifyImportError(error("functions/internal"), online)).toBe("serverFailed");
    expect(classifyImportError(new Error("boom"), online)).toBe("serverFailed");
  });

  it("maps upload errors, and anything while offline", () => {
    expect(classifyImportError(error("storage/canceled"), { online: false })).toBe("canceled");
    expect(classifyImportError(error("storage/unauthorized"), online)).toBe("uploadRejected");
    expect(classifyImportError(error("storage/unauthenticated"), online)).toBe("signedOut");
    expect(classifyImportError(error("storage/retry-limit-exceeded"), online)).toBe("uploadFailed");
    expect(classifyImportError(error("storage/retry-limit-exceeded"), { online: false })).toBe("offline");
    expect(classifyImportError(error("functions/internal"), { online: false })).toBe("offline");
  });
});
