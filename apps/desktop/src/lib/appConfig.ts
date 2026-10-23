/**
 * The minimum-version gate's source: the public `appConfig/{macos|windows}` document
 * (ADR 0002, server-written by the release pipeline), read with the Firebase JS SDK's
 * Firestore Lite (one REST read, no listeners or cache). Imported on demand
 * (src/components/updates/context.tsx), like the SDK itself.
 *
 * The Firebase config below is the "BruteForceHR Desktop" web app's client config, not a secret:
 * its API key only identifies the project and is restricted in Google Cloud to the Tauri origins
 * and to Firestore / Identity Toolkit / Secure Token / Installations.
 */
import { SemverSchema, UrlSchema } from "@bfhr/core";
import { firestorePaths } from "@bfhr/api";

const firebaseConfig = {
  apiKey: "AIzaSyBlJk949tJEB9HUmmRGoE8EsqQ2tEA41ag",
  authDomain: "bruteforcehr.firebaseapp.com",
  projectId: "bruteforcehr",
  storageBucket: "bruteforcehr.firebasestorage.app",
  messagingSenderId: "33654863934",
  appId: "1:33654863934:web:1a9ffb291c8ea5047c796f",
} as const;

/** What the gate needs from `appConfig/{platform}`. */
export interface VersionRequirement {
  readonly minSupportedVersion: string;
  /** The website download page, for when the in-app update can't run. */
  readonly downloadUrl: string | null;
}

/**
 * Reads only the two fields the gate uses, so a malformed or newer field elsewhere in the
 * document never blocks the app. Null when the document doesn't exist or has no valid minimum.
 */
export function parseVersionRequirement(
  data: Readonly<Record<string, unknown>> | undefined,
): VersionRequirement | null {
  const minimum = SemverSchema.safeParse(data?.["minSupportedVersion"]);
  if (!minimum.success) return null;
  const download = UrlSchema.safeParse(data?.["downloadUrl"]);
  return { minSupportedVersion: minimum.data, downloadUrl: download.success ? download.data : null };
}

/**
 * The platform's requirement; null when there is none or it can't be read right now (offline):
 * the gate never blocks on a failed read.
 */
export async function fetchVersionRequirement(
  platform: "macos" | "windows",
): Promise<VersionRequirement | null> {
  try {
    const [{ initializeApp, getApps }, { doc, getDoc, getFirestore }] = await Promise.all([
      import("firebase/app"),
      import("firebase/firestore/lite"),
    ]);
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    const snapshot = await getDoc(doc(getFirestore(app), firestorePaths.appConfig(platform)));
    return parseVersionRequirement(snapshot.data());
  } catch (error) {
    console.warn("Couldn't read the minimum supported version", error);
    return null;
  }
}
