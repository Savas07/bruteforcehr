// Live check of the deployed account callables (docs/runbooks/account.md "Live check"). Signs a
// throwaway user in through a real email link (the Admin SDK generates the link instead of mailing
// it; the sign-in runs the `blockPasswordSignUp` blocking function like in the apps), writes data
// into every user collection, serverOnly tree and Storage area, then:
//   export over HTTPS → download + inspect the ZIP → rate limit → stale sign-in refused →
//   re-auth with a new link → delete → nothing left in Firestore, Storage or Auth → second delete
//   is a no-op → the same email signs up again as a new, empty user; password sign-up stays blocked.
// Takes about 6 minutes (it waits until the first sign-in is older than 5 minutes).
//
//   gcloud auth application-default login   # once; the owner account
//   pnpm --filter @bfhr/functions smoke:account
// First: initializes the Admin app before src/callable.ts would (see live-app.ts).
import { PROJECT, REGION, WEB_API_KEY } from "./live-app";
import { setTimeout as sleep } from "node:timers/promises";
import {
  DOCUMENT_PATTERNS,
  firestorePaths,
  serverOnlyPaths,
  storagePaths,
  userDataRoots,
  userStoragePrefix,
} from "@bfhr/api";
import { ACCOUNT_RECENT_SIGN_IN_SECONDS, type AccountExportResponse } from "@bfhr/core";
import { strFromU8, unzipSync } from "fflate";
import { getAuth } from "firebase-admin/auth";
import { type DocumentReference, FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { deleteAccount } from "../src/account/delete";

const db = getFirestore();
const bucket = getStorage().bucket();
const SECRET = `SMOKE-SECRET-${Date.now()}`;
const PUSH_TOKEN = `SMOKE-PUSH-TOKEN-${Date.now()}`;
const IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts";
// The browser key only accepts the app's referrers (ADR 0008); this is the desktop webview's.
const HEADERS = { "Content-Type": "application/json", Referer: "tauri://localhost/" };

interface CallableReply {
  result?: unknown;
  error?: { status: string; message: string; details?: { reason?: string } };
}

async function call(name: string, idToken: string, data: unknown): Promise<CallableReply> {
  const response = await fetch(`https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const text = await response.text();
  try {
    return JSON.parse(text) as CallableReply;
  } catch {
    return { error: { status: `HTTP ${response.status}`, message: text.slice(0, 300) } };
  }
}

const failures: string[] = [];
function check(label: string, ok: boolean, observed: unknown): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}\n      ${JSON.stringify(observed)}`);
  if (!ok) failures.push(label);
}

/** Signs in with a freshly generated email link; returns the uid and ID token. */
async function signInWithLink(email: string): Promise<{ uid: string; idToken: string }> {
  const link = await getAuth().generateSignInWithEmailLink(email, {
    url: `https://${PROJECT}.web.app/auth/finish`,
    handleCodeInApp: true,
  });
  const oobCode = new URL(link).searchParams.get("oobCode");
  const response = await fetch(`${IDENTITY}:signInWithEmailLink?key=${WEB_API_KEY}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ email, oobCode }),
  });
  const body = (await response.json()) as { idToken?: string; localId?: string; error?: unknown };
  if (body.idToken === undefined || body.localId === undefined)
    throw new Error(`email-link sign-in failed: ${JSON.stringify(body.error)}`);
  return { uid: body.localId, idToken: body.idToken };
}

/** One document in every per-user collection and serverOnly tree (mirrors the emulator test). */
function seedDocuments(uid: string): Record<string, Record<string, unknown>> {
  const at = Timestamp.now();
  return {
    [firestorePaths.user(uid)]: { fullName: "Smoke Test", timezone: "Europe/Istanbul", aiEnabled: false },
    [firestorePaths.cv(uid, "cv-1")]: { title: "Smoke CV", version: 1, createdAt: at },
    [firestorePaths.cvRevision(uid, "cv-1", "rev-1")]: { summary: "Smoke revision", createdAt: at },
    [firestorePaths.renderedFile(uid, "file-1")]: {
      kind: "pdf",
      fileName: "Smoke-CV.pdf",
      storagePath: storagePaths.renderedFile(uid, "file-1"),
    },
    [firestorePaths.coverLetter(uid, "cl-1")]: { title: "Smoke letter", body: "Dear team" },
    [firestorePaths.job(uid, "job-1")]: { title: "Smoke Engineer", embedding: FieldValue.vector([0.1, 0.2]) },
    [firestorePaths.jobMatch(uid, "job-1")]: { score: 0.5 },
    [firestorePaths.savedSearch(uid, "search-1")]: { name: "Smoke search", enabled: false },
    [firestorePaths.watchedCompany(uid, "company-1")]: { name: "Smoke Inc", enabled: false },
    [firestorePaths.application(uid, "app-1")]: { company: "Smoke Inc", status: "saved" },
    [firestorePaths.applicationEvent(uid, "event-1")]: { applicationId: "app-1", type: "created" },
    [firestorePaths.interview(uid, "interview-1")]: { applicationId: "app-1", startsAt: at },
    [firestorePaths.contact(uid, "contact-1")]: { name: "Smoke Contact" },
    [firestorePaths.mailAccount(uid, "acc-1")]: {
      provider: "imap",
      address: "smoke@example.com",
      status: "connected",
      secretRef: `mail/users/${uid}/mailTokens/acc-1`,
    },
    [serverOnlyPaths.mailToken(uid, "acc-1")]: { accountId: "acc-1", secret: SECRET },
    [firestorePaths.mailMessage(uid, "msg-1")]: { accountId: "acc-1", subject: "Smoke message" },
    [firestorePaths.device(uid, "device-1")]: { platform: "ios", pushToken: PUSH_TOKEN },
    [serverOnlyPaths.aiUsageDay(uid, "2026-10-24")]: { microUsd: 1 },
    [serverOnlyPaths.jobAlert(uid, "job-1")]: { score: 0.5 },
    [serverOnlyPaths.jobQuotaDay(uid, "2026-10-24")]: { search: 1 },
    [serverOnlyPaths.jobImportPage(uid, "d".repeat(64))]: { url: "https://jobs.example/smoke", status: "ok" },
    [serverOnlyPaths.mailSeen(uid, "b".repeat(64))]: { accountId: "acc-1" },
    [serverOnlyPaths.mailOutbox(uid, "send-1")]: { subject: "Smoke outbox" },
    [serverOnlyPaths.mailSendDay(uid, "2026-10-24")]: { count: 1 },
    [`${serverOnlyPaths.mailCorrections(uid)}/fix-1`]: { from: "other", to: "interview" },
  };
}

const FILES = (uid: string): Record<string, string> => ({
  [storagePaths.cvImport(uid, "import-1")]: "%PDF-1.7 smoke import",
  [storagePaths.renderedFile(uid, "file-1")]: "%PDF-1.7 smoke rendered",
  [storagePaths.cvPhoto(uid, "photo-1")]: "smoke photo",
  [storagePaths.mailAttachment(uid, "attachment-1")]: "%PDF-1.7 smoke attachment",
});

async function remainingDocuments(uid: string): Promise<string[]> {
  const found: string[] = [];
  const visit = async (ref: DocumentReference): Promise<void> => {
    if ((await ref.get()).exists) found.push(ref.path);
    for (const collection of await ref.listCollections())
      for (const child of await collection.listDocuments()) await visit(child);
  };
  for (const root of userDataRoots(uid)) await visit(db.doc(root));
  return found;
}

async function storageNames(uid: string): Promise<string[]> {
  const [files] = await bucket.getFiles({ prefix: userStoragePrefix(uid) });
  return files.map((file) => file.name);
}

const email = `account-smoke-${Date.now()}@example.com`;
const cleanup = new Set<string>();
try {
  const first = await signInWithLink(email);
  const uid = first.uid;
  const signedInAt = Date.now();
  cleanup.add(uid);
  console.log(`signed in a new user through an email link (blockPasswordSignUp allowed it): ${uid}\n`);

  // 1. Seed data in every collection and every Storage area.
  const documents = seedDocuments(uid);
  const covered = new Set(
    Object.keys(documents).flatMap((path) => path.split("/").filter((_, i) => i % 2 === 0)),
  );
  const userCollections = [
    ...new Set(
      Object.values(DOCUMENT_PATTERNS)
        .filter((pattern) => pattern.startsWith("users/{"))
        .flatMap((pattern) => pattern.split("/").filter((_, i) => i % 2 === 0)),
    ),
  ];
  check(
    "seed covers every users/{uid} collection and every userDataRoots tree but accountExport (written by the export)",
    userCollections.every((collection) => covered.has(collection)) &&
      userDataRoots(uid)
        .filter((root) => !root.startsWith("serverOnly/accountExport/"))
        .every((root) => Object.keys(documents).some((path) => path === root || path.startsWith(`${root}/`))),
    { collections: [...covered].length },
  );
  const batch = db.batch();
  for (const [path, data] of Object.entries(documents)) batch.set(db.doc(path), data);
  await batch.commit();
  for (const [path, content] of Object.entries(FILES(uid)))
    await bucket.file(path).save(Buffer.from(content), { contentType: "application/octet-stream" });
  console.log(
    `seeded ${Object.keys(documents).length} documents and ${Object.keys(FILES(uid)).length} files\n`,
  );

  // 2. Export.
  const exported = await call("accountExport", first.idToken, {});
  const result = exported.result as AccountExportResponse | undefined;
  check(
    "accountExport returns the ZIP location",
    result?.storagePath?.startsWith(`users/${uid}/exports/`) === true,
    exported,
  );
  if (result !== undefined) {
    const [bytes] = await bucket.file(result.storagePath).download();
    const zip = unzipSync(new Uint8Array(bytes));
    const names = Object.keys(zip).sort();
    console.log(
      `      ZIP ${bytes.byteLength} bytes, ${names.length} entries:\n      ${names.join("\n      ")}`,
    );
    const expected = [
      "README.md",
      "data/profile.json",
      ...userCollections
        .filter((collection) => collection !== "users" && collection !== "revisions")
        .map((collection) => `data/${collection}.json`),
      "data/cvs/revisions.json",
      "data/internal/accountExport/accountExportDays.json",
      "data/internal/aiUsage/aiUsageDays.json",
      "data/internal/jobAlerts/jobAlertItems.json",
      "data/internal/jobQuota/jobQuotaDays.json",
      "data/internal/jobImport/jobImportPages.json",
      "data/internal/mail/mailCorrections.json",
      "data/internal/mail/mailOutbox.json",
      "data/internal/mail/mailSeen.json",
      "data/internal/mail/mailSendDays.json",
      ...Object.keys(FILES(uid)).map((path) => `files/${path.slice(userStoragePrefix(uid).length)}`),
    ].sort();
    check("ZIP holds exactly the expected files", JSON.stringify(names) === JSON.stringify(expected), {
      missing: expected.filter((name) => !names.includes(name)),
      extra: names.filter((name) => !expected.includes(name)),
    });
    const text = Object.values(zip)
      .map((entry) => strFromU8(entry))
      .join("\n");
    check(
      "ZIP contains no secrets (mail token, push token, secretRef, embeddings)",
      [SECRET, PUSH_TOKEN, "mailTokens", "secretRef", '"embedding"'].every(
        (secret) => !text.includes(secret),
      ),
      null,
    );
    check(
      "ZIP content matches the stored data",
      text.includes("Smoke revision") && text.includes("%PDF-1.7 smoke rendered"),
      null,
    );
    check(
      "export object carries the lifecycle suffix",
      result.storagePath.endsWith(".bfhr-export.zip"),
      result.storagePath,
    );
  }
  const again = await call("accountExport", first.idToken, {});
  check(
    "second export right away → export_too_soon",
    again.error?.status === "RESOURCE_EXHAUSTED" && again.error.details?.reason === "export_too_soon",
    again.error ?? again,
  );

  // 3. Stale sign-in, then re-authentication with a new email link.
  const wait = signedInAt + (ACCOUNT_RECENT_SIGN_IN_SECONDS + 10) * 1000 - Date.now();
  console.log(`\nwaiting ${Math.ceil(wait / 1000)} s until the first sign-in is older than 5 minutes…`);
  await sleep(Math.max(0, wait));
  const stale = await call("accountDelete", first.idToken, { confirm: true });
  check(
    "accountDelete with a sign-in older than 5 min → recent_sign_in_required",
    stale.error?.status === "FAILED_PRECONDITION" &&
      stale.error.details?.reason === "recent_sign_in_required",
    stale.error ?? stale,
  );
  check("nothing deleted by the refused call", (await remainingDocuments(uid)).length > 0, null);
  const fresh = await signInWithLink(email);
  check("re-auth by email link keeps the same uid", fresh.uid === uid, { uid: fresh.uid });

  // 4. Delete.
  const deleted = await call("accountDelete", fresh.idToken, { confirm: true });
  check(
    "accountDelete → { deleted: true }",
    (deleted.result as { deleted?: boolean } | undefined)?.deleted === true,
    deleted,
  );
  const docsLeft = await remainingDocuments(uid);
  check("no document left under any userDataRoots tree", docsLeft.length === 0, docsLeft);
  const subcollectionsLeft = (
    await Promise.all(userDataRoots(uid).map(async (root) => (await db.doc(root).listCollections()).length))
  ).reduce((a, b) => a + b, 0);
  check("no subcollection left under any root", subcollectionsLeft === 0, subcollectionsLeft);
  const filesLeft = await storageNames(uid);
  check("no Storage object left under users/{uid}/ (export included)", filesLeft.length === 0, filesLeft);
  const authGone = await getAuth()
    .getUser(uid)
    .then(() => false)
    .catch((error: { code?: string }) => error.code === "auth/user-not-found");
  check("Auth user deleted", authGone, null);
  const second = await call("accountDelete", fresh.idToken, { confirm: true });
  check(
    "second accountDelete (token still valid) → { deleted: true }, idempotent",
    (second.result as { deleted?: boolean } | undefined)?.deleted === true,
    second,
  );
  if (authGone) cleanup.delete(uid);

  // 5. blockPasswordSignUp interplay.
  const again2 = await signInWithLink(email);
  cleanup.add(again2.uid);
  check("same email signs in again as a new user", again2.uid !== uid, { uid: again2.uid });
  check("the new user has no data", (await remainingDocuments(again2.uid)).length === 0, null);
  const passwordSignUp = await fetch(`${IDENTITY}:signUp?key=${WEB_API_KEY}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      email: `account-smoke-pw-${Date.now()}@example.com`,
      password: "Smoke-password-1",
      returnSecureToken: true,
    }),
  });
  const passwordBody = (await passwordSignUp.json()) as {
    idToken?: string;
    localId?: string;
    error?: { message?: string };
  };
  if (passwordBody.localId !== undefined) cleanup.add(passwordBody.localId);
  check(
    "password sign-up still refused by blockPasswordSignUp",
    passwordBody.idToken === undefined && (passwordBody.error?.message ?? "").includes("BLOCKING_FUNCTION"),
    passwordBody.error ?? passwordBody,
  );
} finally {
  for (const uid of cleanup) {
    await deleteAccount({ db, bucket, auth: getAuth(), revokeMail: async () => {} }, uid);
    console.log(`cleanup: removed ${uid}`);
  }
}

console.log(
  failures.length === 0
    ? "\nall expectations met"
    : `\n${failures.length} failed:\n- ${failures.join("\n- ")}`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
