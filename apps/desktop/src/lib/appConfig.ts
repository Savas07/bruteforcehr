/**
 * The minimum-version gate's source: the public `appConfig/{macos|windows}` document
 * (ADR 0002, server-written by the release pipeline), read with the Firebase JS SDK's
 * Firestore Lite (one REST read, no listeners or cache). Imported on demand
 * (src/components/updates/context.tsx), like Firestore Lite itself.
 */
import { SemverSchema, UrlSchema } from "@bfhr/core";
import { firestorePaths } from "@bfhr/api";
import { firebaseApp } from "./firebase";

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
    // On demand: Firestore Lite is only needed for this one read, so it stays out of the startup
    // bundle (a static import would load it at launch).
    const { doc, getDoc, getFirestore } = await import("firebase/firestore/lite");
    const app = firebaseApp();
    const snapshot = await getDoc(doc(getFirestore(app), firestorePaths.appConfig(platform)));
    return parseVersionRequirement(snapshot.data());
  } catch (error) {
    console.warn("Couldn't read the minimum supported version", error);
    return null;
  }
}
