// Live check of the deployed mail callables (docs/adr/0012-mail-sync.md, docs/runbooks/mail.md
// "Live check"). Creates a throwaway user, signs it in with a real email link (the Admin SDK
// generates the link instead of mailing it, so the ID token is email-verified like in the apps),
// checks the connect and send error paths over HTTPS like the apps do, then seeds an IMAP account
// and a job with the Admin SDK and runs email apply → cancel inside the 10-second undo window.
// Nothing is ever sent and no real mailbox is needed. Deletes the user and all its data at the end.
//
//   gcloud auth application-default login   # once; the owner account
//   pnpm --filter @bfhr/functions smoke:mail
import { setTimeout as sleep } from "node:timers/promises";
import { createConverters, firestorePaths, serverOnlyPaths, userDataRoots, userStoragePrefix } from "@bfhr/api";
import type { Job, MailAccount } from "@bfhr/core";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const PROJECT = "bruteforcehr";
const REGION = "europe-west1";
/** Web API key (public client config, apps/desktop/src/lib/firebase.ts). */
const WEB_API_KEY = "AIzaSyBlJk949tJEB9HUmmRGoE8EsqQ2tEA41ag";

initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.firebasestorage.app` });
const converters = createConverters<Timestamp>({
  fromDate: (date) => Timestamp.fromDate(date),
  toDate: (value) => value.toDate(),
  isTimestamp: (value): value is Timestamp => value instanceof Timestamp,
});
const db = getFirestore();

interface CallableReply {
  result?: unknown;
  error?: { status: string; message: string; details?: { reason?: string; field?: string } };
}

async function call(name: string, idToken: string, data: unknown): Promise<CallableReply> {
  const response = await fetch(`https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  return (await response.json()) as CallableReply;
}

