// Live check of the iOS Mail tab (apps/ios/scripts/mail-live-check.sh): seeds a throwaway user's
// mail with the Admin SDK, then reports what the app and the deployed `mailMessageReviewed`
// trigger made of it. No mailbox, nothing is sent.
//
//   gcloud auth application-default login   # once; the owner account
//   pnpm --filter @bfhr/functions exec tsx scripts/live-ios-mail.ts seed <uid> <email>
//   pnpm --filter @bfhr/functions exec tsx scripts/live-ios-mail.ts report <uid>
// First: initializes the Admin app before src/callable.ts would (see live-app.ts).
import "./live-app";
import { readFileSync } from "node:fs";
import { firestorePaths } from "@bfhr/api";
import {
  type Application,
  type ApplicationEvent,
  DEFAULT_PROFILE_SETTINGS,
  type MailAccount,
  type MailMessage,
  type Profile,
} from "@bfhr/core";
import { getFirestore } from "firebase-admin/firestore";
import { adminConverters as converters } from "../src/converters";

const db = getFirestore();
const [command, uid, email] = process.argv.slice(2);
if ((command !== "seed" && command !== "report") || uid === undefined) {
  console.error("usage: live-ios-mail.ts seed <uid> <email> | report <uid>");
  process.exit(64);
}

const now = new Date();
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

function application(id: string, company: string, role: string, status: Application["status"], since: Date): Application {
  return {
    id,
    jobId: null,
    company,
    companyDomain: `${company.toLowerCase().replace(/\W+/gu, "")}.example`,
    role,
    location: "Berlin",
    status,
    statusChangedAt: since,
    channel: "external_link",
    source: "manual",
    appliedAt: hoursAgo(24 * 10),
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
    createdAt: hoursAgo(24 * 10),
    updatedAt: since,
  };
}

function message(input: Pick<MailMessage, "id" | "category" | "subject" | "from" | "reviewState"> & Partial<MailMessage>): MailMessage {
  const receivedAt = input.receivedAt ?? hoursAgo(2);
  return {
    accountId: "acc-live",
    providerMessageId: `live-${input.id}`,
    providerThreadId: null,
    rfc822MessageId: null,
    inReplyTo: null,
    folder: "inbox",
    snippet: input.subject,
    language: "en",
    receivedAt,
    confidence: 0.82,
    extracted: { company: null, role: null, contactName: null, contactEmail: null, dates: [], meetingUrls: [] },
    applicationId: null,
    linkStrength: "company_domain",
    suggestedStatus: null,
    appliedEventId: null,
    reviewedAt: null,
    bodyText: null,
    bodyPurgeAt: null,
    interviewSuggestion: null,
    createdAt: receivedAt,
    updatedAt: receivedAt,
    ...input,
  };
}

