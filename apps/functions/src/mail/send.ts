// Email apply with a real 10-second undo window (BRIEF §4.4, decisions.md D11/F6, flows.md §2):
// `mailSend` stores the message under serverOnly, marks `applications/{id}.emailSend` scheduled and
// enqueues the dispatch at server acknowledgement + 10 s; `mailSendCancel` stops it inside the
// window, `mailSendNow` skips the rest. On dispatch the server sends through the account's provider,
// pins the documents and records the move to applied as the user's action.
import { randomBytes } from "node:crypto";
import { firestorePaths, serverOnlyPaths, storagePaths } from "@bfhr/api";
import {
  type Application,
  type ApplicationEvent,
  DEFAULT_PROFILE_SETTINGS,
  MAIL_DAILY_SEND_CAP_MAX,
  type EmailSend,
  MAIL_SEND_MAX_ATTACHMENT_BYTES,
  MAIL_SEND_UNDO_SECONDS,
  type MailAddress,
  type MailSendErrorReason,
  type MailSendCancelResponse,
  MailSendControlRequestSchema,
  type MailSendNowResponse,
  type MailSendPins,
  MailSendRequestSchema,
  type MailSendRequestParsed,
  type MailSendResponse,
  MailSendResponseSchema,
  statusRank,
  transition,
} from "@bfhr/core";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { z } from "zod";
import { verifiedUid } from "../callable";
import { adminConverters as converters } from "../converters";
import { openAdapter } from "./accounts";
import { MAIL_SECRETS } from "./config";
import { MailCallableError } from "./errors";
import { graphSendOverLimit } from "./providers/graph";
import { MailAuthError, MailScopeError, MailTooLargeError, type OutgoingMail } from "./providers/types";

const DISPATCH_FUNCTION = "mailSendDispatch";
/** Outbox payloads that never dispatched are removed by TTL after this. */
const OUTBOX_TTL_DAYS = 7;

const ResolvedAttachmentSchema = z.object({
  storagePath: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
});
const AddressSchema = z.object({ name: z.string().nullable(), address: z.string() });
const OutboxSchema = z.object({
  state: z.enum(["scheduled", "sending", "sent", "cancelled", "failed"]),
  applicationId: z.string(),
  accountId: z.string(),
  to: z.array(AddressSchema),
  cc: z.array(AddressSchema),
  subject: z.string(),
  bodyText: z.string(),
  attachments: z.array(ResolvedAttachmentSchema),
  pins: z.object({
    cvId: z.string().nullable(),
    cvRevisionId: z.string().nullable(),
    cvFileId: z.string().nullable(),
    coverLetterId: z.string().nullable(),
    coverLetterFileId: z.string().nullable(),
  }),
  replyTo: z
    .object({
      providerMessageId: z.string(),
      providerThreadId: z.string().nullable(),
      rfc822MessageId: z.string().nullable(),
      references: z.array(z.string()),
    })
    .nullable(),
  day: z.string(),
});
type Outbox = z.infer<typeof OutboxSchema>;

const CONTENT_TYPE_BY_KIND: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const utcDay = (date: Date) => date.toISOString().slice(0, 10);

function sendError(
  reason: MailSendErrorReason,
  message: string,
  extra: { limitBytes?: number } = {},
): MailCallableError {
  return new MailCallableError(reasonCode(reason), reason, message, extra);
}

/** `attachments_too_large` copy; the limit is rounded down to 0.1 MB so it never overstates. */
function tooLargeMessage(limitBytes: number): string {
  return `Attachments can be at most ${Math.floor(limitBytes / 100_000) / 10} MB in total from this account.`;
}

function reasonCode(reason: MailSendErrorReason) {
  switch (reason) {
    case "account_not_found":
    case "application_not_found":
    case "job_not_found":
    case "attachment_not_found":
      return "not-found" as const;
    case "daily_send_cap":
      return "resource-exhausted" as const;
    case "attachments_too_large":
      return "invalid-argument" as const;
    default:
      return "failed-precondition" as const;
  }
}

interface DispatchData {
  uid: string;
  sendId: string;
}

/** The `mailSendDispatch` task queue; the emulator tests pass an in-memory one. */
export interface DispatchQueue {
  enqueue(data: DispatchData, options: { scheduleTime: Date; id: string }): Promise<void>;
  delete(id: string): Promise<void>;
}

const dispatchQueueName = `locations/europe-west1/functions/${DISPATCH_FUNCTION}`;

