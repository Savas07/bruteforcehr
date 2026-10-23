// Live smoke test of the deployed cvRenderPdf (docs/adr/0009-cv-rendering.md). Creates a throwaway
// user, signs it in with a real email link (the Admin SDK generates the link instead of mailing it),
// stores a fixture CV + revision, calls cvRenderPdf over HTTPS like the apps do, checks the stored
// bytes against the returned SHA-256 and the renderedFiles document, then deletes the user and
// everything it created.
//
//   gcloud auth application-default login   # once; the owner account
//   pnpm --filter @bfhr/functions smoke:render
import { createHash } from "node:crypto";
import { createConverters, firestorePaths } from "@bfhr/api";
import { populatedDataset } from "@bfhr/fixtures";
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

async function call(idToken: string, data: unknown): Promise<unknown> {
  const response = await fetch(`https://${REGION}-${PROJECT}.cloudfunctions.net/cvRenderPdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  return response.json();
}

const email = `render-smoke-${Date.now()}@example.com`;
const user = await getAuth().createUser({ email });
const uid = user.uid;
console.log(`created test user ${uid} <${email}>`);
try {
  const link = await getAuth().generateSignInWithEmailLink(email, {
    url: `https://${PROJECT}.web.app/auth/finish`,
    handleCodeInApp: true,
  });
  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${WEB_API_KEY}`,
    {
      method: "POST",
      // The browser key only accepts the app's referrers (ADR 0008); this is the desktop webview's.
      headers: { "Content-Type": "application/json", Referer: "tauri://localhost/" },
      body: JSON.stringify({ email, oobCode: new URL(link).searchParams.get("oobCode") }),
    },
  );
  const { idToken } = (await signIn.json()) as { idToken?: string };
  if (idToken === undefined) throw new Error("email-link sign-in failed");

  const cv = populatedDataset.cvs.find((candidate) => candidate.id === "cv-de");
  const revision = populatedDataset.cvRevisions.find((candidate) => candidate.id === cv?.currentRevisionId);
  if (cv === undefined || revision === undefined) throw new Error("fixture CV missing");
  const db = getFirestore();
  await db.doc(firestorePaths.cv(uid, cv.id)).set(converters.cv.toFirestore(cv));
  await db
    .doc(firestorePaths.cvRevision(uid, cv.id, revision.id))
    .set(converters.cvRevision.toFirestore(revision));

  const reply = (await call(idToken, { cvId: cv.id, paper: "a4", templateId: "modern" })) as {
    result?: { storagePath: string; sha256: string; pages: number };
    error?: unknown;
  };
  console.log(`cvRenderPdf → ${JSON.stringify(reply)}`);
  if (reply.result === undefined) throw new Error("cvRenderPdf failed");
  const [bytes] = await getStorage().bucket().file(reply.result.storagePath).download();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const files = await db.collection(firestorePaths.renderedFiles(uid)).get();
  const record = files.docs.map((doc) => converters.renderedFile.fromSnapshot(doc))[0];
  console.log(
    `stored ${bytes.byteLength} bytes, sha256 ${sha256 === reply.result.sha256 ? "matches" : "DIFFERS"}; ` +
      `renderedFiles/${record?.id}: ${record?.fileName}, ${record?.sizeBytes} bytes, sha256 ${record?.sha256 === sha256 ? "matches" : "DIFFERS"}`,
  );
  console.log(`unverified/foreign checks: ${JSON.stringify(await call(idToken, { cvId: "nope" }))}`);
} finally {
  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `users/${uid}/` });
  await getFirestore().recursiveDelete(getFirestore().doc(`users/${uid}`));
  await getAuth().deleteUser(uid);
  const [left] = await getStorage()
    .bucket()
    .getFiles({ prefix: `users/${uid}/` });
  const docs = await getFirestore().doc(`users/${uid}`).listCollections();
  const gone = await getAuth()
    .getUser(uid)
    .then(() => false)
    .catch(() => true);
  console.log(
    `cleanup: user deleted=${gone}, storage objects left=${left.length}, collections left=${docs.length}`,
  );
}
