import {
  candidateApplications,
  classifyByRules,
  decideMailAction,
  extractByRules,
  foldText,
  isIanaTimeZone,
  isJobCandidate,
  linkApplication,
  mailEvidenceReason,
  mailSignals,
  wallTimeToInstant,
  zoneOffsetMinutes,
  type LinkResult,
  type MailCategory,
  type MailDecision,
  type MailExtraction,
  type MailInput,
  type MailSignals,
  type TrackedApplication,
} from "@bfhr/core";
import { type UsageLedger, generateWithinBudget } from "./budget";
import { type ModelId, type TokenUsage, ZERO_USAGE } from "./models";
import {
  MAIL_CLASSIFY_PROMPT_VERSION,
  MAIL_CLASSIFY_SYSTEM,
  type MailClassifyOutput,
  MailClassifyOutputSchema,
  mailClassifyUserPrompt,
} from "./prompts/mail-classify";
import type { AiProvider, Effort } from "./provider";

/** Model settings for mail classification (docs/adr/0012-mail-sync.md; chosen by eval/mail/report.md). */
export const MAIL_CLASSIFY_MODEL: ModelId = "claude-haiku-5-5";
export const MAIL_CLASSIFY_EFFORT: Effort = "low";
export const MAIL_CLASSIFY_MAX_OUTPUT_TOKENS = 1_200;
/** Applications listed to the model (shortlist first, then the most recent active ones). */
const MAX_PROMPT_APPLICATIONS = 25;
/** Model confidence is capped here when the rules found a decisive phrase for another category. */
const DISAGREEMENT_CAP = 0.8;

export interface AnalyzeMailInput {
  mail: MailInput;
  receivedAt: Date;
  /** The user's tracker (all applications, any status). */
  applications: readonly TrackedApplication[];
  /** Zone for dates the mail gives without offset or zone (profile timezone). */
  userTimeZone: string;
  autoApplyConfidence: number;
}

export interface AnalyzeMailAi {
  provider: AiProvider;
  ledger: UsageLedger;
  model?: ModelId;
  effort?: Effort;
}

export interface MailAnalysis {
  /** False: not job mail by the pre-filter; nothing else was computed and nothing is stored. */
  candidate: boolean;
  category: MailCategory;
  confidence: number;
  screening: boolean;
  /** `ai` when the model classified, `rule` when the rules did (AI off or unavailable). */
  actor: "ai" | "rule";
  language: string | null;
  extracted: MailExtraction;
  link: LinkResult;
  decision: MailDecision;
  /** Evidence sentence for events and the review card (no body text). */
  reason: string;
  signals: MailSignals;
  model: ModelId | null;
  promptVersion: string | null;
  usage: TokenUsage;
  costMicroUsd: number;
}

const EMPTY_EXTRACTION: MailExtraction = {
  company: null,
  role: null,
  contactName: null,
  contactEmail: null,
  dates: [],
  meetingUrls: [],
};

/**
 * The whole per-message pipeline (BRIEF §4.7 steps 2–6): pre-filter → classify (model when `ai`
 * is given, rules otherwise) → ground the extraction in the text → link → decide. Pure apart
 * from the model call, so the sync engine and the eval run the same code.
 */
