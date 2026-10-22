# ADR 0001 — Technology stack and repository contracts

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** Savas (owner), lead engineer agent
- **Supersedes:** BRIEF.md §6 "Architecture (default stack)" where noted below
- **Related:** [0002-data-model.md](0002-data-model.md), [0003-auth-email-otp.md](0003-auth-email-otp.md), [0004-release-updates-signing.md](0004-release-updates-signing.md), [0005-job-sources-scraping.md](0005-job-sources-scraping.md), [0006-hosting-domains.md](0006-hosting-domains.md)

## Context

BruteForceHR is a job-search super-app for one person first (architecture stays multi-user-capable): iOS app, desktop app for macOS + Windows, a marketing website, and a backend for sync, mail sync, job ingestion, AI and PDF rendering (BRIEF §1). The brief proposed a default stack of TypeScript everywhere, Electron, Expo, Astro, **Supabase** (Postgres + RLS + pgvector, Auth, Storage, Realtime) and a **Node worker container on Fly.io** (BRIEF §6).

At kickoff the owner made these decisions that change the default:

- **No Supabase, no Docker, no Fly.io.** The owner already runs Google Cloud/Firebase projects and wants one vendor and no container hosting. A Firebase project `bruteforcehr` exists (Blaze plan, billing linked, budget alert ₺250/month).
- **No local JDK and no Docker** on the development Mac (disk ≈ 12 GB free). Firebase emulators need Java, so emulator-based tests run in CI only.
- Target markets TR / DE / NL / UK / US / remote; languages EN, TR, DE.

Constraints that shape the backend choice:

