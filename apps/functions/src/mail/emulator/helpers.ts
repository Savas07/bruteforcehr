// Seed data and emulator helpers shared by the mail emulator tests.
import { firestorePaths } from "@bfhr/api";
import {
  type Application,
  type ApplicationEvent,
  DEFAULT_PROFILE_SETTINGS,
  type MailAccount,
  type MailMessage,
  type ProfileSettings,
} from "@bfhr/core";
import { getFirestore } from "firebase-admin/firestore";
import { converters } from "../../converters";
import { saveMailSecret, secretRefOf } from "../accounts";
import type { TestMailServers } from "../providers/test-servers";
import type { SyncEnqueue, SyncTaskData } from "../sync";

/** Deletes every document in the Firestore emulator. */
export async function clearFirestore(): Promise<void> {
  const host = process.env["FIRESTORE_EMULATOR_HOST"];
  const project = process.env["GCLOUD_PROJECT"];
  const response = await fetch(
    `http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`,
    {
      method: "DELETE",
    },
  );
  if (!response.ok) throw new Error(`clearing the Firestore emulator failed: ${response.status}`);
}

/** `users/{uid}` with AI off (rules-only classification, no network). */
export async function seedProfile(uid: string, settings: Partial<ProfileSettings> = {}): Promise<void> {
  await getFirestore()
    .doc(firestorePaths.user(uid))
    .set({
      fullName: "Deniz Arslan",
      email: "deniz@mail.example",
      timezone: "Europe/Istanbul",
      aiEnabled: false,
      settings: { ...DEFAULT_PROFILE_SETTINGS, aiMailTextAllowed: false, ...settings },
    });
}

export function application(
  input: Pick<Application, "id" | "company" | "role"> & Partial<Application>,
): Application {
  const at = new Date(Date.now() - 14 * 86_400_000);
  return {
    jobId: null,
    companyDomain: null,
    location: null,
    status: "applied",
    statusChangedAt: at,
    channel: null,
    source: null,
    appliedAt: input.status === "preparing" || input.status === "saved" ? null : at,
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
    createdAt: at,
    updatedAt: at,
    ...input,
  };
}

export async function seedApplication(uid: string, app: Application): Promise<void> {
  await getFirestore()
    .doc(firestorePaths.application(uid, app.id))
    .set(converters.application.toFirestore(app));
}

export function mailMessage(
  input: Pick<MailMessage, "id" | "category"> & Partial<MailMessage>,
  accountId = "acc-imap",
): MailMessage {
  const receivedAt = new Date(Date.now() - 2 * 86_400_000);
  return {
    accountId,
    providerMessageId: `INBOX:1:${input.id}`,
    providerThreadId: null,
    rfc822MessageId: `<${input.id}@hooli.example>`,
    inReplyTo: null,
    folder: "inbox",
    from: { name: "Hooli Talent", address: "talent@hooli.example" },
    subject: "About your application",
    snippet: "Hi Deniz,",
    language: "en",
    receivedAt,
    confidence: 0.75,
    extracted: {
      company: "Hooli",
      role: null,
      contactName: null,
      contactEmail: null,
      dates: [],
      meetingUrls: [],
    },
    applicationId: null,
    linkStrength: "none",
    suggestedStatus: null,
    appliedEventId: null,
    reviewState: "pending",
    reviewedAt: null,
    bodyText: "Hi Deniz, …",
    bodyPurgeAt: null,
    interviewSuggestion: null,
    createdAt: receivedAt,
    updatedAt: receivedAt,
    ...input,
  };
}

export async function seedMessage(uid: string, message: MailMessage): Promise<void> {
  await getFirestore()
    .doc(firestorePaths.mailMessage(uid, message.id))
    .set(converters.mailMessage.toFirestore(message));
}

export async function readApplication(uid: string, id: string): Promise<Application> {
  return converters.application.fromSnapshot(
    await getFirestore().doc(firestorePaths.application(uid, id)).get(),
  );
}

export async function readAccount(uid: string, id: string): Promise<MailAccount> {
  return converters.mailAccount.fromSnapshot(
    await getFirestore().doc(firestorePaths.mailAccount(uid, id)).get(),
  );
}

export async function listMessages(uid: string): Promise<MailMessage[]> {
  const snapshot = await getFirestore().collection(firestorePaths.mailMessages(uid)).get();
  return snapshot.docs.map((doc) => converters.mailMessage.fromSnapshot(doc));
}

export async function listEvents(uid: string, applicationId?: string): Promise<ApplicationEvent[]> {
  const snapshot = await getFirestore().collection(firestorePaths.applicationEvents(uid)).get();
  return snapshot.docs
    .map((doc) => converters.applicationEvent.fromSnapshot(doc))
    .filter((event) => applicationId === undefined || event.applicationId === applicationId);
}

/** An IMAP account on the in-process servers, with its credentials encrypted under serverOnly. */
export async function seedImapAccount(
  uid: string,
  accountId: string,
  servers: TestMailServers,
  options: { password?: string; account?: Partial<MailAccount> } = {},
): Promise<MailAccount> {
  const now = new Date();
  const { credentials } = servers;
  const account: MailAccount = {
    id: accountId,
    provider: "imap",
    address: credentials.username,
    displayName: "Test mail",
    status: "connected",
    syncCursor: null,
    secretRef: secretRefOf(uid, accountId),
    scopes: [],
    canSend: true,
    lastSyncedAt: null,
    lastError: null,
    server: {
      preset: "other",
      username: credentials.username,
      imap: credentials.imap,
      smtp: credentials.smtp,
    },
    backfill: null,
    connectedAt: now,
    createdAt: now,
    updatedAt: now,
    ...options.account,
  };
  await getFirestore()
    .doc(firestorePaths.mailAccount(uid, accountId))
    .set(converters.mailAccount.toFirestore(account));
  await saveMailSecret(uid, accountId, {
    kind: "imap",
    username: credentials.username,
    password: options.password ?? credentials.password,
    imap: credentials.imap,
    smtp: credentials.smtp,
    smtpSavesSent: credentials.smtpSavesSent,
    smtpUsername: credentials.smtpUsername,
  });
  return account;
}

/** A `SyncEnqueue` that records the tasks instead of calling Cloud Tasks. */
export type RecordingSyncEnqueue = SyncEnqueue & { calls: SyncTaskData[] };

export function recordingSyncEnqueue(): RecordingSyncEnqueue {
  const calls: SyncTaskData[] = [];
  const enqueue = async (data: SyncTaskData) => {
    calls.push(data);
  };
  return Object.assign(enqueue, { calls });
}
