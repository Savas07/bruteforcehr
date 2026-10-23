// Per-message processing shared by incremental sync and the lookback scan: dedupe → fetch →
// parse → analyze (@bfhr/ai analyzeMail) → store job mail → apply or queue the transition;
// job alerts add their postings to Jobs, interview invites carry an interview suggestion.
import { createHash } from "node:crypto";
import { analyzeMail, type AnalyzeMailAi, DailyCapError, type MailAnalysis } from "@bfhr/ai";
import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import {
  type Application,
  type ApplicationEvent,
  DEFAULT_PROFILE_SETTINGS,
  type MailAccount,
  type MailMessage,
  interviewSuggestionFromMail,
  mailBodyPurgeAt,
  parseJobAlert,
  type TrackedApplication,
  transition,
} from "@bfhr/core";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { aiProvider } from "../ai/common";
import { firestoreUsageLedger } from "../ai/usage-ledger";
import { converters } from "../converters";
import { upsertAlertPostings } from "./job-alerts";
import { type ParsedMail, parseMail } from "./parse";
import type { MailProviderAdapter, MessageRef } from "./providers/types";

/** Non-job hashes outlive the longest lookback (180 days) so a rescan never reprocesses them. */
const SEEN_TTL_DAYS = 200;
/** Messages fetched per round trip. */
const FETCH_BATCH = 25;
const THREAD_PROVIDERS: readonly MailAccount["provider"][] = ["gmail", "microsoft"];

export interface PipelineContext {
  uid: string;
  account: MailAccount;
  applications: Map<string, Application>;
  autoApplyConfidence: number;
  retentionDays: number;
  timeZone: string;
  /** null: rules only (AI off, no key, or today's AI budget used up). */
  ai: AnalyzeMailAi | null;
}

export interface ProcessCounts {
  scanned: number;
  jobMessages: number;
  interviewInvites: number;
  jobAlerts: number;
  pendingReview: number;
  autoApplied: number;
  /** Applications proposed or updated (application id, or `company|role` for untracked ones). */
  applicationKeys: Set<string>;
}

export const emptyCounts = (): ProcessCounts => ({
  scanned: 0,
  jobMessages: 0,
  interviewInvites: 0,
  jobAlerts: 0,
  pendingReview: 0,
  autoApplied: 0,
  applicationKeys: new Set(),
});

/** Loads the user's settings and tracker once per sync run. */
export async function loadPipelineContext(uid: string, account: MailAccount): Promise<PipelineContext> {
  const db = getFirestore();
  const [profile, applications] = await Promise.all([
    db.doc(firestorePaths.user(uid)).get(),
    db.collection(firestorePaths.applications(uid)).get(),
  ]);
  const settings = {
    ...DEFAULT_PROFILE_SETTINGS,
    ...(profile.get("settings") as Partial<typeof DEFAULT_PROFILE_SETTINGS> | undefined),
  };
  const aiAllowed = profile.get("aiEnabled") !== false && settings.aiMailTextAllowed === true;
  const byId = new Map<string, Application>();
  for (const snapshot of applications.docs) {
    try {
      byId.set(snapshot.id, converters.application.fromSnapshot(snapshot));
    } catch (error) {
      logger.warn("mail_application_unreadable", {
        name: error instanceof Error ? error.name : typeof error,
      });
    }
  }
  return {
    uid,
    account,
    applications: byId,
    autoApplyConfidence: settings.autoApplyConfidence,
    retentionDays: settings.mailBodyRetentionDays,
    timeZone: typeof profile.get("timezone") === "string" ? (profile.get("timezone") as string) : "UTC",
    ai: aiAllowed ? { provider: aiProvider(), ledger: firestoreUsageLedger(uid) } : null,
  };
}

function tracked(context: PipelineContext): TrackedApplication[] {
  return [...context.applications.values()].map((application) => ({
    id: application.id,
    company: application.company,
    companyDomain: application.companyDomain,
    role: application.role,
    status: application.status,
    threadRefs: application.threadRefs,
  }));
}

/** Document id of a message: stable per account + provider id, never revealing either. */
export function messageKey(accountId: string, providerMessageId: string): string {
  return createHash("sha256").update(`${accountId}\n${providerMessageId}`).digest("hex");
}

