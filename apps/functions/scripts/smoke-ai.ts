// Live smoke test of the deployed AI callables (docs/adr/0010-ai.md). Creates a throwaway user,
// signs it in with a real email link (the Admin SDK generates the link instead of mailing it, so
// the email ends up verified like in the apps), uploads a synthetic CV, calls cvImport and cvAssist
// over HTTPS like the apps do, checks the AI toggle and cross-account access, then deletes the user
// and everything it created. Costs a few cents of Claude usage.
//
//   gcloud auth application-default login   # once; the owner account
//   pnpm --filter @bfhr/functions smoke:ai
import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const PROJECT = "bruteforcehr";
const REGION = "europe-west1";
/** Web API key (public client config, apps/desktop/src/lib/firebase.ts). */
const WEB_API_KEY = "AIzaSyBlJk949tJEB9HUmmRGoE8EsqQ2tEA41ag";
const FIXTURE = new URL(
  "../../../packages/ai/eval/fixtures/files/en-03-product-compact-pipe-headline.pdf",
  import.meta.url,
);

initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.firebasestorage.app` });

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

const email = `ai-smoke-${Date.now()}@example.com`;
const user = await getAuth().createUser({ email });
console.log(`created test user ${user.uid} <${email}>`);
const uid = user.uid;
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
  const claims = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString()) as Record<
    string,
    unknown
  >;
  console.log(`signed in with an email link; ID token email_verified=${String(claims["email_verified"])}`);

  // 1. cvImport: PDF → Claude → grounded JSON Resume.
  const storagePath = `users/${uid}/cv-imports/smoke-pdf`;
  await getStorage()
    .bucket()
    .file(storagePath)
    .save(await readFile(FIXTURE), { contentType: "application/pdf" });
  const imported = await call("cvImport", idToken, { storagePath, kind: "pdf" });
  show("cvImport (pdf)", imported);

  // 2. cvImport: JSON Resume, no model.
  const jsonPath = `users/${uid}/cv-imports/smoke-json`;
  await getStorage()
    .bucket()
    .file(jsonPath)
    .save(
      JSON.stringify({ basics: { name: "Test Person" }, work: [{ name: "Acme", startDate: "2020-13" }] }),
      {
        contentType: "application/json",
      },
    );
  show("cvImport (json)", await call("cvImport", idToken, { storagePath: jsonPath, kind: "json" }));

  // 3. cvAssist: a bullet without a metric, and a translation.
  show(
    "cvAssist (rewrite, en)",
    await call("cvAssist", idToken, {
      text: "Responsible for the onboarding flow of the mobile app and worked with design on improvements.",
      action: "rewrite",
      context: { section: "work", role: "Product Manager", company: "Lumenfold" },
    }),
  );
  show(
    "cvAssist (translate en→tr)",
    await call("cvAssist", idToken, {
      text: "Migrated 40 services to Kubernetes, cutting hosting costs by 28%.",
      action: "translate",
      targetLanguage: "tr",
      context: { section: "work" },
    }),
  );

  // 4. Cross-account access and the AI toggle are refused.
  show(
    "cvImport of another user's file (expect permission-denied)",
    await call("cvImport", idToken, { storagePath: "users/someoneElse/cv-imports/x", kind: "pdf" }),
  );
  await getFirestore().doc(`users/${uid}`).set({ aiEnabled: false });
  show(
    "cvAssist with profile.aiEnabled=false (expect failed-precondition / ai_disabled)",
    await call("cvAssist", idToken, {
      text: "Built dashboards.",
      action: "shorten",
      context: { section: "work" },
    }),
  );

  const days = await getFirestore().collection(`serverOnly/aiUsage/users/${uid}/aiUsageDays`).get();
  show(
    "usage ledger",
    days.docs.map((doc) => ({ id: doc.id, microUsd: doc.get("microUsd"), requests: doc.get("requests") })),
  );
} finally {
  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `users/${uid}/` });
  await getFirestore().recursiveDelete(getFirestore().doc(`users/${uid}`));
  await getFirestore().recursiveDelete(getFirestore().doc(`serverOnly/aiUsage/users/${uid}`));
  await getAuth().deleteUser(uid);
  const gone = await getAuth()
    .getUser(uid)
    .then(() => false)
    .catch(() => true);
  const [files] = await getStorage()
    .bucket()
    .getFiles({ prefix: `users/${uid}/` });
  console.log(`\ncleanup: user deleted=${gone}, storage objects left=${files.length}`);
}