export const cloudDispatchQueue: DispatchQueue = {
  async enqueue(data, options) {
    await getFunctions().taskQueue<DispatchData>(dispatchQueueName).enqueue(data, options);
  },
  async delete(id) {
    await getFunctions().taskQueue(dispatchQueueName).delete(id);
  },
};

export const mailSend = onCall(
  { secrets: MAIL_SECRETS, timeoutSeconds: 60 },
  async (request): Promise<MailSendResponse> => {
    const uid = verifiedUid(request);
    const parsed = MailSendRequestSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError(
        "invalid-argument",
        "Expected { accountId, applicationId, jobId, to, subject, bodyText, attachments, pins }.",
      );
    return scheduleSend(uid, parsed.data);
  },
);

/** Validates and stores the message, marks the application scheduled and enqueues the dispatch. */
export async function scheduleSend(
  uid: string,
  input: MailSendRequestParsed,
  queue: DispatchQueue = cloudDispatchQueue,
): Promise<MailSendResponse> {
  const db = getFirestore();
  const accountSnapshot = await db.doc(firestorePaths.mailAccount(uid, input.accountId)).get();
  if (!accountSnapshot.exists) throw sendError("account_not_found", "This email account was not found.");
  const account = converters.mailAccount.fromSnapshot(accountSnapshot);
  if (account.status === "needs_reauth")
    throw sendError("needs_reauth", "Reconnect this account to send from it.");
  if (!account.canSend || (account.status !== "connected" && account.status !== "syncing")) {
    throw sendError("cannot_send", "This account can't send email yet.");
  }

  // Attachments: rendered CV / cover letter documents, or files uploaded for this email.
  const attachments: Outbox["attachments"] = [];
  const renderedIds = new Set<string>();
  for (const attachment of input.attachments) {
    if (attachment.kind === "rendered") {
      const snapshot = await db.doc(firestorePaths.renderedFile(uid, attachment.renderedFileId)).get();
      if (!snapshot.exists) throw sendError("attachment_not_found", "An attached file was not found.");
      const file = converters.renderedFile.fromSnapshot(snapshot);
      // The document is client-written: only its own rendered object may be attached, and the
      // size comes from Storage, not from the document.
      const storagePath = storagePaths.renderedFile(uid, file.id);
      if (file.storagePath !== storagePath)
        throw sendError("attachment_not_found", "An attached file was not found.");
      const object = getStorage().bucket().file(storagePath);
      const [exists] = await object.exists();
      if (!exists) throw sendError("attachment_not_found", "An attached file was not found.");
      const [metadata] = await object.getMetadata();
      renderedIds.add(file.id);
      attachments.push({
        storagePath,
        fileName: file.fileName,
        contentType: CONTENT_TYPE_BY_KIND[file.kind] ?? "application/octet-stream",
        sizeBytes: Number(metadata.size ?? 0),
      });
    } else {
      if (!attachment.storagePath.startsWith(`users/${uid}/mail-attachments/`))
        throw sendError("attachment_not_found", "An attached file was not found.");
      const [exists] = await getStorage().bucket().file(attachment.storagePath).exists();
      if (!exists) throw sendError("attachment_not_found", "An attached file was not found.");
      const [metadata] = await getStorage().bucket().file(attachment.storagePath).getMetadata();
      attachments.push({
        storagePath: attachment.storagePath,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        sizeBytes: Number(metadata.size ?? 0),
      });
    }
  }
  if (attachments.reduce((sum, file) => sum + file.sizeBytes, 0) > MAIL_SEND_MAX_ATTACHMENT_BYTES) {
    throw sendError("attachments_too_large", tooLargeMessage(MAIL_SEND_MAX_ATTACHMENT_BYTES), {
      limitBytes: MAIL_SEND_MAX_ATTACHMENT_BYTES,
    });
  }
  for (const pinned of [input.pins.cvFileId, input.pins.coverLetterFileId]) {
    if (pinned !== null && !renderedIds.has(pinned))
      throw new HttpsError("invalid-argument", "Pinned files must be attached.");
  }

  let replyTo: Outbox["replyTo"] = null;
  if (input.replyToMailMessageId !== null) {
    const original = await db.doc(firestorePaths.mailMessage(uid, input.replyToMailMessageId)).get();
    if (original.exists && original.get("accountId") === input.accountId) {
      const inReplyTo = original.get("inReplyTo") as string | null;
      replyTo = {
        providerMessageId: original.get("providerMessageId") as string,
        providerThreadId: (original.get("providerThreadId") as string | null) ?? null,
        rfc822MessageId: (original.get("rfc822MessageId") as string | null) ?? null,
        references: inReplyTo === null ? [] : [inReplyTo],
      };
    }
  }

  // Graph takes the whole message in one request of at most about 4 MB (ADR 0012): refuse now
  // rather than fail after the undo window.
  if (account.provider === "microsoft") {
    const limitBytes = graphSendOverLimit({
      from: { name: null, address: account.address },
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      text: input.bodyText,
      replyTo,
      attachments,
    });
    if (limitBytes !== null)
      throw sendError("attachments_too_large", tooLargeMessage(limitBytes), { limitBytes });
  }

  const profile = await db.doc(firestorePaths.user(uid)).get();
  // `settings` is client-written: anything but an integer falls back to the default, and the cap
  // never exceeds MAIL_DAILY_SEND_CAP_MAX.
  const stored: unknown = profile.get("settings.dailySendCap");
  const cap = Math.min(
    Math.max(Number.isInteger(stored) ? (stored as number) : DEFAULT_PROFILE_SETTINGS.dailySendCap, 0),
    MAIL_DAILY_SEND_CAP_MAX,
  );
  const now = new Date();
  const sendAt = new Date(now.getTime() + MAIL_SEND_UNDO_SECONDS * 1000);
  const sendId = randomBytes(12).toString("hex");
  const day = utcDay(now);
  const applications = db.collection(firestorePaths.applications(uid));

  const applicationId = await db.runTransaction(async (tx) => {
    const dayRef = db.doc(serverOnlyPaths.mailSendDay(uid, day));
    const daySnapshot = await tx.get(dayRef);
    const sent = Number(daySnapshot.get("count") ?? 0);
    if (sent >= cap) throw sendError("daily_send_cap", `You've reached today's limit of ${cap} emails.`);

    let application: Application;
    let appRef;
    let created: ApplicationEvent | null = null;
    if (input.applicationId !== null) {
      appRef = applications.doc(input.applicationId);
      const snapshot = await tx.get(appRef);
      if (!snapshot.exists) throw sendError("application_not_found", "This application was not found.");
      application = converters.application.fromSnapshot(snapshot);
      if (application.emailSend?.state === "scheduled" || application.emailSend?.state === "sending") {
        throw sendError("send_in_progress", "An email for this application is already being sent.");
      }
    } else {
      if (input.jobId === null)
        throw new HttpsError("invalid-argument", "applicationId or jobId is required.");
      const jobSnapshot = await tx.get(db.doc(firestorePaths.job(uid, input.jobId)));
      if (!jobSnapshot.exists) throw sendError("job_not_found", "This job was not found.");
      const job = converters.job.fromSnapshot(jobSnapshot);
      appRef = applications.doc();
      application = {
        id: appRef.id,
        jobId: job.id,
        company: job.company,
        companyDomain: job.companyDomain,
        role: job.title,
        location: job.locations[0]?.label ?? null,
        status: "preparing",
        statusChangedAt: now,
        channel: "email",
        source: job.sources[0]?.source ?? null,
        appliedAt: null,
        cvId: null,
        cvRevisionId: null,
        cvFileId: null,
        coverLetterId: null,
        coverLetterFileId: null,
        fromAccountId: null,
        threadRefs: [],
        nextAction: null,
        nextActionAt: null,
        priority: "normal",
        notes: "",
        followUpSnoozedUntil: null,
        followUpDismissedAt: null,
        ghostedSnoozedUntil: null,
        ghostedDismissedAt: null,
        emailSend: null,
        createdAt: now,
        updatedAt: now,
      };
      const eventRef = db.collection(firestorePaths.applicationEvents(uid)).doc();
      created = {
        id: eventRef.id,
        applicationId: appRef.id,
        type: "created",
        fromStatus: null,
        toStatus: "preparing",
        actor: "user",
        confidence: null,
        evidence: null,
        text: null,
        revertsEventId: null,
        occurredAt: now,
        createdAt: now,
      };
    }

    const emailSend: EmailSend = {
      state: "scheduled",
      sendId,
      accountId: account.id,
      to: input.to,
      subject: input.subject,
      sendAt,
      sentAt: null,
      providerMessageId: null,
      threadId: null,
      rfc822MessageId: null,
      error: null,
    };
    const outbox: Outbox = {
      state: "scheduled",
      applicationId: appRef.id,
      accountId: account.id,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      bodyText: input.bodyText,
      attachments,
      pins: input.pins,
      replyTo,
      day,
    };
    tx.set(
      dayRef,
      { count: sent + 1, day, expireAt: Timestamp.fromMillis(now.getTime() + 3 * 86_400_000) },
      { merge: true },
    );
    tx.set(db.doc(serverOnlyPaths.mailOutbox(uid, sendId)), {
      ...outbox,
      expireAt: Timestamp.fromMillis(now.getTime() + OUTBOX_TTL_DAYS * 86_400_000),
    });
    if (created === null) {
      tx.update(appRef, converters.application.toFirestoreUpdate({ emailSend, updatedAt: now }));
    } else {
      tx.set(appRef, converters.application.toFirestore({ ...application, emailSend }));
      const eventRef = db.doc(firestorePaths.applicationEvent(uid, created.id));
      tx.set(eventRef, converters.applicationEvent.toFirestore(created));
    }
    return appRef.id;
  });

  await queue.enqueue({ uid, sendId }, { scheduleTime: sendAt, id: `send-${sendId}` });
  logger.info("mail_send_scheduled", {
    provider: account.provider,
    attachments: attachments.length,
    newApplication: input.applicationId === null,
  });
  return MailSendResponseSchema.parse({ applicationId, sendAt: sendAt.toISOString(), state: "scheduled" });
}

