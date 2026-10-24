/**
 * Email apply (BRIEF §4.4, research/apply.md "Decision — Desktop", decisions.md D21–D24, F6): the
 * composer's pure logic. The draft (From, To, Subject, Body, CV, optional cover letter) starts
 * from templates in the letter's language (the posting's, else the CV's) with the merge fields
 * name / role / company filled from the profile and the job; a value we don't have stays a visible
 * `[gap]` that blocks sending (the CV placeholder rule, BRIEF §2.4). `composerModel` formats what
 * the panel shows; `buildSendRequest` / `mailtoMessage` / `applyRecord` are what the actions send.
 */
import {
  type Application,
  type CoverLetter,
  type Cv,
  EmailSchema,
  type Job,
  type JobMatch,
  MAIL_SEND_ERROR_REASONS,
  MAIL_SEND_MAX_ATTACHMENT_BYTES,
  type MailAccount,
  type MailSendErrorReason,
  type MailSendRequest,
  type Profile,
  type RenderedFile,
  statusPhase,
} from "@bfhr/core";
import { PLACEHOLDER_PATTERN } from "@bfhr/cv-render";
import { defineMessages } from "react-intl";
import type { ApplyRecord } from "../../data/jobs/writes";
import { relativeTime } from "../../shared/model/format";
import type { ModelContext, TimeVM } from "../../shared/model/types";

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
}

