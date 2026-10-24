import type { MailAccount, RenderedFile } from "@bfhr/core";
import { MailSendRequestSchema } from "@bfhr/core";
import { populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import {
  type ApplyInput,
  type ApplyPins,
  alreadyApplied,
  applyRecord,
  attachmentsTooLarge,
  buildSendRequest,
  composerModel,
  createDraft,
  defaultCvId,
  draftBlocker,
  fillTemplate,
  findApplyInput,
  gapsIn,
  letterTemplate,
  letterDay,
  letterLanguage,
  mailtoMessage,
  MAILTO_MAX_BODY_LENGTH,
  parseRecipients,
  sendErrorKind,
  sendErrorSentence,
  sendingAccounts,
  toggleLetter,
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
    expect(defaultCvId(input.cvs, null)).toBe("cv-de"); // edited 8 days ago, the English one 12
    expect(defaultCvId(input.cvs, { ...input.match, basedOnCvId: "cv-gone" })).toBe("cv-de");
    expect(defaultCvId([], input.match)).toBeNull();
  });

  it("treats applications past Preparing as applied", () => {
    const halden = findApplyInput("job-halden-product", populatedDataset, populatedDataset);
    expect(alreadyApplied(halden?.application ?? null)).toBe(true);
    expect(alreadyApplied(null)).toBe(false);
  });
});

describe("templates and merge fields", () => {
  it("writes in the posting's language, else the CV's, else English", () => {
    expect(letterLanguage({ language: "de" }, { language: "en" })).toBe("de");
    expect(letterLanguage({ language: "nl" }, { language: "tr" })).toBe("tr");
    expect(letterLanguage({ language: "nl" }, null)).toBe("en");
  });

  it("leaves gaps in every starting letter that the placeholder check finds (≤ 40 characters)", () => {
    for (const language of ["en", "tr", "de"] as const) {
      const letter = fillTemplate(letterTemplate(language), { name: null, role: "R", company: "C" }, language);
      expect(gapsIn(letter)).toHaveLength(3);
    }
  });

  it("fills name, role and company; a missing value stays a visible gap", () => {
    const values = { name: null, role: "Frontend-Entwickler:in", company: "Fernweh Reisen" };
    expect(fillTemplate("{role} · {company} · {name}", values, "de")).toBe(
      "Frontend-Entwickler:in · Fernweh Reisen · [Dein Name]",
    );
    expect(fillTemplate("{name}", { ...values, name: "Deniz Aksoy" }, "en")).toBe("Deniz Aksoy");
  });

  it("drafts a German application to the posting's address from the first sending account", () => {
    const draft = createDraft(fernweh());
    expect(draft).toMatchObject({ accountId: "acc-gmail", to: ADDRESS, cvId: "cv-de", letterOn: false, bodyEdited: false });
    expect(draft.subject).toBe("Bewerbung: Frontend-Entwickler:in (Vue.js)");
    expect(draft.body).toContain("hiermit bewerbe ich mich um die Stelle als Frontend-Entwickler:in (Vue.js) bei Fernweh Reisen.");
    expect(draft.body).toContain("Meinen Lebenslauf finden Sie im Anhang.");
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
    expect(on.letter).toContain("[Warum dich die Stelle reizt]");
    const edited = { ...on, body: "Mein eigener Text", bodyEdited: true };
    expect(toggleLetter(edited, false, input).body).toBe("Mein eigener Text");
  });
});

describe("recipients and blockers", () => {
  it("parses addresses separated by commas, semicolons or spaces, without duplicates", () => {
    expect(parseRecipients(" a@x.de; b@x.de,a@x.de  c@x.de ")).toEqual({
      addresses: ["a@x.de", "b@x.de", "c@x.de"],
      invalid: null,
    });
    expect(parseRecipients("a@x.de, Lena").invalid).toBe("Lena");
  });

  it("names exactly one blocker, in form order", () => {
    const draft = createDraft(fernweh());
    const ok = { online: true, canSend: true };
    expect(draftBlocker(draft, ok)).toBeNull();
    expect(draftBlocker({ ...draft, to: "" }, ok)).toEqual({ kind: "noRecipient" });
    expect(draftBlocker({ ...draft, to: "hr at fernweh" }, ok)).toEqual({ kind: "invalidRecipient", entry: "hr" });
    const eleven = Array.from({ length: 11 }, (_, index) => `hr${index}@x.de`).join(",");
    expect(draftBlocker({ ...draft, to: eleven }, ok)).toEqual({ kind: "tooManyRecipients" });
    expect(draftBlocker({ ...draft, subject: " " }, ok)).toEqual({ kind: "noSubject" });
    expect(draftBlocker({ ...draft, body: "" }, ok)).toEqual({ kind: "noBody" });
    expect(draftBlocker({ ...draft, cvId: null }, ok)).toEqual({ kind: "noCv" });
    expect(draftBlocker({ ...draft, letterOn: true, letter: "" }, ok)).toEqual({ kind: "noLetter" });
    expect(draftBlocker({ ...draft, letterOn: true, letter: "Ich habe [X%] gespart." }, ok)).toEqual({ kind: "gap", gap: "[X%]" });
    // A letter that's off doesn't block.
    expect(draftBlocker({ ...draft, letterOn: false, letter: "[gap]" }, ok)).toBeNull();
    expect(draftBlocker(draft, { online: false, canSend: true })).toEqual({ kind: "offline" });
    const long = { ...draft, body: "x".repeat(MAILTO_MAX_BODY_LENGTH + 1) };
    expect(draftBlocker(long, { online: true, canSend: false })).toEqual({ kind: "tooLongForMailApp" });
    expect(draftBlocker(long, ok)).toBeNull();
  });

  it("blocks a missing name until the user fills the gap", () => {
    const input = fernweh({ profile: null });
    const draft = createDraft(input);
    expect(draftBlocker(draft, { online: true, canSend: true })).toEqual({ kind: "gap", gap: "[Dein Name]" });
    expect(composerModel(input, draft, { online: true }, ctx).blocker).toBe("Fill in [Dein Name] before sending.");
  });
});

