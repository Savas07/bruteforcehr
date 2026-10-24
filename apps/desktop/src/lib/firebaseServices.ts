/**
 * Firestore, Cloud Storage and Cloud Functions for the signed-in app, created once on first use.
 *
 * Firestore keeps a persistent local cache (IndexedDB in the webview): snapshot listeners answer
 * from it at once, writes made offline queue there and reach the server on reconnect (the outbox,
 * ADR 0002). Test builds (`__BFHR_E2E__`) talk to the emulators started by
 * scripts/with-emulators.sh (firebase.json `emulators`).
 *
 * WebKit webviews (macOS WKWebView, Linux WebKitGTK) use long polling instead of a streamed
 * response: since the WebKit of Safari 26.4, the last bytes of a streamed response wait until the
 * server sends more (https://bugs.webkit.org/show_bug.cgi?id=322545, fixed in WebKit, not yet in
 * macOS), so a listener's update, such as a save from the iPhone, arrived up to 30 s late (the
 * backend's keep-alive) or only with the next change. Long polling ends every response after its
 * data (firebase/firebase-js-sdk#9789). WebView2 (Windows) is not affected and keeps streaming.
 */
import { connectFirestoreEmulator, type Firestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager } from "firebase/firestore";
import { connectFunctionsEmulator, type Functions, getFunctions } from "firebase/functions";
import { connectStorageEmulator, type FirebaseStorage, getStorage } from "firebase/storage";
import { chrome } from "./desktop";
import { firebaseApp } from "./firebase";

/** Cloud Functions region (kickoff: europe-west1). */
export const FUNCTIONS_REGION = "europe-west1";

const EMULATOR_HOST = "127.0.0.1";
export const EMULATOR_PORTS = { firestore: 8080, storage: 9199, functions: 5001 } as const;

let firestoreInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let functionsInstance: Functions | null = null;

export function firestore(): Firestore {
  if (firestoreInstance) return firestoreInstance;
  firestoreInstance = initializeFirestore(firebaseApp(), {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }),
    experimentalForceLongPolling: chrome.platform !== "windows",
  });
  if (__BFHR_E2E__) connectFirestoreEmulator(firestoreInstance, EMULATOR_HOST, EMULATOR_PORTS.firestore);
  return firestoreInstance;
}

export function storage(): FirebaseStorage {
  if (storageInstance) return storageInstance;
  storageInstance = getStorage(firebaseApp());
  if (__BFHR_E2E__) connectStorageEmulator(storageInstance, EMULATOR_HOST, EMULATOR_PORTS.storage);
  return storageInstance;
}

export function functions(): Functions {
  if (functionsInstance) return functionsInstance;
  functionsInstance = getFunctions(firebaseApp(), FUNCTIONS_REGION);
  if (__BFHR_E2E__) connectFunctionsEmulator(functionsInstance, EMULATOR_HOST, EMULATOR_PORTS.functions);
  return functionsInstance;
}
