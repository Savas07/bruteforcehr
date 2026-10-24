/**
 * Writes documents into the Firestore emulator as its owner (`Bearer owner` skips the rules): the
 * server's side of a test ("the mail sync stored this email"). Values are converted to Firestore
 * REST values; every document gets `schemaVersion: 1` like the converters write.
 */
import { browser } from "@wdio/globals";
import { firebaseConfig } from "../../src/lib/firebase.ts";

const BASE = `http://127.0.0.1:8080/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };

/** Firestore REST value of a plain JS value (`Date` → timestamp). */
function value(input: unknown): unknown {
  if (input === null) return { nullValue: null };
  if (input instanceof Date) return { timestampValue: input.toISOString() };
  if (typeof input === "string") return { stringValue: input };
  if (typeof input === "boolean") return { booleanValue: input };
  if (typeof input === "number")
    return Number.isInteger(input) ? { integerValue: String(input) } : { doubleValue: input };
  if (Array.isArray(input)) return { arrayValue: { values: input.map(value) } };
  return { mapValue: { fields: fields(input as Record<string, unknown>) } };
}

function fields(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, inner]) => [key, value(inner)]));
}

/** Creates or replaces the document at `path` (below `documents/`). */
export async function writeDoc(path: string, data: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${BASE}/${path}`, {
    method: "PATCH",
    headers: OWNER,
    body: JSON.stringify({ fields: fields({ ...data, schemaVersion: 1 }) }),
  });
  if (!response.ok) throw new Error(`PATCH ${path}: ${response.status} ${await response.text()}`);
}

/** Deletes the document at `path` (below `documents/`, or a full REST name); missing is fine. */
export async function deleteDoc(path: string): Promise<void> {
  const relative = path.includes("/documents/")
    ? path.slice(path.indexOf("/documents/") + "/documents/".length)
    : path;
  const response = await fetch(`${BASE}/${relative}`, { method: "DELETE", headers: OWNER });
  if (!response.ok && response.status !== 404) throw new Error(`DELETE ${relative}: ${response.status}`);
}

/**
 * The uid of whoever is signed in: Firebase Auth persists the user in the webview's IndexedDB
 * (`firebaseLocalStorageDb`).
 */
export async function signedInUid(): Promise<string> {
  const uid = await browser.executeAsync((done: (uid: string | null) => void) => {
    const open = indexedDB.open("firebaseLocalStorageDb");
    open.onerror = () => done(null);
    open.onsuccess = () => {
      const request = open.result
        .transaction("firebaseLocalStorage", "readonly")
        .objectStore("firebaseLocalStorage")
        .getAll();
      request.onerror = () => done(null);
      request.onsuccess = () => {
        const entries = request.result as { fbase_key?: string; value?: { uid?: string } }[];
        const user = entries.find((entry) => entry.fbase_key?.startsWith("firebase:authUser:"));
        done(user?.value?.uid ?? null);
      };
    };
  });
  if (!uid) throw new Error("no signed-in user in the app");
  return uid;
}
