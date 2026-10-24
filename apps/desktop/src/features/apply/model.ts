/**
 * Apply (BRIEF §4.4, research/apply.md "Decision — Desktop", decisions.md D21–D24, F6): the
 * composer's pure logic. The draft (From, To, Subject, Body, CV, optional cover letter, extra
 * attachments) starts from templates in the letter's language (the posting's, else the CV's). Merge
 * fields (`{name}`, `{company}`, …) are filled with @bfhr/core `fillMergeFields` from the profile,
 * the CV, the job and what the user types in "Fields to fill"; a field without a value stays a
 * visible `{token}` and, like a `[gap]` (the CV placeholder rule, BRIEF §2.4), blocks sending.
 * `composerModel` formats what the panel shows; `buildSendRequest` / `mailtoMessage` /
 * `applyRecord` are what the actions send.
 */
import {
  type Application,
  type CoverLetter,
  type CoverLetterTone,
  COVER_LETTER_MERGE_FIELDS,
  type Cv,
  type CvAssistLanguage,
  type CvContent,
  EmailSchema,
  fillMergeFields,
  type Job,
  type JobMatch,
  MAIL_ATTACHMENT_CONTENT_TYPES,
  MAIL_SEND_ERROR_REASONS,
  MAIL_SEND_MAX_ATTACHMENT_BYTES,
  MAIL_SEND_MAX_ATTACHMENTS,
  type MailAccount,
  type MailProvider,
  type MailSendAttachment,
  type MailSendErrorReason,
  mailSendMaxAttachmentBytes,
  type MailSendRequest,
  type MergeField,
  type MergeValues,
  type Profile,
  type RenderedFile,
  STARTER_COVER_LETTER_TEMPLATES,
  statusPhase,
} from "@bfhr/core";
import { PLACEHOLDER_PATTERN } from "@bfhr/cv-render";
import { defineMessages, type IntlShape } from "react-intl";
import type { MailAttachmentContentType } from "../../data/jobs/repository";
import type { ApplyRecord } from "../../data/jobs/writes";
import { relativeTime } from "../../shared/model/format";
import type { ModelContext, TimeVM } from "../../shared/model/types";
import { jobSourceName } from "../job-detail/model";

/** Longest body `open_mailto` accepts, in characters (`MAX_BODY_LENGTH` in src-tauri/src/mailto.rs). */
export const MAILTO_MAX_BODY_LENGTH = 8_000;

// ─── Inputs ────────────────────────────────────────────────────────────────────────────────────

/** Everything the composer reads, from `useTrackerData()` + `useJobsData()`. */
export interface ApplyInput {
  readonly job: Job;
  readonly match: JobMatch | null;
  /** The job's application (Saved / Preparing, or later once applied). */
  readonly application: Application | null;
  readonly profile: Profile | null;
  readonly cvs: readonly Cv[];
  readonly mailAccounts: readonly MailAccount[];
  readonly coverLetters: readonly CoverLetter[];
  readonly renderedFiles: readonly RenderedFile[];
}

export function findApplyInput(
  jobId: string,
  tracker: { readonly profile: Profile | null; readonly applications: readonly Application[]; readonly cvs: readonly Cv[] },
  jobs: {
    readonly jobs: readonly Job[];
    readonly jobMatches: readonly JobMatch[];
    readonly mailAccounts: readonly MailAccount[];
    readonly coverLetters: readonly CoverLetter[];
    readonly renderedFiles: readonly RenderedFile[];
  },
): ApplyInput | null {
  const job = jobs.jobs.find((candidate) => candidate.id === jobId);
  if (!job) return null;
  return {
    job,
    match: jobs.jobMatches.find((candidate) => candidate.id === jobId) ?? null,
    application: tracker.applications.find((candidate) => candidate.jobId === jobId) ?? null,
    profile: tracker.profile,
    cvs: tracker.cvs,
    mailAccounts: jobs.mailAccounts,
    coverLetters: jobs.coverLetters,
    renderedFiles: jobs.renderedFiles,
  };
}

/** Accounts the composer can send from: send granted (D21) and working. */
export function sendingAccounts(accounts: readonly MailAccount[]): readonly MailAccount[] {
  return accounts.filter((account) => account.canSend && (account.status === "connected" || account.status === "syncing"));
}

