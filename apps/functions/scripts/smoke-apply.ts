// Live check of the deployed Apply AI callables (docs/adr/0010-ai.md "Tailoring", "Cover letters").
// Creates a throwaway user signed in with a real email link (verified like in the apps), seeds a CV
// revision and a job from @bfhr/fixtures, calls cvTailor and coverLetterDraft over HTTPS, applies
// every proposed edit with applyTailorEdits, checks not-found and the AI toggle, prints the usage
// ledger, then removes everything with deleteUserData and deletes the Auth user. A few cents.
//
//   gcloud auth application-default login   # once; the owner account
//   pnpm --filter @bfhr/functions smoke:apply
// First: initializes the Admin app before src/callable.ts would (see live-app.ts).
import { PROJECT, REGION, WEB_API_KEY } from "./live-app";
import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import {
  applyTailorEdits,
  CoverLetterDraftResponseSchema,
  CvContentSchema,
  CvTailorResponseSchema,
} from "@bfhr/core";
import { populatedDataset } from "@bfhr/fixtures";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { deleteUserData } from "../src/account/user-data";
import { adminConverters } from "../src/converters";

const db = getFirestore();

interface CallableReply {
  result?: unknown;
  error?: { status: string; message: string; details?: unknown };
}

async function call(name: string, idToken: string, data: unknown): Promise<CallableReply> {
  const response = await fetch(`https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  return (await response.json()) as CallableReply;
}

const show = (label: string, value: unknown): void =>
  console.log(`\n=== ${label}\n${JSON.stringify(value, null, 2)}`);

const cv = populatedDataset.cvs.find((candidate) => candidate.language.startsWith("en"));
const revision = populatedDataset.cvRevisions.find((candidate) => candidate.id === cv?.currentRevisionId);
const job = populatedDataset.jobs.find((candidate) => candidate.description.length > 200);
if (cv === undefined || revision === undefined || job === undefined)
  throw new Error("fixtures lack an English CV with its revision or a job with a description");

const email = `apply-smoke-${Date.now()}@example.com`;
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

  const batch = db.batch();
  batch.set(db.doc(firestorePaths.cv(uid, cv.id)), adminConverters.cv.toFirestore(cv));
  batch.set(
    db.doc(firestorePaths.cvRevision(uid, cv.id, revision.id)),
    adminConverters.cvRevision.toFirestore(revision),
  );
  batch.set(db.doc(firestorePaths.job(uid, job.id)), adminConverters.job.toFirestore(job));
  await batch.commit();
  const ids = { cvId: cv.id, revisionId: revision.id, jobId: job.id };
  console.log(`seeded CV "${cv.title}" and job "${job.title}" at ${job.company}`);

  // 1. cvTailor: thorough edits, every one applied like the client does.
  const tailored = await call("cvTailor", idToken, { ...ids, locale: "en", intensity: "thorough" });
  show("cvTailor (thorough, en)", tailored);
  const response = CvTailorResponseSchema.parse(tailored.result);
  const applied = applyTailorEdits(
    revision.content,
    response.edits,
    response.edits.map((edit) => edit.id),
  );
  show("applyTailorEdits (all accepted)", {
    applied: applied.applied.length,
    skipped: applied.skipped,
    validContent: CvContentSchema.safeParse(applied.content).success,
  });

  // 2. coverLetterDraft: free draft, and the German starter template.
  const free = await call("coverLetterDraft", idToken, { ...ids, tone: "warm", language: "en" });
  show("coverLetterDraft (warm, en)", free);
  CoverLetterDraftResponseSchema.parse(free.result);
  show(
    "coverLetterDraft (formal, de, starter-de)",
    await call("coverLetterDraft", idToken, {
      ...ids,
      tone: "formal",
      language: "de",
      templateId: "starter-de",
    }),
  );

  // 3. Missing documents, unknown templates and the AI toggle are refused before any model call.
  show(
    "cvTailor for a job that isn't the caller's (expect not-found / job_not_found)",
    await call("cvTailor", idToken, { ...ids, jobId: "someone-elses-job", locale: "en", intensity: "light" }),
  );
  show(
    "coverLetterDraft with an unknown template (expect not-found / template_not_found)",
    await call("coverLetterDraft", idToken, { ...ids, tone: "concise", language: "en", templateId: "nope" }),
  );
  await db.doc(firestorePaths.user(uid)).set({ aiEnabled: false }, { merge: true });
  show(
    "cvTailor with profile.aiEnabled=false (expect failed-precondition / ai_disabled)",
    await call("cvTailor", idToken, { ...ids, locale: "en", intensity: "light" }),
  );

  const days = await db.collection(`${serverOnlyPaths.aiUsageRoot(uid)}/aiUsageDays`).get();
  show(
    "usage ledger",
    days.docs.map((doc) => ({ id: doc.id, microUsd: doc.get("microUsd"), requests: doc.get("requests") })),
  );
} finally {
  await deleteUserData(db, getStorage().bucket(), uid, async () => undefined);
  await getAuth().deleteUser(uid);
  console.log(`\ncleanup: deleted ${uid}`);
}
