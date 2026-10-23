/**
 * Firestore, Cloud Storage and Cloud Functions for the signed-in app, created once on first use.
 *
 * Firestore keeps a persistent local cache (IndexedDB in the webview): snapshot listeners answer
 * from it at once, writes made offline queue there and reach the server on reconnect (the outbox,
 * ADR 0002). Test builds (`__BFHR_E2E__`) talk to the emulators started by
 * scripts/with-emulators.sh (firebase.json `emulators`).
 */
import { connectFirestoreEmulator, type Firestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager, setLogLevel } from "firebase/firestore";
import { onLog } from "firebase/app";
import { connectFunctionsEmulator, type Functions, getFunctions } from "firebase/functions";
import { connectStorageEmulator, type FirebaseStorage, getStorage } from "firebase/storage";
import { firebaseApp } from "./firebase";
import { trace } from "./e2eTrace";

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
  });
  if (__BFHR_E2E__) {
    connectFirestoreEmulator(firestoreInstance, EMULATOR_HOST, EMULATOR_PORTS.firestore);
    setLogLevel("debug");
    onLog(
      (entry) => {
        if (entry.type !== "@firebase/firestore") return;
        trace("FS", entry.level, entry.message.replace(/^Firestore \([^)]*\): /u, ""));
      },
      { level: "debug" },
    );
  }
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
