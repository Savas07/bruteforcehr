// Firebase Admin app of the live-check scripts that import function modules. Import this FIRST:
// src/callable.ts initializes the default app without options when it is imported and none exists
// yet, and that app has no project or Storage bucket set.
import { initializeApp } from "firebase-admin/app";

export const PROJECT = "bruteforcehr";
export const REGION = "europe-west1";
/** Web API key (public client config, apps/desktop/src/lib/firebase.ts). */
export const WEB_API_KEY = "AIzaSyBlJk949tJEB9HUmmRGoE8EsqQ2tEA41ag";

initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.firebasestorage.app` });