export function findApplyInput(
  jobId: string,
  tracker: { readonly profile: Profile | null; readonly applications: readonly Application[]; readonly cvs: readonly Cv[] },
  jobs: {
    readonly jobs: readonly Job[];
    readonly jobMatches: readonly JobMatch[];
    readonly mailAccounts: readonly MailAccount[];
    readonly coverLetters: readonly CoverLetter[];
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

// ─── Templates and merge fields ────────────────────────────────────────────────────────────────

/** Languages the email and cover letter templates exist in. */
export type LetterLanguage = "en" | "tr" | "de";

function baseLanguage(tag: string | undefined): LetterLanguage | null {
  const base = tag?.toLowerCase().split(/[-_]/u)[0];
  return base === "en" || base === "tr" || base === "de" ? base : null;
}

/** The posting's language when we have templates for it, else the CV's, else English. */
export function letterLanguage(job: Pick<Job, "language">, cv: Pick<Cv, "language"> | null): LetterLanguage {
  return baseLanguage(job.language) ?? baseLanguage(cv?.language) ?? "en";
}

export type MergeField = "name" | "role" | "company";

export type MergeValues = Readonly<Record<MergeField, string | null>>;

export function mergeValues(job: Pick<Job, "title" | "company">, profile: Pick<Profile, "fullName"> | null): MergeValues {
  return { name: profile?.fullName.trim() || null, role: job.title, company: job.company };
}

/** What stands in for a value we don't have: a `[gap]` the user fills in before sending. */
const GAPS: Readonly<Record<LetterLanguage, Readonly<Record<MergeField, string>>>> = {
  en: { name: "[Your name]", role: "[Role]", company: "[Company]" },
  tr: { name: "[Adınız Soyadınız]", role: "[Pozisyon]", company: "[Şirket]" },
  de: { name: "[Dein Name]", role: "[Stelle]", company: "[Unternehmen]" },
};

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

/**
 * A starting cover letter when the job has none yet; the bracketed gaps are for the user to write.
 * Each gap stays within `PLACEHOLDER_PATTERN`'s 40 characters, so it blocks sending until filled.
 */
const LETTERS: Readonly<Record<LetterLanguage, string>> = {
  en: "Dear Hiring Team,\n\nI'm applying for the {role} position at {company}. [Why this role and company appeal to you]\n\n[A relevant result and its impact]\n\nI'd welcome the chance to talk about how I can help.\n\nKind regards,\n{name}",
  tr: "Sayın Yetkili,\n\n{company} bünyesindeki {role} pozisyonu için başvuruyorum. [Bu pozisyon sizi neden ilgilendiriyor]\n\n[İlgili bir çalışmanız ve sonucu]\n\nNasıl katkı sağlayabileceğimi konuşmaktan memnuniyet duyarım.\n\nSaygılarımla,\n{name}",
  de: "Sehr geehrte Damen und Herren,\n\nhiermit bewerbe ich mich um die Stelle als {role} bei {company}. [Warum dich die Stelle reizt]\n\n[Ein passendes Projekt und sein Ergebnis]\n\nÜber die Gelegenheit zu einem persönlichen Gespräch freue ich mich.\n\nMit freundlichen Grüßen\n{name}",
};

/** Replaces `{name}`, `{role}`, `{company}` with their values, or with a `[gap]` when missing. */
export function fillTemplate(template: string, values: MergeValues, language: LetterLanguage): string {
  return template.replace(/\{(name|role|company)\}/gu, (_, field: MergeField) => values[field] ?? GAPS[language][field]);
}

export function subjectTemplate(language: LetterLanguage): string {
  return SUBJECTS[language];
}

export function bodyTemplate(language: LetterLanguage, withLetter: boolean): string {
  return BODIES[language](withLetter);
}

export function letterTemplate(language: LetterLanguage): string {
  return LETTERS[language];
}

/** `[gaps]` left in a text (the same pattern as CV placeholders). */
export function gapsIn(text: string): readonly string[] {
  return [...text.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[0]);
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
  readonly letterOn: boolean;
  readonly letter: string;
}

export function createDraft(input: ApplyInput): ApplyDraft {
  const cvId = defaultCvId(input.cvs, input.match);
  const language = letterLanguage(input.job, input.cvs.find((cv) => cv.id === cvId) ?? null);
  const values = mergeValues(input.job, input.profile);
  const existing = jobCoverLetter(input.coverLetters, input.job.id);
  // D24: a short intro in the body plus the letter attached, when there is a letter.
  const letterOn = existing !== null;
  return {
    accountId: sendingAccounts(input.mailAccounts)[0]?.id ?? null,
    to: input.job.applyEmail ?? "",
    subject: fillTemplate(subjectTemplate(language), values, language),
    body: fillTemplate(bodyTemplate(language, letterOn), values, language),
    bodyEdited: false,
    cvId,
    letterOn,
    letter: existing?.body ?? fillTemplate(letterTemplate(language), values, language),
  };
}

/** Turns the cover letter on or off; an untouched body follows ("My CV and cover letter are attached."). */
export function toggleLetter(draft: ApplyDraft, letterOn: boolean, input: ApplyInput): ApplyDraft {
  if (draft.bodyEdited) return { ...draft, letterOn };
  const language = letterLanguage(input.job, input.cvs.find((cv) => cv.id === draft.cvId) ?? null);
  return { ...draft, letterOn, body: fillTemplate(bodyTemplate(language, letterOn), mergeValues(input.job, input.profile), language) };
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
  | { readonly kind: "gap"; readonly gap: string }
  | { readonly kind: "tooLongForMailApp" };

/**
 * The first reason the draft can't move on, in the order the form reads (To, Subject, Body, CV,
 * cover letter). `online` and `canSend` decide the offline and mail-app rules: sending needs a
 * connection; the mail-app path needs one only to store the files ("I sent it").
 */
export function draftBlocker(draft: ApplyDraft, options: { readonly online: boolean; readonly canSend: boolean }): ApplyBlocker | null {
  const recipients = parseRecipients(draft.to);
  if (recipients.invalid !== null) return { kind: "invalidRecipient", entry: recipients.invalid };
  if (recipients.addresses.length === 0) return { kind: "noRecipient" };
  if (recipients.addresses.length > MAX_RECIPIENTS) return { kind: "tooManyRecipients" };
  if (draft.subject.trim() === "") return { kind: "noSubject" };
  if (draft.body.trim() === "") return { kind: "noBody" };
  if (draft.cvId === null) return { kind: "noCv" };
  if (draft.letterOn && draft.letter.trim() === "") return { kind: "noLetter" };
  const gap = [draft.subject, draft.body, ...(draft.letterOn ? [draft.letter] : [])].flatMap(gapsIn)[0];
  if (gap !== undefined) return { kind: "gap", gap };
  if (!options.canSend && draft.body.length > MAILTO_MAX_BODY_LENGTH) return { kind: "tooLongForMailApp" };
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

/** `mailSend`: from the chosen account, the CV (+ letter) PDFs attached and pinned. */
export function buildSendRequest(
  draft: ApplyDraft,
  target: { readonly accountId: string; readonly applicationId: string | null; readonly jobId: string },
  pins: ApplyPins,
): MailSendRequest {
  const files = [pins.cvFile, ...(pins.letterFile ? [pins.letterFile] : [])];
  return {
    accountId: target.accountId,
    applicationId: target.applicationId,
    jobId: target.jobId,
    to: parseRecipients(draft.to).addresses.map((address) => ({ name: null, address })),
    cc: [],
    subject: draft.subject.trim(),
    bodyText: draft.body,
    attachments: files.map((file) => ({ kind: "rendered" as const, renderedFileId: file.id })),
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
export function mailtoMessage(draft: ApplyDraft): { readonly to: readonly string[]; readonly subject: string; readonly body: string } {
  return { to: parseRecipients(draft.to).addresses, subject: draft.subject.trim(), body: draft.body };
}

/** "I sent it": the application moves to Applied (email channel) with the files pinned. */
export function applyRecord(input: ApplyInput, pins: ApplyPins): ApplyRecord {
  return {
    job: input.job,
    application: input.application,
    channel: "email",
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
    defaultMessage: "The attachments are larger than {limit}. Try a shorter CV, or leave out the cover letter.",
  },
  appliedOn: {
    id: "apply.email.appliedOn",
    defaultMessage: "You applied to {company} {when}.",
    description: "Shown instead of the composer when the job's application is already past Preparing",
  },
});

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
  gap: { id: "apply.email.blocker.gap", defaultMessage: "Fill in {gap} before sending." },
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
    defaultMessage: "The attachments are too large to send. Try a shorter CV, or leave out the cover letter.",
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

export interface OptionVM {
  readonly id: string;
  readonly label: string;
}

export interface ComposerModel {
  readonly title: string;
  readonly subtitle: string;
  /** Empty without a sending account (the mail-app path). */
  readonly accounts: readonly OptionVM[];
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

function languageName(tag: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

export function composerModel(
  input: ApplyInput,
  draft: ApplyDraft,
  options: { readonly online: boolean },
  ctx: Pick<ModelContext, "intl" | "locale" | "now" | "timeZone">,
): ComposerModel {
  const { intl } = ctx;
  const accounts = sendingAccounts(input.mailAccounts);
  const cv = input.cvs.find((candidate) => candidate.id === draft.cvId) ?? null;
  const language = letterLanguage(input.job, cv);
  const fromPosting = baseLanguage(input.job.language) === language;
  const blocker = draftBlocker(draft, { online: options.online, canSend: accounts.length > 0 });
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
    cvs: activeCvs(input.cvs).map((candidate) => ({
      id: candidate.id,
      label: intl.formatMessage(messages.cvOption, {
        title: candidate.title,
        language: languageName(candidate.language, ctx.locale),
        edited: relativeTime(candidate.updatedAt, ctx).label,
      }),
    })),
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
    case "gap":
      return ctx.intl.formatMessage(blockerMessages.gap, { gap: blocker.gap });
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

export interface AttachmentVM {
  readonly key: "cv" | "letter";
  readonly fileName: string;
  /** "84 kB"; null until the PDF is made. */
  readonly size: string | null;
}

export function fileSize(bytes: number, locale: string): string {
  const kilobytes = bytes / 1000;
  return kilobytes >= 1000
    ? new Intl.NumberFormat(locale, { style: "unit", unit: "megabyte", unitDisplay: "short", maximumFractionDigits: 1 }).format(kilobytes / 1000)
    : new Intl.NumberFormat(locale, { style: "unit", unit: "kilobyte", unitDisplay: "short", maximumFractionDigits: 0 }).format(Math.max(1, kilobytes));
}

/** Over the provider limit the server would refuse (`attachments_too_large`): say so before sending. */
export function attachmentsTooLarge(totalBytes: number, ctx: Pick<ModelContext, "intl" | "locale">): string | null {
  return totalBytes > MAIL_SEND_MAX_ATTACHMENT_BYTES
    ? ctx.intl.formatMessage(messages.attachmentsTooLarge, { limit: fileSize(MAIL_SEND_MAX_ATTACHMENT_BYTES, ctx.locale) })
    : null;
}

/** The cover letter's date (`YYYY-MM-DD`) on the user's calendar. */
export function letterDay(now: Date, timeZone: string): string {
  // en-CA formats dates as ISO `YYYY-MM-DD`.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
