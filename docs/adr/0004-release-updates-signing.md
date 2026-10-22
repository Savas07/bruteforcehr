# ADR 0004 — Release pipeline, auto-update and code signing

- **Status:** Accepted
- **Date:** 2026-10-22
- **Supersedes:** BRIEF.md §7 (adapted to Firebase) and the Windows-signing part of BRIEF §3
- **Related:** [0001-stack.md](0001-stack.md), [0006-hosting-domains.md](0006-hosting-domains.md), [runbooks/accounts.md](../runbooks/accounts.md)

## Context

- BRIEF §2.2: **GitHub Releases are the single source of truth for versions.** Publishing one release must update desktop apps, ship iOS to TestFlight, deploy backend changes and refresh the website download page.
- Source repo `Savas07/bruteforcehr` is **private**. Updating from a private repo would need a GitHub token inside the app (forbidden, BRIEF §2.7), so binaries go to the **public** repo `Savas07/bruteforcehr-releases`.
- Backend is Firebase (ADR 0001): Firestore rules/indexes, Storage rules, Cloud Functions gen2 (`europe-west1`), Hosting (`bruteforcehr.web.app`). No Supabase migrations, no worker image.
- **iOS can't self-update** outside TestFlight/App Store: App Review Guideline 2.5.2 forbids downloading executable code ([App Review Guidelines §2.5.2](https://developer.apple.com/app-store/review/guidelines/#software-requirements)). TestFlight builds are **active for 90 days** and then expire ([Apple Tech Talk "Get started with TestFlight"](https://developer.apple.com/videos/play/tech-talks/110343/); [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)). Internal testers get builds as soon as processing finishes, with no Beta App Review ([Expo — Distribute with TestFlight](https://docs.expo.dev/submit/testflight/); [TestFlight](https://developer.apple.com/testflight/)).
- **macOS:** apps outside the Mac App Store must be signed with Developer ID and **notarized** or Gatekeeper blocks them ([electron-builder — macOS Notarization](https://www.electron.build/v26/docs/features/code-signing/notarization/)). The owner has an Apple Developer Program membership.
- **Windows signing is not available to this owner now.** Azure Artifact Signing (formerly Trusted Signing) Public Trust certificates are only available to organizations in the US, Canada, EU, UK, Australia, NZ, Japan, South Korea, Singapore, Switzerland, Norway and Israel, and to **individual developers in the US or Canada only**; it also needs a paid Azure subscription ([Artifact Signing quickstart — prerequisites](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart); [Artifact Signing FAQ](https://learn.microsoft.com/azure/artifact-signing/faq)). The owner is an individual in Turkey, so the remaining option is an OV certificate on an HSM/cloud HSM, which the owner postponed until the app is shared with others (kickoff decision).
- **electron-updater on Windows** verifies the Authenticode signature of a downloaded NSIS update **only when `publisherName` is present in `app-update.yml`**; with no `publisherName` the check returns early and the update is applied unverified ([`NsisUpdater.ts` v26](https://github.com/electron-userland/electron-builder/blob/v26.0.12/packages/electron-updater/src/NsisUpdater.ts), lines 110–124; `win.verifyUpdateCodeSignature` described in [electron-builder Windows docs](https://www.electron.build/v26/docs/win/)). electron-builder 26.x is the current stable line (`npm view electron-builder dist-tags`: `latest 26.15.3`); v27 (still `next`) adds Ed25519-signed update manifests by default ([electron-builder Security & Hardening (v27)](https://www.electron.build/docs/features/security/)).
- GitHub-hosted runners: `macos-26` (Apple silicon, Xcode 26.x), `windows-latest`, `ubuntu-latest` ([GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners); [macos-26-arm64 image readme](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md)).

## Decision

### 1. Versioning

- **Changesets** on `main`. Merging the "Version packages" PR bumps one shared version `X.Y.Z` for every app and pushes tag `vX.Y.Z`.
- The tag triggers `release.yml`, which creates a **draft** GitHub Release in `Savas07/bruteforcehr-releases` with the changeset notes. Drafts are invisible to electron-updater.
- Pre-releases (`vX.Y.Z-beta.N`) feed the **beta** channel.

### 2. `release.yml` (on `push: tags: v*` in the private source repo)

| Job | Runner | Steps |
|---|---|---|
| `verify` | ubuntu-latest | `pnpm install --frozen-lockfile`, `turbo lint typecheck test`, Firestore/Storage rules tests on the emulator (Java available on the runner; ADR 0001), mail-intel/AI eval gates once they exist. Every other job `needs: verify`. |
| `backend` | ubuntu-latest | `firebase deploy --only firestore:rules,firestore:indexes,storage,functions --project bruteforcehr --non-interactive` with a CI service-account credential. Changes are **expand-only** (new fields/collections/indexes are additive; old clients keep working). Hosting is deployed later by `website`. |
| `desktop-mac` | macos-26 | electron-builder: **arm64 + x64** (or universal) **DMG + ZIP** (electron-updater needs the ZIP on macOS), sign with **Developer ID Application** (`CSC_LINK`, `CSC_KEY_PASSWORD`), **notarize with notarytool** using an App Store Connect API key (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`) ([electron-builder notarization](https://www.electron.build/v26/docs/features/code-signing/notarization/)); upload DMG, ZIP, blockmaps and `latest-mac.yml` to the draft release with explicit `publish: { provider: github, owner: Savas07, repo: bruteforcehr-releases }`. |
| `desktop-win` | windows-latest | electron-builder **NSIS x64** installer, **unsigned**; `win.verifyUpdateCodeSignature` left without a `publisherName`, so `app-update.yml` carries none; upload `.exe`, `.blockmap`, `latest.yml`. |
| `ios` | macos-26 | `pnpm --filter @bfhr/ios exec expo prebuild --platform ios --clean` ([Expo prebuild](https://docs.expo.dev/workflow/prebuild/)) → fastlane: `app_store_connect_api_key` ([docs](https://docs.fastlane.tools/actions/app_store_connect_api_key)), automatic signing via the API key (cloud-managed distribution certificate) → `build_app` → `upload_to_testflight` with release notes, `skip_waiting_for_build_processing: true` ([upload_to_testflight](https://docs.fastlane.tools/actions/upload_to_testflight/)). Build number = `GITHUB_RUN_NUMBER`; marketing version = `X.Y.Z`. Distribution to the internal tester group only. |
| `publish` | ubuntu-latest | `needs: [backend, desktop-mac, desktop-win, ios]`. Only when all are green: publish the draft (as **pre-release** for beta tags), then write `appConfig/{platform}` (`macos`, `windows`, `ios`) with `latestVersion`, `minSupportedVersion` (raised only by an explicit changeset flag), `releaseNotesUrl`, `publishedAt` using the Admin SDK. `appConfig` is public-read, server-write (Firestore layout in [0002-data-model.md](0002-data-model.md)). |
| `website` | ubuntu-latest | Runs on `release: published` in `bruteforcehr-releases` (via `repository_dispatch` back to the source repo): build Astro (download page and changelog read the GitHub Releases API at build time) and `firebase deploy --only hosting`. |

If any build job fails, the draft stays unpublished; the backend job may already have deployed, which is safe because backend changes are expand-only.

### 3. Client update behaviour

**Desktop (electron-updater, GitHub provider → `Savas07/bruteforcehr-releases`)**
- Checks at launch and every 6 h; downloads in the background; shows a non-blocking "Restart to update" with release notes; installs on quit; never interrupts unsaved edits.
- Channel setting **Stable / Beta** (`allowPrerelease` for beta). Staged rollouts via `stagingPercentage` in `latest*.yml`.
- **macOS:** signed + notarized; Squirrel.Mac requires the signature to match the running app's Team ID, so updates are verified by the OS.
- **Windows (unsigned until a certificate exists):**
  - Installer shows the **SmartScreen "Windows protected your PC"** warning on first install ("More info → Run anyway") ([SmartScreen reputation for app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)).
  - Auto-updates **work** but the downloaded installer is **not Authenticode-verified** (no `publisherName`). Integrity then rests on HTTPS to GitHub plus the SHA-512 in `latest.yml`; anyone who can publish to `Savas07/bruteforcehr-releases` can ship code to installed Windows clients. Mitigations: release repo write access limited to the owner and the CI token, 2FA, branch/tag protection, `owner`/`repo` set explicitly in the publish config (never inferred — see [electron-builder update feed ownership](https://www.electron.build/docs/features/security/)), and the repo is never renamed or deleted while builds are installed.
  - When a certificate is added: set `publisherName`, ship one release signed with it; from then on every update is verified. Unsigned clients accept the first signed update (no `publisherName` yet) and enforce verification afterwards.
- **iOS:** TestFlight automatic updates, plus an in-app check against `appConfig/ios`: banner "Update available in TestFlight" when `latestVersion` > installed; blocking screen when installed < `minSupportedVersion`.

### 4. Channels

| Channel | Source | Desktop | iOS |
|---|---|---|---|
| Stable | published, non-pre-release GitHub Release | default | TestFlight internal group |
| Beta | GitHub pre-release `vX.Y.Z-beta.N` | opt-in in Settings | same TestFlight group (iOS has one channel) |

The 90-day TestFlight expiry means **at least one release every ~80 days**; `publish` records `publishedAt` in `appConfig/ios` and a scheduled CI workflow opens an issue when the latest iOS build is older than 75 days. App Store distribution (also release-triggered) is the later alternative if the app is shared publicly.

### 5. Rollback

- **Never delete** a published release that clients may have installed; ship `X.Y.Z+1` with the revert.
- Halt a bad desktop rollout by editing `latest*.yml` `stagingPercentage` to 0 in the release assets.
- iOS: expire the bad build in App Store Connect → TestFlight; testers keep the previous build installable.
- Backend: Functions roll back by redeploying the previous tag's `backend` job (re-run workflow on the old tag with `--only functions`). Rules roll back the same way. Data changes are expand-only so no data rollback is needed.
- Website: `firebase hosting:rollback` or redeploy the previous tag.
- Raise `minSupportedVersion` only after the fix is out, never as a rollback tool.

### 6. Secrets inventory (CI only, GitHub Actions secrets on `Savas07/bruteforcehr`)

| Secret | Used by | Source |
|---|---|---|
| `RELEASES_REPO_TOKEN` (fine-grained PAT, contents:write on `bruteforcehr-releases` only) | desktop-mac, desktop-win, publish | GitHub settings |
| `FIREBASE_SERVICE_ACCOUNT` (JSON key or Workload Identity Federation config for a deploy-only service account) | backend, publish, website | GCP IAM (created by the owner; agents never change IAM) |
| `MAC_CSC_LINK` (base64 `.p12` of **Developer ID Application** cert + key), `MAC_CSC_KEY_PASSWORD` | desktop-mac | Apple Developer → Certificates |
| `APPLE_API_KEY` (`.p8` content), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | desktop-mac (notarytool), ios (fastlane) | App Store Connect → Users and Access → Integrations → Keys ([Creating API keys](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)) |
| `APPLE_TEAM_ID` | ios, desktop-mac | Apple Developer → Membership |
| (later) Windows signing credentials | desktop-win | OV cert on cloud HSM, or Artifact Signing if eligibility changes |

Runtime secrets (`BREVO_API_KEY`, `ANTHROPIC_API_KEY`, OAuth client secrets, token-encryption key, job API keys) live in **Secret Manager** via `firebase functions:secrets:set`, not in GitHub. Setup steps: [runbooks/accounts.md](../runbooks/accounts.md). None of these ever ship in a client bundle.

## Consequences

- One tag drives every platform; a failed platform blocks publication, so versions stay aligned.
- Windows users see a SmartScreen warning on first install and Windows updates are unverified beyond HTTPS + hash. Accepted by the owner for personal use; **must be revisited before sharing the app** (see Alternatives).
- iOS needs a release at least every 90 days or the app stops launching from TestFlight.
- macOS CI needs paid-minute macOS runners (private repo); two macOS jobs per release.
- electron-builder stays on 26.x; moving to 27 adds Ed25519-signed manifests (needs a key in CI) — revisit when 27 is stable.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Azure Artifact Signing for Windows** (brief default) | Owner is an individual in Turkey: individuals must be in US/Canada; organizations must be in a listed country (Turkey isn't) ([quickstart prerequisites](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)). |
| **OV certificate on cloud HSM now** | Paid yearly certificate + HSM service; postponed by the owner until the app is shared. Path stays open (electron-builder `win.sign` supports signtool/HSM). |
| **Self-signed Windows certificate** | Not trusted by Windows; SmartScreen still warns and `publisherName` verification would only pin our own cert, adding complexity with no user-visible benefit. |
| **Publishing binaries in the private source repo** | Clients would need a GitHub token (BRIEF §2.7). |
| **EAS Build/Submit for iOS** | Acceptable per brief, but adds an Expo account and build credits; fastlane on the GitHub macOS runner keeps everything in one CI. |
| **fastlane match for iOS signing** | Needs a separate encrypted certificates repo + password; App Store Connect API-key automatic signing is enough for one developer. |
| **Sideloading (AltStore/SideStore)** | Requires weekly re-signing, not a supported distribution channel (BRIEF §3). |
| **release-please instead of Changesets** | Both work; Changesets handles a monorepo with one shared version simply via `fixed` groups. |