/** Active CVs, most recently updated first. */
export function activeCvs(cvs: readonly Cv[]): readonly Cv[] {
  return cvs.filter((cv) => cv.archivedAt === null).toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/** The CV the match was scored against when it is still active, else the most recently updated one. */
export function defaultCvId(cvs: readonly Cv[], match: JobMatch | null): string | null {
  const active = activeCvs(cvs);
  return active.find((cv) => cv.id === match?.basedOnCvId)?.id ?? active[0]?.id ?? null;
}

/**
 * The CV version chosen for this application before applying (a tailored one, say): the
 * application's pins while it hasn't been applied yet and the CV is still active.
 */
export function pinnedCv(input: Pick<ApplyInput, "application" | "cvs">): { readonly cvId: string; readonly cvRevisionId: string } | null {
  const application = input.application;
  if (!application || application.appliedAt !== null || application.cvId === null || application.cvRevisionId === null) return null;
  const cvId = application.cvId;
  return activeCvs(input.cvs).some((cv) => cv.id === cvId) ? { cvId, cvRevisionId: application.cvRevisionId } : null;
}

/** Applications past Saved / Preparing: applying again would send a second email. */
export function alreadyApplied(application: Application | null): boolean {
  return application !== null && statusPhase(application.status) !== "shortlist";
}

/** The job's cover letter for this application (not a template), newest first. */
export function jobCoverLetter(letters: readonly CoverLetter[], jobId: string): CoverLetter | null {
  return (
    letters
      .filter((letter) => !letter.isTemplate && letter.jobId === jobId)
      .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null
  );
}

// ─── Languages and merge fields ────────────────────────────────────────────────────────────────

/** Languages the email and cover letter templates exist in. */
export type LetterLanguage = CvAssistLanguage;

export const LETTER_LANGUAGES: readonly LetterLanguage[] = ["en", "tr", "de"];

function baseLanguage(tag: string | undefined): LetterLanguage | null {
  const base = tag?.toLowerCase().split(/[-_]/u)[0];
  return LETTER_LANGUAGES.find((language) => language === base) ?? null;
}

/** The posting's language when we have templates for it, else the CV's, else English. */
export function letterLanguage(job: Pick<Job, "language">, cv: Pick<Cv, "language"> | null): LetterLanguage {
  return baseLanguage(job.language) ?? baseLanguage(cv?.language) ?? "en";
}

/** Display name of a job's first source ("Greenhouse", else the posting's host). */
function jobSource(job: Pick<Job, "sources">): string | null {
  const link = job.sources[0];
  if (!link) return null;
  const named = jobSourceName(link.source);
  if (named !== null) return named;
  try {
    return new URL(link.url).hostname.replace(/^www\./u, "");
  } catch {
    return null;
  }
}

/**
 * Values of the merge fields: the profile and the CV (`name`, `email`, `phone`), the job (`role`,
 * `company`, `job_source`), today's date in the letter's language, and whatever the user typed in
 * "Fields to fill" (which wins). `hiring_manager` has no source but the user.
 */
export function mergeValues(
  input: Pick<ApplyInput, "job" | "profile">,
  content: Pick<CvContent, "basics"> | null,
  draft: Pick<ApplyDraft, "fieldValues" | "letterLanguage">,
  /** Without it `date` stays unresolved (drafts made before the clock is known fill it at send time). */
  ctx: Pick<ModelContext, "now" | "timeZone"> | null,
): MergeValues {
  const basics = content?.basics;
  const typed = Object.fromEntries(
    Object.entries(draft.fieldValues).filter((entry): entry is [string, string] => (entry[1] ?? "").trim() !== ""),
  );
  return {
    name: input.profile?.fullName.trim() || basics?.name?.trim() || null,
    email: basics?.email ?? null,
    phone: basics?.phone ?? null,
    role: input.job.title,
    company: input.job.company,
    hiring_manager: null,
    job_source: jobSource(input.job),
    date: ctx && new Intl.DateTimeFormat(draft.letterLanguage, { dateStyle: "long", timeZone: ctx.timeZone }).format(ctx.now),
    ...typed,
  };
}

/**
 * Email content is written to the employer in the letter's language (formal in TR and DE), so it
 * lives here, not in the UI messages: a Turkish UI can send a German application.
 */
const SUBJECTS: Readonly<Record<LetterLanguage, string>> = {
  en: "Application: {role}",
  tr: "Başvuru: {role}",
  de: "Bewerbung: {role}",
};

const BODIES: Readonly<Record<LetterLanguage, (withLetter: boolean) => string>> = {
  en: (withLetter) =>
    `Hello,\n\nI'd like to apply for the {role} position at {company}. ${withLetter ? "My CV and cover letter are attached." : "My CV is attached."}\n\nI'd be glad to tell you more in a conversation.\n\nKind regards,\n{name}`,
  tr: (withLetter) =>
    `Merhaba,\n\n{company} bünyesindeki {role} pozisyonu için başvurmak istiyorum. ${withLetter ? "Özgeçmişimi ve ön yazımı ekte bulabilirsiniz." : "Özgeçmişimi ekte bulabilirsiniz."}\n\nBir görüşme fırsatı için teşekkür ederim.\n\nSaygılarımla,\n{name}`,
  de: (withLetter) =>
    `Guten Tag,\n\nhiermit bewerbe ich mich um die Stelle als {role} bei {company}. ${withLetter ? "Meinen Lebenslauf und mein Anschreiben finden Sie im Anhang." : "Meinen Lebenslauf finden Sie im Anhang."}\n\nÜber ein persönliches Gespräch freue ich mich.\n\nMit freundlichen Grüßen\n{name}`,
};

export function subjectTemplate(language: LetterLanguage): string {
  return SUBJECTS[language];
}

export function bodyTemplate(language: LetterLanguage, withLetter: boolean): string {
  return BODIES[language](withLetter);
}

/** `[gaps]` left in a text (the same pattern as CV placeholders). */
export function gapsIn(text: string): readonly string[] {
  return [...text.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[0]);
}

// ─── Cover letter templates ────────────────────────────────────────────────────────────────────

export interface LetterTemplate {
  readonly id: string;
  readonly title: string;
  readonly language: string;
  readonly body: string;
  readonly starter: boolean;
}

/** The template picker: the user's own templates (newest first), then the starter ones. */
export function letterTemplates(letters: readonly CoverLetter[]): readonly LetterTemplate[] {
  const own = letters
    .filter((letter) => letter.isTemplate)
    .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((letter) => ({ id: letter.id, title: letter.title, language: letter.language, body: letter.body, starter: false }));
  return [...own, ...STARTER_COVER_LETTER_TEMPLATES.map((template) => ({ ...template, starter: true }))];
}

/** The starter template in `language`. */
export function starterTemplateId(language: LetterLanguage): string {
  return `starter-${language}`;
}

/**
 * The letter as a template for other jobs: this job's company, role, hiring manager and the
 * user's own details go back to their `{fields}` (whole values only, longest first).
 */
export function toTemplateText(text: string, values: MergeValues): string {
  const fields: readonly MergeField[] = ["company", "role", "hiring_manager", "name", "email", "phone"];
  const replacements = fields
    .map((field) => ({ field, value: values[field]?.trim() ?? "" }))
    .filter((entry) => entry.value.length >= 2)
    .toSorted((a, b) => b.value.length - a.value.length);
  let result = text;
  for (const { field, value } of replacements) result = result.split(value).join(`{${field}}`);
  return result;
}

// ─── Extra attachments ─────────────────────────────────────────────────────────────────────────

/** A file attached besides the CV and cover letter: one of the user's rendered files or a device file. */
export type ExtraAttachment =
  | { readonly key: string; readonly kind: "rendered"; readonly file: RenderedFile }
  | {
      readonly key: string;
      readonly kind: "local";
      readonly fileName: string;
      readonly contentType: MailAttachmentContentType;
      readonly bytes: Uint8Array;
    };

export function extraName(extra: ExtraAttachment): string {
  return extra.kind === "rendered" ? extra.file.fileName : extra.fileName;
}

export function extraBytes(extra: ExtraAttachment): number {
  return extra.kind === "rendered" ? extra.file.sizeBytes : extra.bytes.byteLength;
}

const EXTENSION_TYPES: Readonly<Record<string, MailAttachmentContentType>> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  rtf: "application/rtf",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** `accept` of the file picker: the extensions and types `mailSend` takes. */
export const ATTACHMENT_ACCEPT = [
  ...Object.keys(EXTENSION_TYPES).map((extension) => `.${extension}`),
  ...MAIL_ATTACHMENT_CONTENT_TYPES,
].join(",");

/** The content type `mailSend` accepts for a device file, by its type, else its extension; null for others. */
export function attachmentContentType(fileName: string, type: string): MailAttachmentContentType | null {
  const known = MAIL_ATTACHMENT_CONTENT_TYPES.find((candidate) => candidate === type);
  if (known) return known;
  const extension = fileName.toLowerCase().split(".").at(-1) ?? "";
  return Object.hasOwn(EXTENSION_TYPES, extension) ? (EXTENSION_TYPES[extension] ?? null) : null;
}

/** Total attachment size the account can send (`mailSendMaxAttachmentBytes`); 18 MB without an account. */
export function attachmentLimitBytes(provider: MailProvider | null): number {
  return provider === null ? MAIL_SEND_MAX_ATTACHMENT_BYTES : mailSendMaxAttachmentBytes(provider);
}

/** Why another file can't be added: too many files, an unsupported type or over the size limit; else null. */
export type AttachmentRefusal =
  | { readonly kind: "tooMany" }
  | { readonly kind: "type"; readonly fileName: string }
  | { readonly kind: "tooLarge"; readonly fileName: string; readonly limitBytes: number };

/**
 * Checks `adding` against what is already attached: `MAIL_SEND_MAX_ATTACHMENTS` files in all (the
 * CV and cover letter count) and the account's size limit. `pdfBytes` is the CV (+ letter) PDFs'
 * size once made, else an estimate.
 */
export function attachmentRefusal(
  draft: Pick<ApplyDraft, "extras" | "letterOn">,
  adding: { readonly fileName: string; readonly bytes: number; readonly contentType: string | null },
  options: { readonly provider: MailProvider | null; readonly pdfBytes: number },
): AttachmentRefusal | null {
  const count = 1 + (draft.letterOn ? 1 : 0) + draft.extras.length;
  if (count >= MAIL_SEND_MAX_ATTACHMENTS) return { kind: "tooMany" };
  if (adding.contentType === null) return { kind: "type", fileName: adding.fileName };
  const limitBytes = attachmentLimitBytes(options.provider);
  const total = options.pdfBytes + draft.extras.reduce((sum, extra) => sum + extraBytes(extra), 0) + adding.bytes;
  if (total > limitBytes) return { kind: "tooLarge", fileName: adding.fileName, limitBytes };
  return null;
}

// ─── Draft ─────────────────────────────────────────────────────────────────────────────────────

export interface ApplyDraft {
  /** Sending account; null without one (the mail-app path). */
  readonly accountId: string | null;
  /** The To field as typed: addresses separated by commas, semicolons or spaces. */
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  /** False while the body is still the template: toggling the cover letter rewrites its line. */
  readonly bodyEdited: boolean;
  readonly cvId: string | null;
  /** A specific version of the CV (a tailored one); null = its current version. */
  readonly cvRevisionId: string | null;
  readonly letterOn: boolean;
  readonly letter: string;
  readonly letterLanguage: LetterLanguage;
  readonly letterTone: CoverLetterTone;
  /** The template the letter starts from; null = AI drafts freely. */
  readonly letterTemplateId: string | null;
  /** `ai` once an AI draft is in the editor (kept when the user edits it). */
  readonly letterAuthor: "user" | "ai";
  /** "Fields to fill": values the user typed for merge fields (`hiring_manager`, or overrides). */
  readonly fieldValues: Partial<Readonly<Record<MergeField, string>>>;
  readonly extras: readonly ExtraAttachment[];
}

export function createDraft(input: ApplyInput): ApplyDraft {
  const pinned = pinnedCv(input);
  const cvId = pinned?.cvId ?? defaultCvId(input.cvs, input.match);
  const cv = input.cvs.find((candidate) => candidate.id === cvId) ?? null;
  const language = letterLanguage(input.job, cv);
  // Job and profile values only at this point; the rest stay `{tokens}` and are filled when sent.
  const values = mergeValues(input, null, { fieldValues: {}, letterLanguage: language }, null);
  const prefill = (text: string) => fillMergeFields(text, values).text;
  const existing = jobCoverLetter(input.coverLetters, input.job.id);
  const starter = STARTER_COVER_LETTER_TEMPLATES.find((template) => template.id === starterTemplateId(language));
  // D24: a short intro in the body plus the letter attached, when there is a letter.
  const letterOn = existing !== null;
  return {
    accountId: sendingAccounts(input.mailAccounts)[0]?.id ?? null,
    to: input.job.applyEmail ?? "",
    subject: prefill(subjectTemplate(language)),
    body: prefill(bodyTemplate(language, letterOn)),
    bodyEdited: false,
    cvId,
    cvRevisionId: pinned?.cvRevisionId ?? null,
    letterOn,
    letter: existing?.body ?? prefill(starter?.body ?? ""),
    letterLanguage: baseLanguage(existing?.language) ?? language,
    letterTone: "formal",
    letterTemplateId: existing ? null : (starter?.id ?? null),
    letterAuthor: existing?.author ?? "user",
    fieldValues: {},
    extras: [],
  };
}

/** Turns the cover letter on or off; an untouched body follows ("My CV and cover letter are attached."). */
export function toggleLetter(draft: ApplyDraft, letterOn: boolean, input: ApplyInput): ApplyDraft {
  if (draft.bodyEdited) return { ...draft, letterOn };
  const language = letterLanguage(input.job, input.cvs.find((cv) => cv.id === draft.cvId) ?? null);
  const values = mergeValues(input, null, draft, null);
  return { ...draft, letterOn, body: fillMergeFields(bodyTemplate(language, letterOn), values).text };
}

/** A template in the editor (no AI): its text with the known fields filled. */
export function withTemplate(draft: ApplyDraft, template: LetterTemplate, values: MergeValues): ApplyDraft {
  return {
    ...draft,
    letter: fillMergeFields(template.body, values).text,
    letterTemplateId: template.id,
    letterLanguage: baseLanguage(template.language) ?? draft.letterLanguage,
    letterAuthor: "user",
  };
}

/** Same cap as `MailSendRequestSchema.to`. */
export const MAX_RECIPIENTS = 10;

export interface Recipients {
  readonly addresses: readonly string[];
  /** The first entry that isn't an email address. */
  readonly invalid: string | null;
}

export function parseRecipients(text: string): Recipients {
  const entries = text.split(/[\s,;]+/u).filter((entry) => entry !== "");
  const addresses = [...new Set(entries.filter((entry) => EmailSchema.safeParse(entry).success))];
  return { addresses, invalid: entries.find((entry) => !EmailSchema.safeParse(entry).success) ?? null };
}

/** What goes out: subject, body and letter with every known merge field filled. */
export interface ResolvedDraft {
  readonly subject: string;
  readonly body: string;
  readonly letter: string;
  /** Fields still without a value, in reading order (subject, body, letter). */
  readonly unresolved: readonly MergeField[];
}

export function resolveDraft(draft: Pick<ApplyDraft, "subject" | "body" | "letter" | "letterOn">, values: MergeValues): ResolvedDraft {
  const subject = fillMergeFields(draft.subject, values);
  const body = fillMergeFields(draft.body, values);
  const letter = fillMergeFields(draft.letter, values);
  return {
    subject: subject.text,
    body: body.text,
    letter: letter.text,
    unresolved: [...new Set([...subject.unresolved, ...body.unresolved, ...(draft.letterOn ? letter.unresolved : [])])],
  };
}

// ─── Blockers ──────────────────────────────────────────────────────────────────────────────────

/** Why the next step can't happen yet; the panel shows exactly one (SendBlockerLine). */
export type ApplyBlocker =
  | { readonly kind: "offline" }
  | { readonly kind: "noRecipient" }
  | { readonly kind: "invalidRecipient"; readonly entry: string }
  | { readonly kind: "tooManyRecipients" }
  | { readonly kind: "noSubject" }
  | { readonly kind: "noBody" }
  | { readonly kind: "noCv" }
  | { readonly kind: "noLetter" }
  | { readonly kind: "field"; readonly field: MergeField }
  | { readonly kind: "gap"; readonly gap: string }
  | { readonly kind: "tooManyAttachments" }
  | { readonly kind: "tooLongForMailApp" };

/**
 * The first reason the draft can't move on, in the order the form reads (To, Subject, Body, CV,
 * cover letter, fields, attachments). `online` and `canSend` decide the offline and mail-app rules:
 * sending needs a connection; the mail-app path needs one only to store the files ("I sent it").
 */
export function draftBlocker(
  draft: ApplyDraft,
  values: MergeValues,
  options: { readonly online: boolean; readonly canSend: boolean },
): ApplyBlocker | null {
  const recipients = parseRecipients(draft.to);
  if (recipients.invalid !== null) return { kind: "invalidRecipient", entry: recipients.invalid };
  if (recipients.addresses.length === 0) return { kind: "noRecipient" };
  if (recipients.addresses.length > MAX_RECIPIENTS) return { kind: "tooManyRecipients" };
  if (draft.subject.trim() === "") return { kind: "noSubject" };
  if (draft.body.trim() === "") return { kind: "noBody" };
  if (draft.cvId === null) return { kind: "noCv" };
  if (draft.letterOn && draft.letter.trim() === "") return { kind: "noLetter" };
  const resolved = resolveDraft(draft, values);
  const field = resolved.unresolved[0];
  if (field !== undefined) return { kind: "field", field };
  const gap = [resolved.subject, resolved.body, ...(draft.letterOn ? [resolved.letter] : [])].flatMap(gapsIn)[0];
  if (gap !== undefined) return { kind: "gap", gap };
  if (1 + (draft.letterOn ? 1 : 0) + draft.extras.length > MAIL_SEND_MAX_ATTACHMENTS) return { kind: "tooManyAttachments" };
  if (!options.canSend && resolved.body.length > MAILTO_MAX_BODY_LENGTH) return { kind: "tooLongForMailApp" };
  if (!options.online) return { kind: "offline" };
  return null;
}

// ─── Requests ──────────────────────────────────────────────────────────────────────────────────

/** The files attached and pinned (D02 pins are write-once). */
export interface ApplyPins {
  readonly cvId: string;
  readonly cvRevisionId: string;
  readonly cvFile: RenderedFile;
  readonly coverLetterId: string | null;
  readonly letterFile: RenderedFile | null;
}

/** An extra attachment as `mailSend` takes it: rendered files by id, device files by their upload. */
export function extraAttachment(extra: ExtraAttachment, storagePath: string | null): MailSendAttachment {
  if (extra.kind === "rendered") return { kind: "rendered", renderedFileId: extra.file.id };
  if (storagePath === null) throw new Error(`${extra.fileName} isn't uploaded`);
  return { kind: "upload", storagePath, fileName: extra.fileName, contentType: extra.contentType };
}

/** `mailSend`: from the chosen account, the CV (+ letter) PDFs and the extras attached, the PDFs pinned. */
export function buildSendRequest(
  resolved: Pick<ResolvedDraft, "subject" | "body">,
  draft: Pick<ApplyDraft, "to">,
  target: { readonly accountId: string; readonly applicationId: string | null; readonly jobId: string },
  pins: ApplyPins,
  extras: readonly MailSendAttachment[] = [],
): MailSendRequest {
  const files = [pins.cvFile, ...(pins.letterFile ? [pins.letterFile] : [])];
  return {
    accountId: target.accountId,
    applicationId: target.applicationId,
    jobId: target.jobId,
    to: parseRecipients(draft.to).addresses.map((address) => ({ name: null, address })),
    cc: [],
    subject: resolved.subject.trim(),
    bodyText: resolved.body,
    attachments: [...files.map((file) => ({ kind: "rendered" as const, renderedFileId: file.id })), ...extras],
    pins: {
      cvId: pins.cvId,
      cvRevisionId: pins.cvRevisionId,
      cvFileId: pins.cvFile.id,
      coverLetterId: pins.coverLetterId,
      coverLetterFileId: pins.letterFile?.id ?? null,
    },
    replyToMailMessageId: null,
  };
}

/** "Open in your mail app": the same message as a `mailto:` (attachments are added by hand). */
export function mailtoMessage(
  resolved: Pick<ResolvedDraft, "subject" | "body">,
  draft: Pick<ApplyDraft, "to">,
): { readonly to: readonly string[]; readonly subject: string; readonly body: string } {
  return { to: parseRecipients(draft.to).addresses, subject: resolved.subject.trim(), body: resolved.body };
}

/** "I sent it" / "Yes, I applied": the application moves to Applied with the files pinned. */
export function applyRecord(input: ApplyInput, pins: ApplyPins, channel: ApplyRecord["channel"] = "email"): ApplyRecord {
  return {
    job: input.job,
    application: input.application,
    channel,
    cvId: pins.cvId,
    cvRevisionId: pins.cvRevisionId,
    cvFileId: pins.cvFile.id,
    coverLetterId: pins.coverLetterId,
    coverLetterFileId: pins.letterFile?.id ?? null,
  };
}

/** Title of the job's cover letter document (`coverLetters/{id}.title`, max 120). */
export function letterTitle(job: Pick<Job, "company" | "title">): string {
  return `${job.company} — ${job.title}`.slice(0, 120);
}

// ─── Errors ────────────────────────────────────────────────────────────────────────────────────

export type SendErrorKind = MailSendErrorReason | "offline" | "failed";

function errorField(error: unknown, field: string): unknown {
  return error !== null && typeof error === "object" ? (error as Record<string, unknown>)[field] : undefined;
}

/** A `mailSend` / `mailSendCancel` / `mailSendNow` failure by `details.reason` (MAIL_SEND_ERROR_REASONS). */
export function sendErrorKind(error: unknown, online: boolean): SendErrorKind {
  if (!online) return "offline";
  const reason = MAIL_SEND_ERROR_REASONS.find((known) => known === errorField(errorField(error, "details"), "reason"));
  if (reason) return reason;
  const code = errorField(error, "code");
  return code === "functions/unavailable" || code === "unavailable" ? "offline" : "failed";
}

// ─── View model ────────────────────────────────────────────────────────────────────────────────

const messages = defineMessages({
  title: { id: "apply.email.title", defaultMessage: "Apply to {company}" },
  accountOption: {
    id: "apply.email.accountOption",
    defaultMessage: "{address} · {provider}",
    description: "From picker option: the address and its provider (Gmail, Outlook, Mail)",
  },
  gmail: { id: "apply.email.provider.gmail", defaultMessage: "Gmail" },
  microsoft: { id: "apply.email.provider.microsoft", defaultMessage: "Outlook" },
  imap: { id: "apply.email.provider.imap", defaultMessage: "Mail" },
  cvOption: {
    id: "apply.email.cvOption",
    defaultMessage: "{title} · {language} · edited {edited}",
    description: "CV picker option: CV title, its language, when it was last edited ('2 days ago')",
  },
  cvTailoredOption: {
    id: "apply.email.cvTailoredOption",
    defaultMessage: "{title} · tailored for {company}",
    description: "CV picker option for the version tailored for this job",
  },
  toSource: {
    id: "apply.email.toSource",
    defaultMessage: "From the job posting",
    description: "Source hint under the To field when it holds the posting's apply address",
  },
  letterLanguage: {
    id: "apply.email.letterLanguage",
    defaultMessage: "Written in {language}, the language of the posting.",
    description: "Hint under Subject: why the template is in this language",
  },
  letterLanguageCv: {
    id: "apply.email.letterLanguageCv",
    defaultMessage: "Written in {language}, the language of your CV.",
  },
  sendTo: {
    id: "apply.email.sendTo",
    defaultMessage:
      "{count, plural, =0 {Send to {address}} one {Send to {address} and # more} other {Send to {address} and # more}}",
    description: "Primary button on Review; count = recipients beyond the first",
  },
  attachmentsTooLarge: {
    id: "apply.email.attachmentsTooLargeLocal",
    defaultMessage: "The attachments are larger than {limit}. Remove a file, try a shorter CV, or leave out the cover letter.",
  },
  appliedOn: {
    id: "apply.email.appliedOn",
    defaultMessage: "You applied to {company} {when}.",
    description: "Shown instead of the composer when the job's application is already past Preparing",
  },
});

const fieldLabels = defineMessages({
  name: { id: "apply.field.name", defaultMessage: "Your name" },
  email: { id: "apply.field.email", defaultMessage: "Your email" },
  phone: { id: "apply.field.phone", defaultMessage: "Your phone number" },
  role: { id: "apply.field.role", defaultMessage: "Role" },
  company: { id: "apply.field.company", defaultMessage: "Company" },
  hiring_manager: { id: "apply.field.hiringManager", defaultMessage: "Hiring manager" },
  job_source: { id: "apply.field.jobSource", defaultMessage: "Where you found the job" },
  date: { id: "apply.field.date", defaultMessage: "Date" },
});

/** "Hiring manager" for `hiring_manager` (Fields to fill, Insert field). */
export function fieldLabel(field: MergeField, intl: IntlShape): string {
  return intl.formatMessage(fieldLabels[field]);
}

/** Every merge field, for "Insert field". */
export const MERGE_FIELDS: readonly MergeField[] = COVER_LETTER_MERGE_FIELDS;

const blockerMessages = defineMessages({
  offline: { id: "apply.email.blocker.offline", defaultMessage: "You're offline. Your draft is saved." },
  noRecipient: { id: "apply.email.blocker.noRecipient", defaultMessage: "Add the address to send your application to." },
  invalidRecipient: {
    id: "apply.email.blocker.invalidRecipient",
    defaultMessage: "“{entry}” isn't an email address. Check the To field.",
  },
  tooManyRecipients: {
    id: "apply.email.blocker.tooManyRecipients",
    defaultMessage: "Send to at most {max} addresses.",
  },
  noSubject: { id: "apply.email.blocker.noSubject", defaultMessage: "Add a subject." },
  noBody: { id: "apply.email.blocker.noBody", defaultMessage: "Write a short message." },
  noCv: {
    id: "apply.email.blocker.noCv",
    defaultMessage: "Create a CV in CVs first; it goes with your application.",
  },
  noLetter: {
    id: "apply.email.blocker.noLetter",
    defaultMessage: "Write your cover letter, or turn it off.",
  },
  field: {
    id: "apply.email.blocker.field",
    defaultMessage: "Fill in “{label}” before sending: {token} is still in your text.",
    description: "{label} names a merge field (Hiring manager); {token} is how it appears, e.g. {hiring_manager}",
  },
  gap: { id: "apply.email.blocker.gap", defaultMessage: "Fill in {gap} before sending." },
  tooManyAttachments: {
    id: "apply.email.blocker.tooManyAttachments",
    defaultMessage: "Attach at most {max} files, the CV and cover letter included.",
  },
  tooLongForMailApp: {
    id: "apply.email.blocker.tooLongForMailApp",
    defaultMessage: "This message is too long to hand to your mail app. Shorten it to {max} characters.",
  },
});

const errorMessages = defineMessages({
  offline: { id: "apply.email.error.offline", defaultMessage: "You're offline. Your draft is saved." },
  email_unverified: {
    id: "apply.email.error.emailUnverified",
    defaultMessage: "Confirm your email address to send from the app, then try again.",
  },
  account_not_found: {
    id: "apply.email.error.accountNotFound",
    defaultMessage: "That email account isn't connected anymore. Your draft is saved.",
  },
  cannot_send: {
    id: "apply.email.error.cannotSend",
    defaultMessage: "This account can't send yet. Allow sending from it, then try again. Your draft is saved.",
  },
  needs_reauth: {
    id: "apply.email.error.needsReauth",
    defaultMessage: "Reconnect this email account to send from it. Your draft is saved.",
  },
  daily_send_cap: {
    id: "apply.email.error.dailySendCap",
    defaultMessage: "Daily limit reached. Your draft is saved, and you can send it tomorrow.",
  },
  attachment_not_found: {
    id: "apply.email.error.attachmentNotFound",
    defaultMessage: "An attachment couldn't be found. Try again to attach it fresh.",
  },
  attachments_too_large: {
    id: "apply.email.error.attachmentsTooLarge",
    defaultMessage: "The attachments are too large to send. Remove a file, try a shorter CV, or leave out the cover letter.",
  },
  send_in_progress: {
    id: "apply.email.error.sendInProgress",
    defaultMessage: "This application is already on its way.",
  },
  already_sent: { id: "apply.email.error.alreadySent", defaultMessage: "This application was already sent." },
  application_not_found: {
    id: "apply.email.error.applicationNotFound",
    defaultMessage: "This application isn't in your tracker anymore.",
  },
  job_not_found: { id: "apply.email.error.jobNotFound", defaultMessage: "This job isn't available anymore." },
  failed: {
    id: "apply.email.error.failed",
    defaultMessage: "Couldn't send right now. Your draft is saved. Try again in a moment.",
  },
});

const refusalMessages = defineMessages({
  tooMany: {
    id: "apply.attachments.refusal.tooMany",
    defaultMessage: "You can attach up to {max} files, the CV and cover letter included.",
  },
  type: {
    id: "apply.attachments.refusal.type",
    defaultMessage: "“{fileName}” can't be attached. Use a PDF, Word, RTF, text, PNG or JPEG file.",
  },
  tooLarge: {
    id: "apply.attachments.refusal.tooLarge",
    defaultMessage: "“{fileName}” would take the attachments over {limit}, the most this account can send.",
  },
});

export function refusalSentence(refusal: AttachmentRefusal, ctx: Pick<ModelContext, "intl" | "locale">): string {
  switch (refusal.kind) {
    case "tooMany":
      return ctx.intl.formatMessage(refusalMessages.tooMany, { max: MAIL_SEND_MAX_ATTACHMENTS });
    case "type":
      return ctx.intl.formatMessage(refusalMessages.type, { fileName: refusal.fileName });
    case "tooLarge":
      return ctx.intl.formatMessage(refusalMessages.tooLarge, {
        fileName: refusal.fileName,
        limit: fileSize(refusal.limitBytes, ctx.locale),
      });
  }
}

export interface OptionVM {
  readonly id: string;
  readonly label: string;
}

export interface ComposerModel {
  readonly title: string;
  readonly subtitle: string;
  /** Empty without a sending account (the mail-app path). */
  readonly accounts: readonly OptionVM[];
  /** CV choices: `cvId`, or `cvId@revisionId` for the version tailored for this job. */
  readonly cvs: readonly OptionVM[];
  /** "From the job posting" while To holds the posting's address. */
  readonly toSource: string | null;
  readonly languageHint: string;
  readonly blocker: string | null;
  /** "Send to careers@… and 1 more". */
  readonly sendLabel: string;
  /** Already applied: "You applied to Halden Freight 2 days ago." */
  readonly applied: { readonly text: string; readonly at: TimeVM } | null;
}

/** The CV picker's value for a draft: `cvId`, or `cvId@revisionId` for a specific version. */
export function cvOptionValue(draft: Pick<ApplyDraft, "cvId" | "cvRevisionId">): string {
  if (draft.cvId === null) return "";
  return draft.cvRevisionId === null ? draft.cvId : `${draft.cvId}@${draft.cvRevisionId}`;
}

export function parseCvOption(value: string): Pick<ApplyDraft, "cvId" | "cvRevisionId"> {
  const [cvId = "", revisionId] = value.split("@");
  return { cvId: cvId === "" ? null : cvId, cvRevisionId: revisionId ?? null };
}

export function languageName(tag: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** The CV choices: every active CV, plus the version tailored for this job when one is pinned or chosen. */
function cvOptions(input: ApplyInput, draft: ApplyDraft, ctx: Pick<ModelContext, "intl" | "locale" | "now" | "timeZone">): OptionVM[] {
  const { intl } = ctx;
  const tailored = [pinnedCv(input), draft.cvRevisionId !== null && draft.cvId !== null ? { cvId: draft.cvId, cvRevisionId: draft.cvRevisionId } : null]
    .filter((entry): entry is { cvId: string; cvRevisionId: string } => entry !== null)
    .filter((entry, index, all) => all.findIndex((other) => other.cvRevisionId === entry.cvRevisionId) === index);
  return activeCvs(input.cvs).flatMap((candidate) => [
    ...tailored
      .filter((entry) => entry.cvId === candidate.id && entry.cvRevisionId !== candidate.currentRevisionId)
      .map((entry) => ({
        id: `${entry.cvId}@${entry.cvRevisionId}`,
        label: intl.formatMessage(messages.cvTailoredOption, { title: candidate.title, company: input.job.company }),
      })),
    {
      id: candidate.id,
      label: intl.formatMessage(messages.cvOption, {
        title: candidate.title,
        language: languageName(candidate.language, ctx.locale),
        edited: relativeTime(candidate.updatedAt, ctx).label,
      }),
    },
  ]);
}

export function composerModel(
  input: ApplyInput,
  draft: ApplyDraft,
  values: MergeValues,
  options: { readonly online: boolean },
  ctx: Pick<ModelContext, "intl" | "locale" | "now" | "timeZone">,
): ComposerModel {
  const { intl } = ctx;
  const accounts = sendingAccounts(input.mailAccounts);
  const cv = input.cvs.find((candidate) => candidate.id === draft.cvId) ?? null;
  const language = letterLanguage(input.job, cv);
  const fromPosting = baseLanguage(input.job.language) === language;
  const blocker = draftBlocker(draft, values, { online: options.online, canSend: accounts.length > 0 });
  const addresses = parseRecipients(draft.to).addresses;
  const applied = alreadyApplied(input.application) ? input.application : null;
  const appliedAt = applied ? (applied.appliedAt ?? applied.updatedAt) : null;
  return {
    title: intl.formatMessage(messages.title, { company: input.job.company }),
    subtitle: [input.job.title, input.job.locations[0]?.label].filter(Boolean).join(" · "),
    accounts: accounts.map((account) => ({
      id: account.id,
      label: intl.formatMessage(messages.accountOption, {
        address: account.address,
        provider: intl.formatMessage(messages[account.provider]),
      }),
    })),
    cvs: cvOptions(input, draft, ctx),
    toSource:
      input.job.applyEmail !== null && addresses.length === 1 && addresses[0] === input.job.applyEmail
        ? intl.formatMessage(messages.toSource)
        : null,
    languageHint: intl.formatMessage(fromPosting ? messages.letterLanguage : messages.letterLanguageCv, {
      language: languageName(language, ctx.locale),
    }),
    blocker: blocker && blockerSentence(blocker, ctx),
    sendLabel: intl.formatMessage(messages.sendTo, {
      address: addresses[0] ?? draft.to.trim(),
      count: Math.max(0, addresses.length - 1),
    }),
    applied:
      applied && appliedAt
        ? {
            text: intl.formatMessage(messages.appliedOn, {
              company: input.job.company,
              when: relativeTime(appliedAt, ctx).label,
            }),
            at: relativeTime(appliedAt, ctx),
          }
        : null,
  };
}

export function blockerSentence(blocker: ApplyBlocker, ctx: Pick<ModelContext, "intl">): string {
  switch (blocker.kind) {
    case "invalidRecipient":
      return ctx.intl.formatMessage(blockerMessages.invalidRecipient, { entry: blocker.entry });
    case "tooManyRecipients":
      return ctx.intl.formatMessage(blockerMessages.tooManyRecipients, { max: MAX_RECIPIENTS });
    case "field":
      return ctx.intl.formatMessage(blockerMessages.field, {
        label: fieldLabel(blocker.field, ctx.intl),
        token: `{${blocker.field}}`,
      });
    case "gap":
      return ctx.intl.formatMessage(blockerMessages.gap, { gap: blocker.gap });
    case "tooManyAttachments":
      return ctx.intl.formatMessage(blockerMessages.tooManyAttachments, { max: MAIL_SEND_MAX_ATTACHMENTS });
    case "tooLongForMailApp":
      return ctx.intl.formatMessage(blockerMessages.tooLongForMailApp, { max: MAILTO_MAX_BODY_LENGTH });
    default:
      return ctx.intl.formatMessage(blockerMessages[blocker.kind]);
  }
}

/** One calm sentence per send failure (SendBlockerLine). */
export function sendErrorSentence(kind: SendErrorKind, ctx: Pick<ModelContext, "intl">): string {
  return ctx.intl.formatMessage(errorMessages[kind]);
}

// ─── Attachments ───────────────────────────────────────────────────────────────────────────────

export function fileSize(bytes: number, locale: string): string {
  const kilobytes = bytes / 1000;
  return kilobytes >= 1000
    ? new Intl.NumberFormat(locale, { style: "unit", unit: "megabyte", unitDisplay: "short", maximumFractionDigits: 1 }).format(kilobytes / 1000)
    : new Intl.NumberFormat(locale, { style: "unit", unit: "kilobyte", unitDisplay: "short", maximumFractionDigits: 0 }).format(Math.max(1, kilobytes));
}

/**
 * Over the limit the server would refuse (`attachments_too_large`): say so before sending.
 * Microsoft accounts send about 2.9 MB (one Graph request); without an account the 18 MB rule applies.
 */
export function attachmentsTooLarge(
  totalBytes: number,
  provider: MailProvider | null,
  ctx: Pick<ModelContext, "intl" | "locale">,
): string | null {
  const limit = attachmentLimitBytes(provider);
  return totalBytes > limit ? ctx.intl.formatMessage(messages.attachmentsTooLarge, { limit: fileSize(limit, ctx.locale) }) : null;
}

/** The cover letter's date (`YYYY-MM-DD`) on the user's calendar. */
export function letterDay(now: Date, timeZone: string): string {
  // en-CA formats dates as ISO `YYYY-MM-DD`.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