export async function analyzeMail(input: AnalyzeMailInput, ai: AnalyzeMailAi | null): Promise<MailAnalysis> {
  const { mail, applications } = input;
  const signals = mailSignals(mail, applications);
  const rules = classifyByRules(mail, signals);
  const ruleExtraction = extractByRules(mail, signals, applications);
  const base = {
    signals,
    model: null,
    promptVersion: null,
    usage: ZERO_USAGE,
    costMicroUsd: 0,
  };

  if (!isJobCandidate(signals)) {
    const link: LinkResult = { applicationId: null, linkStrength: "none" };
    return {
      ...base,
      candidate: false,
      category: "not_job",
      confidence: rules.confidence,
      screening: false,
      actor: "rule",
      language: null,
      extracted: EMPTY_EXTRACTION,
      link,
      decision: { suggestedStatus: null, reviewState: "not_required", autoApply: false },
      reason: "",
    };
  }

  let category = rules.category;
  let confidence = rules.confidence;
  let screening = rules.screening;
  let actor: "ai" | "rule" = "rule";
  let language: string | null = null;
  let extracted: MailExtraction = {
    ...EMPTY_EXTRACTION,
    company: ruleExtraction.company,
    role: ruleExtraction.role,
  };
  let modelChoice: string | null = null;
  let model: ModelId | null = null;
  let usage = ZERO_USAGE;
  let costMicroUsd = 0;

  if (ai !== null) {
    const shortlist = promptApplications(signals, applications, ruleExtraction.company);
    model = ai.model ?? MAIL_CLASSIFY_MODEL;
    const metered = await generateWithinBudget(ai.provider, ai.ledger, {
      model,
      effort: ai.effort ?? MAIL_CLASSIFY_EFFORT,
      system: MAIL_CLASSIFY_SYSTEM,
      user: mailClassifyUserPrompt(
        {
          fromName: mail.from.name,
          fromAddress: mail.from.address,
          subject: mail.subject,
          date: isoWithZone(input.receivedAt, input.userTimeZone),
          folder: mail.folder,
          bulk: mail.bulk || mail.listUnsubscribe,
          body: mail.bodyText,
        },
        shortlist.map(({ id, company, role, status }) => ({ id, company, role, status })),
      ),
      schema: MailClassifyOutputSchema,
      maxOutputTokens: MAIL_CLASSIFY_MAX_OUTPUT_TOKENS,
    });
    usage = metered.usage;
    costMicroUsd = metered.costMicroUsd;
    const output = metered.data;
    actor = "ai";
    category = output.category;
    confidence = Math.min(1, Math.max(0, output.confidence));
    screening = output.category === "interview_invite" && output.screening;
    language = output.language === "other" ? null : output.language;
    extracted = groundExtraction(output, mail, input.userTimeZone);
    modelChoice = shortlist.some((application) => application.id === output.applicationId)
      ? output.applicationId
      : null;
    // Cross-check: a decisive rule phrase for a different status category caps the confidence,
    // so a disagreement always lands in the review queue instead of changing the tracker.
    const ruleDecisive =
      rules.confidence >= 0.9 && rules.category !== "not_job" && rules.category !== "other_job";
    if (ruleDecisive && rules.category !== category) confidence = Math.min(confidence, DISAGREEMENT_CAP);
  }

  // Alerts list many companies and non-job mail belongs to no application: never link them.
  const link: LinkResult =
    category === "job_alert" || category === "not_job"
      ? { applicationId: null, linkStrength: "none" }
      : linkApplication({
          signals,
          applications,
          company: extracted.company ?? ruleExtraction.company,
          role: extracted.role ?? ruleExtraction.role,
          modelChoice,
        });
  const linked = applications.find((application) => application.id === link.applicationId) ?? null;
  const decision =
    category === "not_job"
      ? { suggestedStatus: null, reviewState: "not_required" as const, autoApply: false }
      : decideMailAction({
          category,
          confidence,
          screening,
          applicationStatus: linked?.status ?? null,
          linkStrength: link.linkStrength,
          actor,
          autoApplyConfidence: input.autoApplyConfidence,
        });
  return {
    ...base,
    candidate: true,
    category,
    confidence: Math.round(confidence * 1000) / 1000,
    screening,
    actor,
    language: language ?? guessLanguage(`${mail.subject}\n${mail.bodyText}`),
    extracted,
    link,
    decision,
    reason: mailEvidenceReason({
      category,
      senderDomain: signals.senderDomain,
      linkStrength: link.linkStrength,
      actor,
    }),
    model,
    promptVersion: model === null ? null : MAIL_CLASSIFY_PROMPT_VERSION,
    usage,
    costMicroUsd,
  };
}

/** Shortlisted applications first (company/domain/thread matches), then other active ones. */
function promptApplications(
  signals: MailSignals,
  applications: readonly TrackedApplication[],
  company: string | null,
): TrackedApplication[] {
  const shortlist = candidateApplications(signals, applications, company);
  const rest = applications.filter(
    (application) =>
      !shortlist.includes(application) &&
      !["rejected", "withdrawn", "accepted", "declined", "ghosted"].includes(application.status),
  );
  return [...shortlist, ...rest].slice(0, MAX_PROMPT_APPLICATIONS);
}