async function loadOutboxByApplication(
  uid: string,
  applicationId: string,
): Promise<{ sendId: string; application: Application }> {
  const snapshot = await getFirestore().doc(firestorePaths.application(uid, applicationId)).get();
  if (!snapshot.exists) throw sendError("application_not_found", "This application was not found.");
  const application = converters.application.fromSnapshot(snapshot);
  if (application.emailSend === null) throw sendError("already_sent", "There's no email waiting to be sent.");
  return { sendId: application.emailSend.sendId, application };
}

export const mailSendCancel = onCall(async (request): Promise<MailSendCancelResponse> => {
  const uid = verifiedUid(request);
  const parsed = MailSendControlRequestSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Expected { applicationId }.");
  return cancelSend(uid, parsed.data.applicationId);
});

/** Cancels a scheduled message inside the undo window. */
export async function cancelSend(
  uid: string,
  applicationId: string,
  queue: DispatchQueue = cloudDispatchQueue,
): Promise<MailSendCancelResponse> {
  const { sendId } = await loadOutboxByApplication(uid, applicationId);
  const db = getFirestore();
  const outboxRef = db.doc(serverOnlyPaths.mailOutbox(uid, sendId));
  const appRef = db.doc(firestorePaths.application(uid, applicationId));
  await db.runTransaction(async (tx) => {
    const [outbox, app] = await Promise.all([tx.get(outboxRef), tx.get(appRef)]);
    if (!outbox.exists || outbox.get("state") !== "scheduled")
      throw sendError("already_sent", "This email is already on its way.");
    const dayRef = db.doc(serverOnlyPaths.mailSendDay(uid, outbox.get("day") as string));
    const day = await tx.get(dayRef);
    const application = converters.application.fromSnapshot(app);
    tx.delete(outboxRef);
    // A cancelled email doesn't count against the daily cap.
    if (day.exists) tx.update(dayRef, { count: Math.max(0, Number(day.get("count") ?? 1) - 1) });
    if (application.emailSend !== null) {
      tx.update(
        appRef,
        converters.application.toFirestoreUpdate({
          emailSend: { ...application.emailSend, state: "cancelled" },
          updatedAt: new Date(),
        }),
      );
    }
  });
  await queue.delete(`send-${sendId}`).catch(() => undefined);
  return { state: "cancelled" };
}