async function seed(uid: string, address: string): Promise<void> {
  const fixtures = JSON.parse(
    readFileSync(new URL("../../../packages/fixtures/conformance/empty.json", import.meta.url), "utf8"),
  ) as { profile: Profile & { createdAt: string; updatedAt: string; onboardingCompletedAt: string | null } };
  const profile: Profile = {
    ...fixtures.profile,
    id: uid,
    email: address,
    timezone: "Europe/Berlin",
    uiLanguage: "en",
    aiEnabled: true,
    settings: { ...DEFAULT_PROFILE_SETTINGS, quietHours: null, notifications: null },
    onboardingCompletedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const account: MailAccount = {
    id: "acc-live",
    provider: "imap",
    address: `inbox-${uid.slice(0, 6).toLowerCase()}@icloud.com`,
    displayName: "iCloud Mail",
    status: "connected",
    syncCursor: null,
    secretRef: `mail/users/${uid}/mailTokens/acc-live`,
    scopes: [],
    canSend: false,
    lastSyncedAt: hoursAgo(0.1),
    lastError: null,
    server: {
      preset: "icloud",
      username: "inbox",
      imap: { host: "imap.mail.me.com", port: 993, security: "tls" },
      smtp: null,
    },
    backfill: null,
    connectedAt: hoursAgo(24),
    createdAt: hoursAgo(24),
    updatedAt: hoursAgo(0.1),
  };
  const acme = application("app-live-acme", "Acme Live", "iOS Engineer", "applied", hoursAgo(24 * 10));
  const globex = application("app-live-globex", "Globex Live", "Product Designer", "screening", hoursAgo(3));
  // The automatic move the classifier made from Globex's assessment email (Undo target).
  const autoEvent: ApplicationEvent = {
    id: "evt-live-globex-auto",
    applicationId: globex.id,
    type: "status_changed",
    fromStatus: "applied",
    toStatus: "screening",
    actor: "ai",
    confidence: 0.96,
    evidence: { mailMessageId: "mail-live-globex", reason: "An assessment from globexlive.example" },
    text: null,
    revertsEventId: null,
    occurredAt: hoursAgo(3),
    createdAt: hoursAgo(3),
  };
  const invite = message({
    id: "mail-live-acme",
    category: "interview_invite",
    subject: "Interview invitation: iOS Engineer",
    from: { name: "Lena Vogel", address: "lena@acmelive.example" },
    reviewState: "pending",
    applicationId: acme.id,
    suggestedStatus: "interviewing",
    confidence: 0.74,
    extracted: { company: "Acme Live", role: "iOS Engineer", contactName: "Lena Vogel", contactEmail: "lena@acmelive.example", dates: [], meetingUrls: [] },
    interviewSuggestion: {
      title: "Interview: iOS Engineer",
      startsAt: new Date(now.getTime() + 2 * 86_400_000),
      durationMinutes: 45,
      timezone: "Europe/Berlin",
      location: null,
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      source: "text",
      interviewId: null,
    },
  });
  const assessment = message({
    id: "mail-live-globex",
    category: "assessment",
    subject: "Your design exercise",
    from: { name: "Globex Talent", address: "talent@globexlive.example" },
    reviewState: "auto_applied",
    applicationId: globex.id,
    linkStrength: "ats_company_role",
    suggestedStatus: "screening",
    appliedEventId: autoEvent.id,
    confidence: 0.96,
    receivedAt: hoursAgo(3),
  });
  const batch = db.batch();
  batch.set(db.doc(firestorePaths.user(uid)), converters.profile.toFirestore(profile));
  batch.set(db.doc(firestorePaths.mailAccount(uid, account.id)), converters.mailAccount.toFirestore(account));
  for (const app of [acme, globex])
    batch.set(db.doc(firestorePaths.application(uid, app.id)), converters.application.toFirestore(app));
  batch.set(db.collection(firestorePaths.applicationEvents(uid)).doc(autoEvent.id), converters.applicationEvent.toFirestore(autoEvent));
  for (const mail of [invite, assessment])
    batch.set(db.collection(firestorePaths.mailMessages(uid)).doc(mail.id), converters.mailMessage.toFirestore(mail));
  await batch.commit();
  console.log(`seeded users/${uid}: profile, mail account, 2 applications, 1 automatic event, 2 mail messages`);
}

async function report(uid: string): Promise<void> {
  const user = await db.doc(firestorePaths.user(uid)).get();
  console.log("profile.settings.notifications", JSON.stringify(user.get("settings.notifications") ?? null));
  for (const doc of (await db.collection(firestorePaths.applications(uid)).get()).docs) {
    const app = converters.application.fromSnapshot(doc);
    console.log(`application ${app.id}: ${app.company} · ${app.status}`);
  }
  const events = (await db.collection(firestorePaths.applicationEvents(uid)).get()).docs
    .map((doc) => converters.applicationEvent.fromSnapshot(doc))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const event of events)
    console.log(
      `event ${event.applicationId} ${event.type} ${event.fromStatus ?? "-"}→${event.toStatus ?? "-"} actor=${event.actor} reverts=${event.revertsEventId ?? "-"} mail=${event.evidence?.mailMessageId ?? "-"}`,
    );
  for (const doc of (await db.collection(firestorePaths.mailMessages(uid)).get()).docs) {
    const mail = converters.mailMessage.fromSnapshot(doc);
    console.log(
      `mail ${mail.id}: ${mail.reviewState} ${mail.category} app=${mail.applicationId ?? "-"} appliedEvent=${mail.appliedEventId ?? "-"} interview=${mail.interviewSuggestion?.interviewId ?? "-"}`,
    );
  }
  for (const doc of (await db.collection(firestorePaths.interviews(uid)).get()).docs)
    console.log(`interview ${doc.id}: ${doc.get("title")} ${doc.get("applicationId")}`);
}

if (command === "seed") await seed(uid, email ?? `${uid}@example.com`);
else await report(uid);