/**
 * Keeps only what the email actually says: company/role/contact must occur in the text (folded),
 * meeting URLs verbatim; dates become instants using the stated offset, the stated zone, or the
 * user's zone. Invalid values are dropped, never repaired.
 */
export function groundExtraction(
  output: MailClassifyOutput,
  mail: MailInput,
  userTimeZone: string,
): MailExtraction {
  const haystack = foldText(`${mail.from.name ?? ""} ${mail.from.address} ${mail.subject}\n${mail.bodyText}`);
  const grounded = (value: string | null, max: number) => {
    const trimmed = value?.trim() ?? "";
    if (trimmed === "" || trimmed.length > max) return null;
    return haystack.includes(foldText(trimmed)) ? trimmed : null;
  };
  const contactEmail = grounded(output.contactEmail, 320);
  const dates: MailExtraction["dates"] = [];
  for (const date of output.dates.slice(0, 20)) {
    const at = toInstant(date.local, date.utcOffset, date.timeZone ?? userTimeZone);
    if (at === null) continue;
    const timeZone = date.timeZone !== null && isIanaTimeZone(date.timeZone) ? date.timeZone : null;
    dates.push({ kind: date.kind, at, timezone: timeZone, label: date.label.slice(0, 200) });
  }
  return {
    company: grounded(output.company, 200),
    role: grounded(output.role, 200),
    contactName: grounded(output.contactName, 200),
    contactEmail:
      contactEmail !== null && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contactEmail) ? contactEmail : null,
    dates,
    meetingUrls: output.meetingUrls
      .filter((url) => /^https:\/\/\S+$/u.test(url) && mail.bodyText.includes(url))
      .slice(0, 10),
  };
}

/** `YYYY-MM-DDTHH:MM` local time → instant, by explicit offset or else by IANA zone. */
export function toInstant(local: string, utcOffset: string | null, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(local.trim());
  if (match === null) return null;
  const [, year, month, day, hour, minute] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const wall = { year, month, day, hour, minute };
  const offset = utcOffset === null ? null : /^([+-])(\d{2}):?(\d{2})$/u.exec(utcOffset.trim());
  if (offset !== null) {
    const asUtc = wallTimeToInstant(wall, "UTC");
    const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "-" ? -1 : 1);
    return asUtc === null ? null : new Date(asUtc.getTime() - minutes * 60_000);
  }
  return wallTimeToInstant(wall, timeZone);
}

/** `2026-10-14T09:12:00+03:00` in the user's zone, so relative dates resolve as the user reads them. */
function isoWithZone(date: Date, timeZone: string): string {
  const zone = isIanaTimeZone(timeZone) ? timeZone : "UTC";
  const offset = zoneOffsetMinutes(date.getTime(), zone);
  const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Rules-mode language: Turkish/German letters and function words, else English when Latin text. */
function guessLanguage(text: string): string | null {
  const folded = ` ${foldText(text).replace(/[^\p{L}]+/gu, " ")} `;
  const count = (words: readonly string[]) =>
    words.reduce((sum, word) => sum + (folded.includes(` ${word} `) ? 1 : 0), 0);
  const scores = {
    tr:
      count(["ve", "bir", "icin", "ile", "bu", "size", "sizin", "olarak", "tesekkur", "merhaba", "sayin"]) +
      (/[ğşı]/u.test(text) ? 3 : 0),
    de:
      count(["und", "die", "der", "das", "nicht", "mit", "fur", "ihre", "wir", "sie", "uns", "vielen"]) +
      (/[äöß]/u.test(text) ? 2 : 0),
    en: count(["the", "and", "your", "you", "for", "with", "we", "our", "thank", "to"]),
  };
  const [best] = (Object.entries(scores) as [string, number][]).sort((a, b) => b[1] - a[1]);
  return best !== undefined && best[1] > 0 ? best[0] : null;
}
