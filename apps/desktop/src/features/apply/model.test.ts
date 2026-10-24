import type { MailAccount, RenderedFile } from "@bfhr/core";
import { MailSendRequestSchema, STARTER_COVER_LETTER_TEMPLATES } from "@bfhr/core";
import { populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import {
  type ApplyDraft,
  type ApplyInput,
  type ApplyPins,
  alreadyApplied,
  applyRecord,
  attachmentContentType,
  attachmentRefusal,
  attachmentsTooLarge,
  buildSendRequest,
  composerModel,
  createDraft,
  cvOptionValue,
  defaultCvId,
  draftBlocker,
  extraAttachment,
  findApplyInput,
  gapsIn,
  letterDay,
  letterLanguage,
  mailtoMessage,
  MAILTO_MAX_BODY_LENGTH,
  mergeValues,
  parseCvOption,
  parseRecipients,
  resolveDraft,
  sendErrorKind,
  sendErrorSentence,
  sendingAccounts,
  toggleLetter,
  toTemplateText,
  withTemplate,
  letterTemplates,
} from "./model";

const ctx = fixtureContext(populatedDataset);
const ADDRESS = "bewerbung@fernweh-reisen.de";

/** The design build's email posting: Fernweh Reisen (German), no application yet. */
function fernweh(overrides: Partial<ApplyInput> = {}): ApplyInput {
  const data = {
    ...populatedDataset,
    jobs: populatedDataset.jobs.map((job) =>
      job.id === "job-fernweh-frontend" ? { ...job, applyUrl: null, applyEmail: ADDRESS } : job,
    ),
  };
  const input = findApplyInput("job-fernweh-frontend", data, data);
  if (!input) throw new Error("fixture job missing");
  return { ...input, ...overrides };
}

function englishJob(): ApplyInput {
  const input = findApplyInput("job-halden-product", populatedDataset, populatedDataset);
  if (!input) throw new Error("fixture job missing");
  return { ...input, application: null };
}

const values = (input: ApplyInput, draft: ApplyDraft) => mergeValues(input, null, draft, ctx);

const file = (id: string, extra: Partial<RenderedFile>): RenderedFile => ({
  id,
  kind: "pdf",
  cvId: null,
  cvRevisionId: null,
  coverLetterId: null,
  storagePath: `users/u/rendered/${id}`,
  fileName: `${id}.pdf`,
  sizeBytes: 1000,
  sha256: "0".repeat(64),
  createdAt: ctx.now,
  ...extra,
});

const pins: ApplyPins = {
  cvId: "cv-de",
  cvRevisionId: "rev-de-2",
  cvFile: file("file-cv", { cvId: "cv-de", cvRevisionId: "rev-de-2" }),
  coverLetterId: "cl-1",
  letterFile: file("file-cl", { coverLetterId: "cl-1" }),
};

describe("inputs", () => {
  it("offers only accounts that can send and work (D21)", () => {
    expect(sendingAccounts(populatedDataset.mailAccounts).map((account) => account.id)).toEqual(["acc-gmail"]);
    const gmail = populatedDataset.mailAccounts.find((account) => account.id === "acc-gmail");
    if (!gmail) throw new Error("fixture account missing");
    const reading: MailAccount = { ...gmail, id: "acc-read", canSend: false };
    expect(sendingAccounts([reading])).toEqual([]);
  });

  it("defaults to the CV the match was scored against, else the latest active one", () => {
    const input = fernweh();
    if (!input.match) throw new Error("fixture match missing");
    expect(defaultCvId(input.cvs, input.match)).toBe("cv-de");
    expect(defaultCvId(input.cvs, null)).toBe("cv-de");
    expect(defaultCvId(input.cvs, { ...input.match, basedOnCvId: "cv-gone" })).toBe("cv-de");
    expect(defaultCvId([], input.match)).toBeNull();
  });

  it("starts from the version pinned on the application before applying (a tailored one)", () => {
    const base = fernweh();
    const application = { ...(englishJob().application ?? populatedDataset.applications[0]), appliedAt: null, cvId: "cv-en", cvRevisionId: "rev-tailored" };
    const draft = createDraft({ ...base, application: application as ApplyInput["application"] });
    expect(draft).toMatchObject({ cvId: "cv-en", cvRevisionId: "rev-tailored" });
    expect(cvOptionValue(draft)).toBe("cv-en@rev-tailored");
    expect(parseCvOption("cv-en@rev-tailored")).toEqual({ cvId: "cv-en", cvRevisionId: "rev-tailored" });
    expect(parseCvOption("cv-de")).toEqual({ cvId: "cv-de", cvRevisionId: null });
    const model = composerModel({ ...base, application: application as ApplyInput["application"] }, draft, values(base, draft), { online: true }, ctx);
    expect(model.cvs.map((option) => option.id)).toContain("cv-en@rev-tailored");
  });

  it("treats applications past Preparing as applied", () => {
    const halden = findApplyInput("job-halden-product", populatedDataset, populatedDataset);
    expect(alreadyApplied(halden?.application ?? null)).toBe(true);
    expect(alreadyApplied(null)).toBe(false);
  });
});

describe("templates and merge fields (core fillMergeFields)", () => {
  it("writes in the posting's language, else the CV's, else English", () => {
    expect(letterLanguage({ language: "de" }, { language: "en" })).toBe("de");
    expect(letterLanguage({ language: "nl" }, { language: "tr" })).toBe("tr");
    expect(letterLanguage({ language: "nl" }, null)).toBe("en");
  });

  it("starts from the starter template whose gaps the placeholder check finds", () => {
    const draft = createDraft(fernweh());
    expect(draft.letterTemplateId).toBe("starter-de");
    expect(gapsIn(draft.letter)).toHaveLength(2);
    expect(draft.letter).toContain("Fernweh Reisen");
  });

  it("drafts a German application to the posting's address from the first sending account", () => {
    const draft = createDraft(fernweh());
    expect(draft).toMatchObject({ accountId: "acc-gmail", to: ADDRESS, cvId: "cv-de", letterOn: false, bodyEdited: false });
    expect(draft.subject).toBe("Bewerbung: Frontend-Entwickler:in (Vue.js)");
    expect(draft.body).toContain("hiermit bewerbe ich mich um die Stelle als Frontend-Entwickler:in (Vue.js) bei Fernweh Reisen.");
    expect(draft.body.endsWith("Mit freundlichen Grüßen\nDeniz Aksoy")).toBe(true);
  });

  it("starts from the job's saved cover letter (D24: attached, intro in the body)", () => {
    const draft = createDraft(englishJob());
    expect(draft.letterOn).toBe(true);
    expect(draft.letter).toMatch(/^Hello Tom,/u);
    expect(draft.body).toContain("My CV and cover letter are attached.");
  });

  it("rewrites the attachment line of an untouched body when the letter is toggled, never an edited one", () => {
    const input = fernweh();
    const on = toggleLetter(createDraft(input), true, input);
    expect(on.body).toContain("Meinen Lebenslauf und mein Anschreiben finden Sie im Anhang.");
    const edited = { ...on, body: "Mein eigener Text", bodyEdited: true };
    expect(toggleLetter(edited, false, input).body).toBe("Mein eigener Text");
  });

  it("keeps a field without a value as a {token} that blocks, until the user fills it", () => {
    const input = fernweh();
    const draft = { ...createDraft(input), letterOn: true, letter: "Dear {hiring_manager},\n\n{company} on {date}." };
    expect(draftBlocker(draft, values(input, draft), { online: true, canSend: true })).toEqual({ kind: "field", field: "hiring_manager" });
    expect(composerModel(input, draft, values(input, draft), { online: true }, ctx).blocker).toBe(
      "Fill in “Hiring manager” before sending: {hiring_manager} is still in your text.",
    );
    const filled = { ...draft, fieldValues: { hiring_manager: "Ms Weber" } };
    const resolved = resolveDraft(filled, values(input, filled));
    expect(resolved.unresolved).toEqual([]);
    expect(resolved.letter).toMatch(/^Dear Ms Weber,\n\nFernweh Reisen on \d/u);
    expect(draftBlocker(filled, values(input, filled), { online: true, canSend: true })).toBeNull();
  });

  it("uses a template without AI and turns a letter back into a template", () => {
    const input = fernweh();
    const draft = createDraft(input);
    const english = letterTemplates([]).find((template) => template.id === "starter-en");
    if (!english) throw new Error("starter missing");
    const used = withTemplate(draft, english, values(input, draft));
    expect(used).toMatchObject({ letterTemplateId: "starter-en", letterLanguage: "en", letterAuthor: "user" });
    expect(used.letter).toContain("position at Fernweh Reisen.");
    expect(toTemplateText(used.letter, values(input, used))).toBe(
      (STARTER_COVER_LETTER_TEMPLATES[0]?.body ?? "").replace("{name}", "{name}"),
    );
  });
});

describe("recipients, attachments and blockers", () => {
  it("parses addresses separated by commas, semicolons or spaces, without duplicates", () => {
    expect(parseRecipients(" a@x.de; b@x.de,a@x.de  c@x.de ")).toEqual({
      addresses: ["a@x.de", "b@x.de", "c@x.de"],
      invalid: null,
    });
    expect(parseRecipients("a@x.de, Lena").invalid).toBe("Lena");
  });

  it("names exactly one blocker, in form order", () => {
    const input = fernweh();
    const draft = createDraft(input);
    const ok = { online: true, canSend: true };
    const check = (next: ApplyDraft, options = ok) => draftBlocker(next, values(input, next), options);
    expect(check(draft)).toBeNull();
    expect(check({ ...draft, to: "" })).toEqual({ kind: "noRecipient" });
    expect(check({ ...draft, to: "hr at fernweh" })).toEqual({ kind: "invalidRecipient", entry: "hr" });
    const eleven = Array.from({ length: 11 }, (_, index) => `hr${index}@x.de`).join(",");
    expect(check({ ...draft, to: eleven })).toEqual({ kind: "tooManyRecipients" });
    expect(check({ ...draft, subject: " " })).toEqual({ kind: "noSubject" });
    expect(check({ ...draft, body: "" })).toEqual({ kind: "noBody" });
    expect(check({ ...draft, cvId: null })).toEqual({ kind: "noCv" });
    expect(check({ ...draft, letterOn: true, letter: "" })).toEqual({ kind: "noLetter" });
    expect(check({ ...draft, letterOn: true, letter: "Ich habe [X%] gespart." })).toEqual({ kind: "gap", gap: "[X%]" });
    expect(check({ ...draft, letterOn: false, letter: "[gap]" })).toBeNull();
    expect(check(draft, { online: false, canSend: true })).toEqual({ kind: "offline" });
    const long = { ...draft, body: "x".repeat(MAILTO_MAX_BODY_LENGTH + 1) };
    expect(check(long, { online: true, canSend: false })).toEqual({ kind: "tooLongForMailApp" });
    expect(check(long)).toBeNull();
  });

  it("blocks a missing name until the user fills it", () => {
    const input = fernweh({ profile: null });
    const draft = createDraft(input);
    expect(draftBlocker(draft, values(input, draft), { online: true, canSend: true })).toEqual({ kind: "field", field: "name" });
  });

  it("accepts extra files within the count, type and per-provider size limits", () => {
    const draft = { ...createDraft(fernweh()), letterOn: true };
    const pdf = { fileName: "Zeugnis.pdf", bytes: 500_000, contentType: "application/pdf" };
    expect(attachmentRefusal(draft, pdf, { provider: "gmail", pdfBytes: 200_000 })).toBeNull();
    expect(attachmentRefusal(draft, { ...pdf, bytes: 2_800_000 }, { provider: "microsoft", pdfBytes: 200_000 })).toEqual({
      kind: "tooLarge",
      fileName: "Zeugnis.pdf",
      limitBytes: 2_900_000,
    });
    expect(attachmentRefusal(draft, { ...pdf, contentType: null }, { provider: null, pdfBytes: 0 })).toEqual({ kind: "type", fileName: "Zeugnis.pdf" });
    const full = { ...draft, extras: Array.from({ length: 3 }, (_, index) => ({ key: `r${index}`, kind: "rendered" as const, file: file(`f${index}`, { cvId: "cv-de", cvRevisionId: "rev-de-2" }) })) };
    expect(attachmentRefusal(full, pdf, { provider: "gmail", pdfBytes: 0 })).toEqual({ kind: "tooMany" });
    expect(attachmentContentType("notes.TXT", "")).toBe("text/plain");
    expect(attachmentContentType("app.exe", "application/x-msdownload")).toBeNull();
  });
});

describe("requests", () => {
  it("builds a valid mailSend request with the PDFs and extras attached and the PDFs pinned", () => {
    const input = fernweh();
    const draft = { ...createDraft(input), to: `${ADDRESS}, lena@fernweh-reisen.de` };
    const extras = [
      extraAttachment({ key: "r", kind: "rendered", file: file("file-other", { cvId: "cv-en", cvRevisionId: "rev-en-3" }) }, null),
      extraAttachment({ key: "l", kind: "local", fileName: "Zeugnis.pdf", contentType: "application/pdf", bytes: new Uint8Array(4) }, "users/u/mail-attachments/up1"),
    ];
    const request = buildSendRequest(resolveDraft(draft, values(input, draft)), draft, { accountId: "acc-gmail", applicationId: null, jobId: "job-fernweh-frontend" }, pins, extras);
    expect(MailSendRequestSchema.safeParse(request).success).toBe(true);
    expect(request.attachments).toEqual([
      { kind: "rendered", renderedFileId: "file-cv" },
      { kind: "rendered", renderedFileId: "file-cl" },
      { kind: "rendered", renderedFileId: "file-other" },
      { kind: "upload", storagePath: "users/u/mail-attachments/up1", fileName: "Zeugnis.pdf", contentType: "application/pdf" },
    ]);
    expect(request.pins).toEqual({ cvId: "cv-de", cvRevisionId: "rev-de-2", cvFileId: "file-cv", coverLetterId: "cl-1", coverLetterFileId: "file-cl" });
  });

  it("hands the same message to the mail app and records it as an email application", () => {
    const input = fernweh();
    const draft = createDraft(input);
    const resolved = resolveDraft(draft, values(input, draft));
    expect(mailtoMessage({ ...resolved, subject: ` ${resolved.subject} ` }, draft)).toEqual({ to: [ADDRESS], subject: draft.subject, body: draft.body });
    expect(applyRecord(input, pins)).toMatchObject({ channel: "email", cvId: "cv-de", cvRevisionId: "rev-de-2", cvFileId: "file-cv" });
    expect(applyRecord(input, pins, "external_link").channel).toBe("external_link");
  });

  it("dates the letter on the user's calendar", () => {
    expect(letterDay(new Date("2026-10-24T22:30:00Z"), "Europe/Istanbul")).toBe("2026-10-25");
    expect(letterDay(new Date("2026-10-24T22:30:00Z"), "UTC")).toBe("2026-10-24");
  });
});

describe("errors", () => {
  const callable = (code: string, reason?: string) =>
    Object.assign(new Error(reason ?? code), { code: `functions/${code}`, ...(reason && { details: { reason } }) });

  it("maps details.reason to one calm sentence", () => {
    expect(sendErrorKind(callable("resource-exhausted", "daily_send_cap"), true)).toBe("daily_send_cap");
    expect(sendErrorSentence("daily_send_cap", ctx)).toBe("Daily limit reached. Your draft is saved, and you can send it tomorrow.");
    expect(sendErrorKind(callable("unavailable"), true)).toBe("offline");
    expect(sendErrorKind(callable("internal"), true)).toBe("failed");
  });

  it("checks attachments against the sending account's limit", () => {
    expect(attachmentsTooLarge(3_000_000, "microsoft", ctx)).toBe(
      "The attachments are larger than 2.9 MB. Remove a file, try a shorter CV, or leave out the cover letter.",
    );
    expect(attachmentsTooLarge(2_900_000, "microsoft", ctx)).toBeNull();
    expect(attachmentsTooLarge(3_000_000, "gmail", ctx)).toBeNull();
  });
});

describe("composerModel", () => {
  it("formats accounts, CVs, the To source and the send label", () => {
    const input = fernweh();
    const draft = createDraft(input);
    const model = composerModel(input, draft, values(input, draft), { online: true }, ctx);
    expect(model.title).toBe("Apply to Fernweh Reisen");
    expect(model.accounts).toEqual([{ id: "acc-gmail", label: "deniz.aksoy@example.com · Gmail" }]);
    expect(model.cvs.map((cv) => cv.id)).toEqual(["cv-de", "cv-en"]);
    expect(model.toSource).toBe("From the job posting");
    expect(model.sendLabel).toBe(`Send to ${ADDRESS}`);
  });

  it("speaks the UI language while the email stays in the posting's", () => {
    const tr = fixtureContext(populatedDataset, [], createAppIntl({ language: "tr", locale: "tr-TR" }));
    const input = fernweh();
    const draft = createDraft(input);
    const model = composerModel(input, draft, values(input, draft), { online: false }, tr);
    expect(draft.subject).toBe("Bewerbung: Frontend-Entwickler:in (Vue.js)");
    expect(model.blocker).not.toBe("You're offline. Your draft is saved.");
  });
});