describe("requests", () => {
  it("builds a valid mailSend request with the PDFs attached and pinned", () => {
    const draft = { ...createDraft(fernweh()), to: `${ADDRESS}, lena@fernweh-reisen.de` };
    const request = buildSendRequest(draft, { accountId: "acc-gmail", applicationId: null, jobId: "job-fernweh-frontend" }, pins);
    expect(MailSendRequestSchema.safeParse(request).success).toBe(true);
    expect(request).toMatchObject({
      accountId: "acc-gmail",
      applicationId: null,
      jobId: "job-fernweh-frontend",
      to: [
        { name: null, address: ADDRESS },
        { name: null, address: "lena@fernweh-reisen.de" },
      ],
      attachments: [
        { kind: "rendered", renderedFileId: "file-cv" },
        { kind: "rendered", renderedFileId: "file-cl" },
      ],
      pins: { cvId: "cv-de", cvRevisionId: "rev-de-2", cvFileId: "file-cv", coverLetterId: "cl-1", coverLetterFileId: "file-cl" },
    });
    const noLetter = buildSendRequest(draft, { accountId: "acc-gmail", applicationId: "app-1", jobId: "j" }, { ...pins, coverLetterId: null, letterFile: null });
    expect(noLetter.attachments).toHaveLength(1);
    expect(noLetter.pins.coverLetterFileId).toBeNull();
  });

  it("hands the same message to the mail app and records it as an email application", () => {
    const input = fernweh();
    const draft = createDraft(input);
    expect(mailtoMessage({ ...draft, subject: ` ${draft.subject} ` })).toEqual({ to: [ADDRESS], subject: draft.subject, body: draft.body });
    expect(applyRecord(input, pins)).toEqual({
      job: input.job,
      application: null,
      channel: "email",
      cvId: "cv-de",
      cvRevisionId: "rev-de-2",
      cvFileId: "file-cv",
      coverLetterId: "cl-1",
      coverLetterFileId: "file-cl",
    });
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
    expect(sendErrorKind(callable("failed-precondition", "needs_reauth"), true)).toBe("needs_reauth");
    expect(sendErrorKind(callable("unavailable"), true)).toBe("offline");
    expect(sendErrorKind(callable("internal"), true)).toBe("failed");
    expect(sendErrorKind(callable("failed-precondition", "needs_reauth"), false)).toBe("offline");
    expect(sendErrorSentence("offline", ctx)).toBe("You're offline. Your draft is saved.");
  });

  it("checks attachments against the sending account's limit", () => {
    // Microsoft sends the files inside one Graph request (≈ 4 MB), so about 2.9 MB fit.
    expect(attachmentsTooLarge(3_000_000, "microsoft", ctx)).toBe(
      "The attachments are larger than 2.9 MB. Try a shorter CV, or leave out the cover letter.",
    );
    expect(attachmentsTooLarge(2_900_000, "microsoft", ctx)).toBeNull();
    expect(attachmentsTooLarge(3_000_000, "gmail", ctx)).toBeNull();
    expect(attachmentsTooLarge(3_000_000, null, ctx)).toBeNull();
    expect(attachmentsTooLarge(19 * 1024 * 1024, "imap", ctx)).toBe(
      "The attachments are larger than 18.9 MB. Try a shorter CV, or leave out the cover letter.",
    );
  });
});

describe("composerModel", () => {
  it("formats accounts, CVs, the To source and the send label", () => {
    const input = fernweh();
    const draft = createDraft(input);
    const model = composerModel(input, draft, { online: true }, ctx);
    expect(model.title).toBe("Apply to Fernweh Reisen");
    expect(model.accounts).toEqual([{ id: "acc-gmail", label: "deniz.aksoy@example.com · Gmail" }]);
    expect(model.cvs.map((cv) => cv.id)).toEqual(["cv-de", "cv-en"]);
    expect(model.cvs[0]?.label).toMatch(/^Lebenslauf — Deutsch · German · edited /u);
    expect(model.toSource).toBe("From the job posting");
    expect(model.languageHint).toBe("Written in German, the language of the posting.");
    expect(model.sendLabel).toBe(`Send to ${ADDRESS}`);
    expect(model.applied).toBeNull();
    const two = composerModel(input, { ...draft, to: `${ADDRESS} hr@x.de` }, { online: true }, ctx);
    expect(two.sendLabel).toBe(`Send to ${ADDRESS} and 1 more`);
    expect(two.toSource).toBeNull();
  });

  it("speaks the UI language while the email stays in the posting's", () => {
    const tr = fixtureContext(populatedDataset, [], createAppIntl({ language: "tr", locale: "tr-TR" }));
    const input = fernweh();
    const draft = createDraft(input);
    const model = composerModel(input, draft, { online: false }, tr);
    expect(draft.subject).toBe("Bewerbung: Frontend-Entwickler:in (Vue.js)");
    expect(model.blocker).not.toBe("You're offline. Your draft is saved.");
  });

  it("says when the job was applied to already", () => {
    const input = findApplyInput("job-halden-product", populatedDataset, populatedDataset);
    if (!input) throw new Error("fixture job missing");
    expect(composerModel(input, createDraft(input), { online: true }, ctx).applied?.text).toMatch(/^You applied to Halden Freight /u);
  });
});