export const mailSendNow = onCall(
  { secrets: MAIL_SECRETS, timeoutSeconds: 120 },
  async (request): Promise<MailSendNowResponse> => {
    const uid = verifiedUid(request);
    const parsed = MailSendControlRequestSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Expected { applicationId }.");
    return sendNow(uid, parsed.data.applicationId);
  },
);

/** Skips the rest of the undo window. */
export async function sendNow(uid: string, applicationId: string): Promise<MailSendNowResponse> {
  const { sendId } = await loadOutboxByApplication(uid, applicationId);
  const state = await dispatch(uid, sendId);
  if (state === null) throw sendError("already_sent", "This email is already on its way.");
  return { state };
}

export const mailSendDispatch = onTaskDispatched<DispatchData>(
  {
    secrets: MAIL_SECRETS,
    timeoutSeconds: 300,
    memory: "512MiB",
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
  },
  async (request) => {
    if (typeof request.data?.uid !== "string" || typeof request.data.sendId !== "string") return;
    await dispatch(request.data.uid, request.data.sendId);
  },
);

/**
 * Claims the scheduled message (scheduled → sending, so a cancel, a retry or "send now" can't send it
 * twice), sends it and records the result. Returns null when it was not scheduled any more.
 */
export async function dispatch(uid: string, sendId: string): Promise<"sent" | "failed" | null> {
  const db = getFirestore();
  const outboxRef = db.doc(serverOnlyPaths.mailOutbox(uid, sendId));
  const claimed = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(outboxRef);
    if (!snapshot.exists || snapshot.get("state") !== "scheduled") return null;
    const outbox = OutboxSchema.parse(snapshot.data());
    const appRef = db.doc(firestorePaths.application(uid, outbox.applicationId));
    const app = await tx.get(appRef);
    tx.update(outboxRef, { state: "sending" });
    if (app.exists) {
      const application = converters.application.fromSnapshot(app);
      if (application.emailSend?.sendId === sendId) {
        tx.update(
          appRef,
          converters.application.toFirestoreUpdate({
            emailSend: { ...application.emailSend, state: "sending" },
            updatedAt: new Date(),
          }),
        );
      }
    }
    return outbox;
  });
  if (claimed === null) return null;

  const accountSnapshot = await db.doc(firestorePaths.mailAccount(uid, claimed.accountId)).get();
  try {
    if (!accountSnapshot.exists) throw new MailAuthError("account removed");
    const account = converters.mailAccount.fromSnapshot(accountSnapshot);
    const bucket = getStorage().bucket();
    const files = await Promise.all(
      claimed.attachments.map(async (attachment) => ({
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        content: (await bucket.file(attachment.storagePath).download())[0],
      })),
    );
    const outgoing: OutgoingMail = {
      from: { name: await senderName(uid), address: account.address },
      to: claimed.to as MailAddress[],
      cc: claimed.cc as MailAddress[],
      subject: claimed.subject,
      text: claimed.bodyText,
      attachments: files,
      replyTo: claimed.replyTo,
    };
    const adapter = await openAdapter(uid, account);
    let sent;
    try {
      sent = await adapter.send(outgoing);
    } finally {
      await adapter.close().catch(() => undefined);
    }
    await recordSent(uid, sendId, claimed, account.provider, sent);
    logger.info("mail_sent", { provider: account.provider, attachments: files.length });
    return "sent";
  } catch (error) {
    const failure =
      error instanceof MailAuthError
        ? { code: "needs_reauth", message: "Reconnect this account, then send again." }
        : error instanceof MailScopeError
          ? { code: "scope_missing", message: "Allow sending for this account, then send again." }
          : error instanceof MailTooLargeError
            ? { code: "attachments_too_large", message: tooLargeMessage(error.limitBytes) }
            : { code: "send_failed", message: "The email couldn't be sent. Nothing was delivered." };
    logger.error("mail_send_failed", {
      code: failure.code,
      name: error instanceof Error ? error.name : typeof error,
    });
    await recordFailed(uid, sendId, claimed, failure);
    if ((failure.code === "needs_reauth" || failure.code === "scope_missing") && accountSnapshot.exists) {
      await accountSnapshot.ref.update({
        status: "needs_reauth",
        lastError: {
          code: failure.code,
          message: "Reconnect this account to keep sending.",
          at: Timestamp.now(),
        },
        updatedAt: Timestamp.now(),
      });
    }
    return "failed";
  }
}