/** Processes the refs not seen before and adds to `counts`. */
export async function processRefs(
  context: PipelineContext,
  adapter: MailProviderAdapter,
  refs: readonly MessageRef[],
  counts: ProcessCounts,
): Promise<void> {
  const db = getFirestore();
  for (let start = 0; start < refs.length; start += FETCH_BATCH) {
    const batch = refs.slice(start, start + FETCH_BATCH);
    counts.scanned += batch.length;
    const keys = batch.map((ref) => messageKey(context.account.id, ref.id));
    const existing = await db.getAll(
      ...keys.map((key) => db.doc(serverOnlyPaths.mailSeen(context.uid, key))),
      ...keys.map((key) => db.doc(firestorePaths.mailMessage(context.uid, key))),
    );
    const known = new Set(existing.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.id));
    const fresh = batch.filter((_ref, index) => !known.has(keys[index] ?? ""));
    if (fresh.length === 0) continue;
    for (const fetched of await adapter.fetch(fresh)) {
      const parsed = await parseMail(context.account.id, fetched);
      const key = messageKey(context.account.id, fetched.id);
      // Provider ids change when the IMAP UIDVALIDITY resets; the RFC 822 Message-ID doesn't, so
      // a rescan never stores (or applies) the same mail twice.
      if (parsed.rfc822MessageId !== null) {
        const same = await db
          .collection(firestorePaths.mailMessages(context.uid))
          .where("accountId", "==", context.account.id)
          .where("rfc822MessageId", "==", parsed.rfc822MessageId.slice(0, 998))
          .limit(1)
          .get();
        if (!same.empty) continue;
      }
      let analysis: MailAnalysis;
      const input = {
        mail: parsed.input,
        receivedAt: parsed.receivedAt,
        applications: tracked(context),
        userTimeZone: context.timeZone,
        autoApplyConfidence: context.autoApplyConfidence,
      };
      try {
        analysis = await analyzeMail(input, context.ai);
      } catch (error) {
        // Over today's AI budget or the model failing: classify by rules instead of losing the mail.
        if (!(error instanceof DailyCapError))
          logger.warn("mail_ai_failed", { name: error instanceof Error ? error.name : typeof error });
        if (error instanceof DailyCapError) context.ai = null;
        analysis = await analyzeMail(input, null);
      }
      if (!analysis.candidate || analysis.category === "not_job") {
        await db.doc(serverOnlyPaths.mailSeen(context.uid, key)).set({
          accountId: context.account.id,
          expireAt: Timestamp.fromMillis(Date.now() + SEEN_TTL_DAYS * 86_400_000),
        });
        continue;
      }
      await storeJobMail(context, key, fetched.id, parsed, analysis, counts);
    }
  }
}