- Mail sync (Gmail API, Microsoft Graph, IMAP/SMTP), PDF rendering with headless Chromium and scheduled polling need long-running server code and outbound SMTP. Supabase Edge Functions were ruled out by the brief for exactly this reason (BRIEF §3).
- Cloud Functions for Firebase (2nd gen) run on Cloud Run functions. Maximum timeouts are **60 min for HTTP/callable**, **30 min for scheduled and task-queue functions**, **9 min for other event-driven functions** ([Manage functions — timeouts](https://firebase.google.com/docs/functions/manage-functions)). Memory and CPU are configurable per function; a 2nd-gen function gets 1 vCPU up to 2 GB and 2 vCPU at 4–8 GB ([same page, "Override CPU defaults"](https://firebase.google.com/docs/functions/manage-functions)).
- Google Cloud blocks outbound port **25** but places **no restriction on 587 or 465** ([Compute Engine — Sending email from an instance](https://docs.cloud.google.com/compute/docs/tutorials/sending-mail)). SMTP submission for IMAP/SMTP accounts therefore works from Cloud Functions.
- Task queue functions are backed by **Cloud Tasks** with per-queue `retryConfig` and `rateLimits` (`maxConcurrentDispatches`, …) ([Enqueue functions with Cloud Tasks](https://firebase.google.com/docs/functions/task-functions)).
- Firestore vector search: embedding dimension **≤ 2048**, `findNearest` returns **≤ 1000** documents (Standard edition), **no real-time snapshot listeners on vector queries**, and only the **Python, Node.js, Go and Java server libraries** support it ([Search with vector embeddings — Limitations](https://firebase.google.com/docs/firestore/vector-search)). Vector queries therefore run server-side in Functions.
- Firebase Hosting can rewrite paths to Cloud Functions in a non-default region with the `region` key; Hosting itself has a **60-second request timeout** ([Serve dynamic content with Cloud Functions](https://firebase.google.com/docs/hosting/functions)).

## Decision

### Languages and tooling

| Concern | Decision |
|---|---|
| Language | TypeScript, `strict`, everywhere (clients, functions, website, shared packages). |
| TypeScript version | **6.0.3**, not 7. typescript-eslint refuses TS 7 at runtime (`'typescript-eslint does not support TS 7.0.'` in [typescript-eslint `src/index.ts`](https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/typescript-eslint/src/index.ts); tracking [issue #12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518)). Revisit when typescript-eslint lists TS 7 in [Dependency Versions](https://typescript-eslint.io/users/dependency-versions/). |
| Shared tsconfig | `tsconfig.base.json`: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `moduleResolution: "Bundler"`. |
| Package manager | **pnpm 12.14** via corepack, **`nodeLinker: hoisted`**. Expo/Metro and electron-builder resolve dependencies most reliably from a flat `node_modules`; hoisting also keeps one copy of React for every app (see React pin). |
| Monorepo | **Turborepo 2.11** task graph and caching. |
| Lint / format / test | ESLint 10 flat config at root + typescript-eslint 8.72; Prettier 3.9; Vitest 5. |
| Validation | zod 4.6 for every boundary (IPC, HTTP, Firestore converters, AI structured output). |
| Runtime | Node 22 (local and Cloud Functions). |

### Apps and packages (repo contract)

```
apps/desktop        Electron (electron-vite, React, Tailwind, Radix, cmdk)        @bfhr/desktop
apps/ios            Expo dev build, expo-router, @react-native-firebase              @bfhr/ios
apps/web            Astro + Tailwind → Firebase Hosting                              @bfhr/web
apps/functions      Cloud Functions gen2, esbuild-bundled (workspace deps inlined)  @bfhr/functions
packages/core       domain types, zod schemas, status state machine, dedupe, matching (no platform deps)  @bfhr/core
packages/api        typed Firestore paths/converters + functions client; platform adapters               @bfhr/api
packages/ui-tokens  tokens → CSS variables, Tailwind preset, RN theme (created after design research)    @bfhr/ui-tokens
packages/fixtures   dev/test-only data typed by @bfhr/core; never imported by production code            @bfhr/fixtures
firebase.json, .firebaserc, firebase/firestore.rules, firebase/firestore.indexes.json, firebase/storage.rules
docs/               BRIEF.md, PRD.md, STATUS.md, adr/, design/, integrations/, runbooks/
```

- Later milestones add `packages/cv-render` (M2), `packages/mail-intel` (M5) and `packages/ai` (M2/M4). Empty packages are not created ahead of time.
- Internal packages export TypeScript source (`"exports": { ".": "./src/index.ts" }`, `"type": "module"`); each consumer's bundler compiles them (Vite, Metro, Astro, esbuild).
- Every package has `lint` (`eslint .`), `typecheck` (`tsc --noEmit`) and `test` (Vitest, when it has tests).
- Code sharing follows BRIEF §6: share domain logic, validation, API client, query hooks, tokens, i18n strings and CV templates; do **not** share view components. Desktop uses React DOM; iOS uses React Native with native primitives.

### React version pin

**`react` and `react-dom` are pinned to `19.3.0` workspace-wide.** Expo SDK 58 (`react-native` 0.88.0, `expo-router` ~58.0.24, Reanimated 4.7.1) requires that exact React; with the hoisted linker there is one `react` in `node_modules`, so desktop and web must use the same version. Upgrading React means upgrading Expo first. (Versions checked on npm on 2026-10-22, per kickoff.)

### Clients

| Client | Decision |
|---|---|
| Desktop | Electron (latest stable) + electron-vite, React 19.3.0, Tailwind, Radix primitives, cmdk, dnd-kit, TanStack Query/Virtual; packaged by electron-builder **26.x stable** (27 is still `next`: `npm view electron-builder dist-tags` → `latest 26.15.3`, `next 27.0.0-alpha.11`), updated by electron-updater (ADR 0004). |
| Desktop data | **Firebase JS SDK** (`firebase/firestore`, `firebase/auth`, `firebase/storage`) in the renderer with `persistentLocalCache` + `persistentMultipleTabManager` (IndexedDB) for offline reads and queued writes ([PersistentLocalCache](https://firebase.google.com/docs/reference/js/firestore_.persistentlocalcache), [Access data offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline)). |
| iOS | Expo (SDK 58, dev builds, expo-router), Reanimated, Gesture Handler, expo-secure-store, expo-notifications, expo-web-browser, share-extension config plugin. |
| iOS data | **`@react-native-firebase/*` 27.x** (native Firebase iOS SDK), not the JS SDK. The native SDK has Firestore offline persistence **on by default** on Apple platforms ([Access data offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline)); the JS SDK's IndexedDB persistence is unavailable in React Native and fails with "Offline persistence has been disabled" ([firebase-js-sdk #7947](https://github.com/firebase/firebase-js-sdk/issues/7947)). Requires an Expo dev build (no Expo Go). |
| Website | Astro + Tailwind, static output, served by Firebase Hosting (ADR 0006); shares `@bfhr/ui-tokens`. Replaces "GitHub Pages" from the brief. |

`packages/api` exposes one typed interface (paths, converters, function calls) with two adapters: Firebase JS SDK (desktop, web if needed) and React Native Firebase (iOS).

### Backend: Firebase project `bruteforcehr`

| Brief (Supabase/Fly.io) | Replacement |
|---|---|
| Postgres + RLS | **Cloud Firestore `(default)` database in `europe-west1`**; Security Rules **deny by default**, all user data under `users/{uid}/…` with `request.auth.uid == uid` (layout and rules in [0002-data-model.md](0002-data-model.md)). |
| pgvector | **Firestore vector search** (`findNearest`, flat index) on server-written `embedding` fields, queried from Functions (client SDKs don't support it — see Context). |
| Supabase Realtime | Firestore snapshot listeners. |
| Client cache + outbox | Firestore offline persistence (native on iOS, IndexedDB on desktop): queued writes replay on reconnect. |
| Supabase Auth email OTP | **Firebase Auth + custom email one-time code**: a Function issues a 6-digit code (hashed, TTL, attempt limit), emails it through **Brevo**, verifies it and mints a custom token; clients call `signInWithCustomToken` ([Create custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens)). Details in [0003-auth-email-otp.md](0003-auth-email-otp.md). |
| Supabase Storage | Cloud Storage for Firebase with `firebase/storage.rules`. |
| Supabase Vault | Secret Manager via `defineSecret` ([Configure your environment](https://firebase.google.com/docs/functions/config-env)); per-user OAuth mail tokens encrypted (AES-256-GCM envelope) and stored under `serverOnly/**`, never readable by clients. |
| Fly.io worker (HTTP API, pg-boss queue, schedulers, Chromium) | **Cloud Functions for Firebase 2nd gen, region `europe-west1`**: `onRequest` HTTPS API behind Hosting rewrites `/api/**` and `/connect/**` (ADR 0006); `onSchedule` for mail polling and saved searches; `onTaskDispatched` task-queue functions (Cloud Tasks) for fan-out work (per-account sync, backfill, embeddings, PDF render, send); headless Chromium for PDF in a high-memory function. |
| Expo Push | Unchanged (Expo Push Service or direct APNs) — decided in M4/M5. |
| AI | Provider interface with Anthropic Claude default; key in Secret Manager (`ANTHROPIC_API_KEY`), server-side only. |

Functions source is bundled with **esbuild** so workspace packages (`@bfhr/core`, `@bfhr/api`) are inlined and the deployed `package.json` lists only npm dependencies.

### Local development and testing

- No Java/Docker locally. **Firebase emulators and Security Rules tests run in CI only** (GitHub-hosted `ubuntu` runner with Java). Local runs use unit tests (Vitest) that don't need emulators.
- Dev/test data comes only from `@bfhr/fixtures`; production code never imports it.

## Consequences

Positive
- One vendor, one bill, one IAM surface; no container image to build, patch or host.
- Offline support and live sync come from the Firestore SDKs instead of a hand-written outbox.
- Functions scale to zero; cost tracks a personal workload (budget alert ₺250/month).

Negative / risks
- **No relational queries or SQL joins.** Insights (funnels, rates) are computed from `applicationEvents` in Functions or on the client; heavy aggregation may need materialized summary documents.
- **Vector search is server-only and capped** (≤ 2048 dims, ≤ 1000 results, no listeners). Matching runs in Functions and writes `jobMatches/{jobId}` documents that clients listen to.
- **Execution limits:** mail backfill and large syncs must be chunked into task-queue invocations (≤ 30 min each) instead of one long worker loop. Requests through Hosting are capped at 60 s, so long work is enqueued and progress is reported through Firestore documents.
- **Security Rules replace RLS:** correctness depends on rules tests that only run in CI (no local JDK). A rules change can't be fully verified before push.
- **Two Firebase client SDKs** (JS on desktop, native via RNFirebase on iOS) with different APIs; `packages/api` adapters must hide the differences and both need tests.
- **React is pinned by Expo.** Desktop/web can't move to a newer React independently.
- **TypeScript 7 (native compiler) is deferred** until typescript-eslint supports it.
- Firestore is in `europe-west1`; functions are co-located there. US users (if any) see higher latency — acceptable for a personal tool.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Supabase (Postgres + RLS + pgvector, Auth, Storage, Realtime) — the brief's default** | Rejected by the owner at kickoff: wants to stay on the existing Google Cloud/Firebase account and avoid a second vendor. Also needs a separate worker host anyway (Edge Functions can't do mail sync — BRIEF §3). |
| **Fly.io (or any Docker host) for the worker** | Rejected by the owner: no Docker locally, no container hosting to operate. Cloud Functions gen2 cover the needs within documented limits (60/30/9 min, outbound 587/465). |
| **Docker for local Postgres/emulators** | Rejected: no Docker or JDK on the dev machine; ~12 GB free disk. Emulators run in CI. |
| **Tauri 2 everywhere** | Webview UI on iOS instead of native primitives, mobile plugin ecosystem immature, weaker control over PDF output than Chromium `printToPDF` (BRIEF §6). |
| **Flutter** | Viable, but adds Dart as a second language (backend, website and shared domain stay TS) and desktop auto-update needs third-party updaters instead of the proven electron-updater + GitHub Releases path (BRIEF §6). |
| **SwiftUI (iOS/macOS) + a separate Windows app** | Three codebases and three languages for one developer; no shared domain logic (BRIEF §6). |
| **Firebase JS SDK on iOS** | No persistent offline cache in React Native (IndexedDB missing; [firebase-js-sdk #7947](https://github.com/firebase/firebase-js-sdk/issues/7947)), so no offline outbox. RNFirebase uses the native SDK with persistence on by default. |
| **TypeScript 7** | Not supported by typescript-eslint (hard error at load). |
| **pnpm isolated (symlinked) linker** | Metro and electron-builder packaging are fragile with symlinked `node_modules`; risk of duplicate React copies. Hoisted keeps one tree. |
| **Firebase Data Connect (Cloud SQL Postgres) instead of Firestore** | Would bring back SQL, but adds a Cloud SQL instance with a fixed monthly cost and has no native offline cache on clients; Firestore's offline persistence is a core requirement (BRIEF §6.3). |
