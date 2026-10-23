// Setup of the mail emulator tests (vitest.emulator.config.ts): secrets and parameters the mail
// functions read from the environment, and the Admin SDK app on the emulators started by
// `firebase emulators:exec` (FIRESTORE_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_HOST).
import { randomBytes } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";

const PROJECT_ID = "demo-bruteforcehr";

if (
  process.env["FIRESTORE_EMULATOR_HOST"] === undefined ||
  process.env["FIREBASE_STORAGE_EMULATOR_HOST"] === undefined
)
  throw new Error("Run these tests with `pnpm --filter @bfhr/functions test:emulator` (Firebase emulators).");

process.env["GCLOUD_PROJECT"] = PROJECT_ID;
process.env["MAIL_TOKEN_KEYS"] = JSON.stringify({
  current: "k1",
  keys: { k1: randomBytes(32).toString("base64") },
});
process.env["GOOGLE_OAUTH_CLIENT"] = JSON.stringify({ clientId: "test-google", clientSecret: "test-secret" });
process.env["MICROSOFT_OAUTH_CLIENT"] = JSON.stringify({
  clientId: "test-microsoft",
  clientSecret: "test-secret",
});
// Rules only: the pipeline never calls the model.
process.env["ANTHROPIC_API_KEY"] = "unset";
process.env["PUBLIC_BASE_URL"] = "https://bruteforcehr.test";

if (getApps().length === 0)
  initializeApp({ projectId: PROJECT_ID, storageBucket: `${PROJECT_ID}.appspot.com` });