async function storeJobMail(
  context: PipelineContext,
  key: string,
  providerMessageId: string,
  parsed: ParsedMail,
  analysis: MailAnalysis,
  counts: ProcessCounts,
): Promise<void> {
  const db = getFirestore();
  const now = new Date();
  const application =
    analysis.link.applicationId === null
      ? null
      : (context.applications.get(analysis.link.applicationId) ?? null);
  const message: MailMessage = {
    id: key,
    accountId: context.account.id,
    providerMessageId,
    providerThreadId: parsed.input.providerThreadId,
    rfc822MessageId: parsed.rfc822MessageId?.slice(0, 998) ?? null,
    inReplyTo: parsed.input.inReplyTo?.slice(0, 998) ?? null,
    folder: parsed.input.folder,
    from: parsed.input.from,
    subject: parsed.input.subject,
    snippet: parsed.snippet,
    language: analysis.language,
    receivedAt: parsed.receivedAt,
    category: analysis.category,
    confidence: analysis.confidence,
    extracted: analysis.extracted,
    applicationId: application?.id ?? null,
    linkStrength: application === null ? "none" : analysis.link.linkStrength,
    suggestedStatus: analysis.decision.suggestedStatus,
    appliedEventId: null,
    reviewState: analysis.decision.reviewState,
    reviewedAt: null,
    bodyText: parsed.input.bodyText,
    bodyPurgeAt: mailBodyPurgeAt({
      receivedAt: parsed.receivedAt,
      retentionDays: context.retentionDays,
      application,
    }),
    interviewSuggestion: interviewSuggestionFromMail({
      category: analysis.category,
      subject: parsed.input.subject,
      bodyText: parsed.input.bodyText,
      calendars: parsed.calendars,
      receivedAt: parsed.receivedAt,
      userTimeZone: context.timeZone,
      extracted: analysis.extracted,
    }),
    createdAt: now,
    updatedAt: now,
  };

  counts.jobMessages += 1;
  if (analysis.category === "interview_invite") counts.interviewInvites += 1;
  if (analysis.category === "job_alert") counts.jobAlerts += 1;
  if (analysis.decision.suggestedStatus !== null) {
    counts.applicationKeys.add(
      application?.id ??
        `${analysis.extracted.company ?? parsed.input.from.address}|${analysis.extracted.role ?? ""}`.toLowerCase(),
    );
  }

  const messageRef = db.doc(firestorePaths.mailMessage(context.uid, key));
  const strong = analysis.link.linkStrength === "thread" || analysis.link.linkStrength === "ats_company_role";
  if (application === null || !strong) {
    await messageRef.create(converters.mailMessage.toFirestore(message));
    if (message.reviewState === "pending") counts.pendingReview += 1;
    if (analysis.category === "job_alert") await importAlertPostings(context, parsed, now);
    return;
  }

  // Strongly linked: record the employer signal, remember the thread, and apply the change when
  // the decision allows it, all in one transaction against the current application.
  const applied = await db.runTransaction(async (tx) => {
    const appRef = db.doc(firestorePaths.application(context.uid, application.id));
    const snapshot = await tx.get(appRef);
    if (!snapshot.exists) {
      tx.create(
        messageRef,
        converters.mailMessage.toFirestore({
          ...message,
          applicationId: null,
          linkStrength: "none",
          reviewState: "pending",
        }),
      );
      return { applied: false, current: null };
    }
    const current = converters.application.fromSnapshot(snapshot);
    const eventsRef = db.collection(firestorePaths.applicationEvents(context.uid));
    const patch: Partial<Application> = { updatedAt: now };

    let appliedEventId: string | null = null;
    let reviewState = message.reviewState;
    if (
      analysis.decision.autoApply &&
      analysis.decision.suggestedStatus !== null &&
      current.status === application.status
    ) {
      const result = transition({
        application: current,
        to: analysis.decision.suggestedStatus,
        actor: analysis.actor,
        at: now,
        confidence: analysis.confidence,
        evidence: { mailMessageId: key, reason: analysis.reason },
        ...(message.subject === "" ? {} : { text: message.subject.slice(0, 5_000) }),
      });
      const eventRef = eventsRef.doc();
      tx.create(eventRef, converters.applicationEvent.toFirestore({ id: eventRef.id, ...result.event }));
      Object.assign(patch, result.applicationPatch);
      appliedEventId = eventRef.id;
      reviewState = "auto_applied";
    } else {
      if (analysis.decision.autoApply) reviewState = "pending";
      const eventRef = eventsRef.doc();
      const event: ApplicationEvent = {
        id: eventRef.id,
        applicationId: current.id,
        type: "mail_received",
        fromStatus: null,
        toStatus: null,
        actor: analysis.actor,
        confidence: analysis.confidence,
        evidence: { mailMessageId: key, reason: analysis.reason },
        text: message.subject.slice(0, 5_000) || null,
        revertsEventId: null,
        occurredAt: parsed.receivedAt,
        createdAt: now,
      };
      tx.create(eventRef, converters.applicationEvent.toFirestore(event));
    }
    const threadId = message.providerThreadId;
    if (
      threadId !== null &&
      THREAD_PROVIDERS.includes(context.account.provider) &&
      current.threadRefs.length < 20 &&
      !current.threadRefs.some((ref) => ref.threadId === threadId && ref.accountId === context.account.id)
    ) {
      patch.threadRefs = [
        ...current.threadRefs,
        {
          accountId: context.account.id,
          provider: context.account.provider,
          threadId,
          rfc822MessageId: null,
        },
      ];
    }
    tx.update(appRef, converters.application.toFirestoreUpdate(patch));
    const status = patch.status ?? current.status;
    const statusChangedAt = patch.statusChangedAt ?? current.statusChangedAt;
    tx.create(
      messageRef,
      converters.mailMessage.toFirestore({
        ...message,
        appliedEventId,
        reviewState,
        bodyPurgeAt: mailBodyPurgeAt({
          receivedAt: parsed.receivedAt,
          retentionDays: context.retentionDays,
          application: { status, statusChangedAt },
        }),
      }),
    );
    return { applied: appliedEventId !== null, current: { ...current, ...patch } as Application };
  });
  if (applied.current !== null) context.applications.set(applied.current.id, applied.current);
  if (applied.applied) counts.autoApplied += 1;
  else if (message.reviewState === "pending") counts.pendingReview += 1;
}

/** Postings of a job alert into Jobs; a failure is logged and never loses the message. */
async function importAlertPostings(context: PipelineContext, parsed: ParsedMail, now: Date): Promise<void> {
  const postings = parseJobAlert({
    fromAddress: parsed.input.from.address,
    subject: parsed.input.subject,
    text: parsed.input.bodyText,
    html: parsed.html,
    receivedAt: parsed.receivedAt,
  });
  try {
    const result = await upsertAlertPostings(context.uid, postings, now);
    logger.info("mail_alert_postings", { found: postings.length, ...result });
  } catch (error) {
    logger.warn("mail_alert_postings_failed", { name: error instanceof Error ? error.name : typeof error });
  }
}

/** Deletes `serverOnly` dedupe hashes of an account (disconnect). */
export async function deleteSeenHashes(uid: string, accountId: string): Promise<void> {
  const db = getFirestore();
  for (;;) {
    const page = await db
      .collection(serverOnlyPaths.mailSeenCollection(uid))
      .where("accountId", "==", accountId)
      .limit(400)
      .get();
    if (page.empty) return;
    const batch = db.batch();
    for (const doc of page.docs) batch.delete(doc.ref);
    await batch.commit();
  }
}