const failures: string[] = [];
function check(label: string, ok: boolean, observed: unknown): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}\n      ${JSON.stringify(observed)}`);
  if (!ok) failures.push(label);
}

/** Expects a callable error with this status and `details.reason` (and `details.field`). */
function expectError(label: string, reply: CallableReply, status: string, reason: string, field?: string): void {
  const details = reply.error?.details;
  check(
    label,
    reply.error?.status === status &&
      details?.reason === reason &&
      (field === undefined || details.field === field),
    reply.error ?? reply,
  );
}

const email = `mail-smoke-${Date.now()}@example.com`;
const user = await getAuth().createUser({ email });
const uid = user.uid;
console.log(`created test user ${uid} <${email}>`);
try {
  const link = await getAuth().generateSignInWithEmailLink(email, {
    url: `https://${PROJECT}.web.app/auth/finish`,
    handleCodeInApp: true,
  });
  const oobCode = new URL(link).searchParams.get("oobCode");
  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${WEB_API_KEY}`,
    {
      method: "POST",
      // The browser key only accepts the app's referrers (ADR 0008); this is the desktop webview's.
      headers: { "Content-Type": "application/json", Referer: "tauri://localhost/" },
      body: JSON.stringify({ email, oobCode }),
    },
  );
  const signedIn = (await signIn.json()) as { idToken?: string; error?: unknown };
  if (signedIn.idToken === undefined)
    throw new Error(`email-link sign-in failed: ${JSON.stringify(signedIn.error)}`);
  const idToken = signedIn.idToken;
  console.log("signed in with an email link\n");

  // 1. Connect error paths.
  expectError(
    "mailConnectStart google → provider_not_configured (no OAuth client yet)",
    await call("mailConnectStart", idToken, { provider: "google" }),
    "FAILED_PRECONDITION",
    "provider_not_configured",
  );
  expectError(
    "mailConnectImap icloud, wrong app password → auth_failed on password",
    await call("mailConnectImap", idToken, {
      address: `bfhr-smoke-${Date.now()}@icloud.com`,
      password: "abcd-efgh-ijkl-mnop",
      preset: "icloud",
    }),
    "PERMISSION_DENIED",
    "auth_failed",
    "password",
  );
  expectError(
    "mailConnectImap outlook preset → oauth_required",
    await call("mailConnectImap", idToken, {
      address: "someone@outlook.com",
      password: "irrelevant",
      preset: "outlook",
    }),
    "FAILED_PRECONDITION",
    "oauth_required",
  );
  expectError(
    "mailConnectImap imap.host 169.254.169.254 → host_unreachable on imapHost (metadata server refused)",
    await call("mailConnectImap", idToken, {
      address: "someone@example.com",
      password: "irrelevant",
      preset: "other",
      imap: { host: "169.254.169.254", port: 993, security: "tls" },
    }),
    "UNAVAILABLE",
    "host_unreachable",
    "imapHost",
  );

  // 2. Send error path.
  const sendRequest = {
    applicationId: null,
    to: [{ name: "Hiring Team", address: "jobs@example.com" }],
    subject: "Application: Backend Engineer",
    bodyText: "Hello,\n\nPlease find my application attached.\n",
    attachments: [],
    pins: { cvId: null, cvRevisionId: null, cvFileId: null, coverLetterId: null, coverLetterFileId: null },
  };
  expectError(
    "mailSend with a nonexistent accountId → account_not_found",
    await call("mailSend", idToken, { ...sendRequest, accountId: "doesNotExist", jobId: "doesNotExist" }),
    "NOT_FOUND",
    "account_not_found",
  );

  // 3. Seed a connected IMAP account (no credentials: nothing can be sent) and a job.
  const now = new Date();
  const accountId = "smokeImap";
  const account: MailAccount = {
    id: accountId,
    provider: "imap",
    address: email,
    displayName: null,
    status: "connected",
    syncCursor: null,
    secretRef: serverOnlyPaths.mailToken(uid, accountId).slice("serverOnly/".length),
    scopes: [],
    canSend: true,
    lastSyncedAt: null,
    lastError: null,
    server: {
      preset: "other",
      username: email,
      imap: { host: "imap.example.com", port: 993, security: "tls" },
      smtp: { host: "smtp.example.com", port: 465, security: "tls" },
    },
    backfill: null,
    connectedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await db.doc(firestorePaths.mailAccount(uid, accountId)).set(converters.mailAccount.toFirestore(account));
  const jobId = "smokeJob";
  const source = {
    source: "manual",
    sourceId: null,
    url: "https://example.com/jobs/backend-engineer",
    applyUrl: null,
    applyEmail: "jobs@example.com",
    isDirectFromEmployer: true,
    title: "Backend Engineer",
    locationText: "Berlin",
    salary: null,
    postedAt: null,
    firstSeenAt: now,
    lastSeenAt: now,
  } as const;
  const job: Job = {
    id: jobId,
    sources: [source],
    sourceKeys: [`manual:${source.url}`],
    applyUrl: null,
    applyEmail: "jobs@example.com",
    company: "Example GmbH",
    companyDomain: "example.com",
    title: "Backend Engineer",
    locations: [{ label: "Berlin", city: "Berlin", countryCode: "DE" }],
    remoteType: null,
    remoteEligibility: null,
    employmentType: "full_time",
    seniority: null,
    salary: null,
    visaSponsorship: null,
    relocationSupport: null,
    language: "en",
    description: "Build the mail backend.",
    skills: ["typescript"],
    postedAt: null,
    expiresAt: null,
    fingerprint: "smoke-mail-fingerprint",
    createdAt: now,
    updatedAt: now,
  };
  await db.doc(firestorePaths.job(uid, jobId)).set(converters.job.toFirestore(job));
  console.log(`seeded mailAccounts/${accountId} (imap, connected, canSend) and jobs/${jobId}\n`);

  // 4. Email apply → cancel inside the undo window.
  const startedAt = Date.now();
  const sent = await call("mailSend", idToken, { ...sendRequest, accountId, jobId });
  const scheduled = sent.result as { applicationId?: string; state?: string; sendAt?: string } | undefined;
  check(
    "mailSend (new application from jobId) → state scheduled + applicationId",
    scheduled?.state === "scheduled" && typeof scheduled.applicationId === "string",
    sent.result ?? sent.error,
  );
  const applicationId = scheduled?.applicationId;
  if (applicationId !== undefined) {
    const app = await db.doc(firestorePaths.application(uid, applicationId)).get();
    const sendId = app.get("emailSend.sendId") as string;
    const outboxRef = db.doc(serverOnlyPaths.mailOutbox(uid, sendId));
    check(
      "serverOnly outbox document exists while scheduled",
      (await outboxRef.get()).exists,
      serverOnlyPaths.mailOutbox(uid, sendId),
    );
    const cancel = await call("mailSendCancel", idToken, { applicationId });
    const elapsed = Date.now() - startedAt;
    check(
      `mailSendCancel within the window (${elapsed} ms after mailSend) → { state: 'cancelled' }`,
      elapsed < 10_000 && (cancel.result as { state?: string } | undefined)?.state === "cancelled",
      cancel.result ?? cancel.error,
    );
    const after = await db.doc(firestorePaths.application(uid, applicationId)).get();
    check(
      "applications/{id}.emailSend.state == 'cancelled', status still preparing",
      after.get("emailSend.state") === "cancelled" && after.get("status") === "preparing",
      { emailSendState: after.get("emailSend.state"), status: after.get("status") },
    );
    check("serverOnly outbox document is gone", !(await outboxRef.get()).exists, null);
    expectError(
      "second mailSendCancel → already_sent",
      await call("mailSendCancel", idToken, { applicationId }),
      "FAILED_PRECONDITION",
      "already_sent",
    );
    // The dispatch task was deleted: past sendAt the application must still be cancelled.
    await sleep(Math.max(0, 15_000 - (Date.now() - startedAt)));
    const later = await db.doc(firestorePaths.application(uid, applicationId)).get();
    check(
      "15 s after mailSend: still cancelled (no dispatch ran)",
      later.get("emailSend.state") === "cancelled",
      { emailSendState: later.get("emailSend.state") },
    );
  }
} finally {
  // Account-data deletion (JobsBackend's deleteUserData is not on main yet): every userDataRoots
  // tree, the Storage prefix, then the Auth user. The seeded account has no credentials to revoke.
  for (const root of userDataRoots(uid)) await db.recursiveDelete(db.doc(root));
  await getStorage().bucket().deleteFiles({ prefix: userStoragePrefix(uid) });
  await getAuth().deleteUser(uid);
  const gone = await getAuth()
    .getUser(uid)
    .then(() => false)
    .catch(() => true);
  const left = await Promise.all(
    userDataRoots(uid).map(async (root) => (await db.doc(root).listCollections()).length),
  );
  console.log(
    `\ncleanup: user deleted=${gone}, subcollections left under userDataRoots=${left.reduce((a, b) => a + b, 0)}`,
  );
}

console.log(failures.length === 0 ? "\nall expectations met" : `\n${failures.length} failed:\n- ${failures.join("\n- ")}`);
process.exitCode = failures.length === 0 ? 0 : 1;