async function senderName(uid: string): Promise<string | null> {
  const profile = await getFirestore().doc(firestorePaths.user(uid)).get();
  const name = profile.get("fullName");
  return typeof name === "string" && name.trim() !== "" ? name.trim() : null;
}

async function recordSent(
  uid: string,
  sendId: string,
  outbox: Outbox,
  provider: "gmail" | "microsoft" | "imap",
  sent: { providerMessageId: string; threadId: string | null; rfc822MessageId: string | null },
): Promise<void> {
  const db = getFirestore();
  const appRef = db.doc(firestorePaths.application(uid, outbox.applicationId));
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(appRef);
    tx.delete(db.doc(serverOnlyPaths.mailOutbox(uid, sendId)));
    if (!snapshot.exists) return;
    const application = converters.application.fromSnapshot(snapshot);
    const now = new Date();
    const events = db.collection(firestorePaths.applicationEvents(uid));
    const patch: Partial<Application> = {
      emailSend: {
        ...(application.emailSend ?? {
          sendId,
          accountId: outbox.accountId,
          to: outbox.to as MailAddress[],
          subject: outbox.subject,
          sendAt: now,
        }),
        state: "sent",
        sentAt: now,
        providerMessageId: sent.providerMessageId.slice(0, 500),
        threadId: sent.threadId?.slice(0, 500) ?? null,
        rfc822MessageId: sent.rfc822MessageId?.slice(0, 998) ?? null,
        error: null,
      },
      channel: application.channel ?? "email",
      fromAccountId: application.fromAccountId ?? outbox.accountId,
      updatedAt: now,
      ...pinPatch(application, outbox.pins),
    };
    if (application.threadRefs.length < 20) {
      patch.threadRefs = [
        ...application.threadRefs,
        {
          accountId: outbox.accountId,
          provider,
          threadId: (sent.threadId ?? sent.rfc822MessageId ?? sent.providerMessageId).slice(0, 500),
          rfc822MessageId: sent.rfc822MessageId?.slice(0, 998) ?? null,
        },
      ];
    }
    const mailSent = events.doc();
    tx.create(
      mailSent,
      converters.applicationEvent.toFirestore({
        id: mailSent.id,
        applicationId: application.id,
        type: "mail_sent",
        fromStatus: null,
        toStatus: null,
        actor: "user",
        confidence: null,
        evidence: null,
        text: outbox.subject.slice(0, 5_000) || null,
        revertsEventId: null,
        occurredAt: now,
        createdAt: now,
      }),
    );
    const rank = statusRank(application.status);
    if (rank !== null && rank < (statusRank("applied") ?? 0)) {
      const result = transition({
        application,
        to: "applied",
        actor: "user",
        at: now,
        text: "Sent by email",
      });
      const moved = events.doc();
      tx.create(moved, converters.applicationEvent.toFirestore({ id: moved.id, ...result.event }));
      Object.assign(patch, result.applicationPatch);
    }
    tx.update(appRef, converters.application.toFirestoreUpdate(patch));
  });
}

