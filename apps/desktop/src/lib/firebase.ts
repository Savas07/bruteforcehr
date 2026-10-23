/**
 * The Firebase JS SDK app, shared by sign-in (src/features/auth/firebaseAuth.ts) and the
 * minimum-version gate (src/lib/appConfig.ts).
 *
 * The config is the "BruteForceHR Desktop" web app's client config, not a secret: its API key only
 * identifies the project and is restricted in Google Cloud to the Tauri origins (plus the website
 * hosts the sign-in link lands on) and to Firestore / Identity Toolkit / Secure Token /
 * Installations.
 */
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";

export const firebaseConfig = {
  apiKey: "AIzaSyBlJk949tJEB9HUmmRGoE8EsqQ2tEA41ag",
  authDomain: "bruteforcehr.firebaseapp.com",
  projectId: "bruteforcehr",
  storageBucket: "bruteforcehr.firebasestorage.app",
  messagingSenderId: "33654863934",
  appId: "1:33654863934:web:1a9ffb291c8ea5047c796f",
} as const;

export function firebaseApp(): FirebaseApp {
  return getApps()[0] ?? initializeApp(firebaseConfig);
}