/** Pins are write-once after `appliedAt` (ADR 0002): only empty pins are filled. */
function pinPatch(application: Application, pins: MailSendPins): Partial<Application> {
  const patch: Partial<Application> = {};
  if (application.cvId === null && pins.cvId !== null) patch.cvId = pins.cvId;
  if (application.cvRevisionId === null && pins.cvRevisionId !== null) patch.cvRevisionId = pins.cvRevisionId;
  if (application.cvFileId === null && pins.cvFileId !== null) patch.cvFileId = pins.cvFileId;
  if (application.coverLetterId === null && pins.coverLetterId !== null)
    patch.coverLetterId = pins.coverLetterId;
  if (application.coverLetterFileId === null && pins.coverLetterFileId !== null)
    patch.coverLetterFileId = pins.coverLetterFileId;
  return patch;
}

async function recordFailed(
  uid: string,
  sendId: string,
  outbox: Outbox,
  error: { code: string; message: string },
): Promise<void> {
  const db = getFirestore();
  const appRef = db.doc(firestorePaths.application(uid, outbox.applicationId));
  const dayRef = db.doc(serverOnlyPaths.mailSendDay(uid, outbox.day));
  await db.runTransaction(async (tx) => {
    const [snapshot, day] = await Promise.all([tx.get(appRef), tx.get(dayRef)]);
    tx.delete(db.doc(serverOnlyPaths.mailOutbox(uid, sendId)));
    // A failed send doesn't count against the daily cap.
    if (day.exists) tx.update(dayRef, { count: Math.max(0, Number(day.get("count") ?? 1) - 1) });
    if (!snapshot.exists) return;
    const application = converters.application.fromSnapshot(snapshot);
    if (application.emailSend?.sendId !== sendId) return;
    tx.update(
      appRef,
      converters.application.toFirestoreUpdate({
        emailSend: { ...application.emailSend, state: "failed", error },
        updatedAt: new Date(),
      }),
    );
  });
}
