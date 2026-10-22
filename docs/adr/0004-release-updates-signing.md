# ADR 0004 — Release pipeline, auto-update and code signing

- **Status:** Accepted (revised 2026-10-22 for the client stack switch in [ADR 0007](0007-native-ios-tauri-desktop.md): Tauri 2 desktop, native SwiftUI iOS; the earlier electron-builder/electron-updater and `expo prebuild` + fastlane jobs are removed)
- **Date:** 2026-10-22
- **Supersedes:** BRIEF.md §7 (adapted to Firebase, Tauri and native iOS) and the Windows-signing part of BRIEF §3
- **Related:** [0001-stack.md](0001-stack.md), [0006-hosting-domains.md](0006-hosting-domains.md), [0007-native-ios-tauri-desktop.md](0007-native-ios-tauri-desktop.md), [runbooks/release.md](../runbooks/release.md) (secrets inventory), [runbooks/accounts.md](../runbooks/accounts.md)

## Context

- BRIEF §2.2: **GitHub Releases are the single source of truth for versions.** Publishing one release must update the desktop apps, ship iOS to TestFlight, deploy backend changes and refresh the website download page.
- The source repo `Savas07/bruteforcehr` is **private**. Updating from a private repo would need a GitHub token inside the app (forbidden, BRIEF §2.7), so binaries and the update manifest go to the **public** repo `Savas07/bruteforcehr-releases`.
- The backend is Firebase (ADR 0001): Firestore rules and indexes, Storage rules, Cloud Functions gen2 (`europe-west1`) and Hosting (`bruteforcehr.web.app`).
- **iOS can't self-update** outside TestFlight/App Store: App Review Guideline 2.5.2 forbids downloading executable code ([App Review Guidelines §2.5.2](https://developer.apple.com/app-store/review/guidelines/#software-requirements)). TestFlight builds are **active for 90 days** ([TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/); [Tech Talk "Get started with TestFlight"](https://developer.apple.com/videos/play/tech-talks/110343/)), and internal testers get builds without Beta App Review ([TestFlight](https://developer.apple.com/testflight/)).
- **iOS CI signing:** `xcodebuild` authenticates with an App Store Connect API key through `-authenticationKeyPath`, `-authenticationKeyID` and `-authenticationKeyIssuerID`, together with `-allowProvisioningUpdates` (`man xcodebuild`, Xcode 26.6). Automatic signing can use **cloud signing**, where certificates are "created and managed on Apple servers" and "accessible only to members of your development team with the Admin role" ([Xcode 13 release notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-13-release-notes); [Cloud-managed certificates](https://developer.apple.com/help/account/certificates/cloud-managed-certificates)). `-exportArchive` options (from `xcodebuild -help`): `method` `app-store-connect`, `destination` `upload`, `manageAppVersionAndBuildNumber` (default YES), `testFlightInternalTestingOnly`.
- **macOS:** software distributed outside the Mac App Store must be signed with Developer ID and notarized ([Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)). Tauri signs from `APPLE_CERTIFICATE` (base64 `.p12`) + `APPLE_CERTIFICATE_PASSWORD` (+ `APPLE_SIGNING_IDENTITY`), and notarizes through the App Store Connect API using `APPLE_API_ISSUER`, `APPLE_API_KEY` (**the Key ID**) and `APPLE_API_KEY_PATH` (path to the `.p8`) ([Tauri macOS code signing](https://v2.tauri.app/distribute/sign/macos/)). `--target universal-apple-darwin` builds one universal app ([Tauri CLI](https://v2.tauri.app/reference/cli/)).
- **Windows signing isn't available to this owner now.** Azure Artifact Signing Public Trust is limited to organizations in listed countries and **individuals in the US or Canada** ([Artifact Signing quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart); [FAQ](https://learn.microsoft.com/azure/artifact-signing/faq)). The owner is an individual in Turkey, and an OV certificate on a cloud HSM is postponed until the app is shared (kickoff).
- **Tauri updater:** every update must carry a signature made with our private key, and verification "cannot be disabled". With `bundle.createUpdaterArtifacts: true` and `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD`) set, `tauri build` writes `myapp.app.tar.gz` + `.sig` on macOS and `myapp-setup.exe` + `.sig` for NSIS on Windows. A **static `latest.json`** needs `version` and `platforms.<os>-<arch>.{url,signature}`, where `signature` is the `.sig` *content*, and "Tauri will validate the whole file before checking the version field". Endpoints can be set at runtime from Rust "such as separate release channels" ([Tauri updater](https://v2.tauri.app/plugin/updater/)). The signatures are minisign/Ed25519 ([ADR 0007](0007-native-ios-tauri-desktop.md)).
- **GitHub "latest":** `/releases/latest/download/<asset>` resolves to the latest release ([Linking to releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)), which is "the most recent non-prerelease, non-draft release". `make_latest` sets it explicitly, and "drafts and prereleases cannot be set as latest" ([Releases REST API](https://docs.github.com/en/rest/releases/releases)).
- GitHub-hosted runners: `macos-26` (Apple silicon, Xcode 26.x), `windows-latest`, `ubuntu-latest` ([runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners); [macos-26-arm64 image](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md)). `github.run_number` "does not change if you re-run the workflow run" ([contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)).

## Decision

### 1. Versioning

- **Changesets** on `main`. Merging the "Version packages" PR bumps one shared version `X.Y.Z` for every app and pushes tag `vX.Y.Z`. The desktop app's `tauri.conf.json` sets `"version": "../package.json"`. The schema allows "a path to a `package.json` file containing the `version` field", and Tauri recommends managing the version in its config ([config reference](https://v2.tauri.app/reference/config/#version)). So the Changesets bump of `@bfhr/desktop` is the app version. iOS receives `X.Y.Z` as `MARKETING_VERSION` at build time.
- The tag triggers `release.yml`, which creates a **draft** release `vX.Y.Z` in `Savas07/bruteforcehr-releases` with the changeset notes. Drafts are never "latest", so updater clients can't see them.
- Pre-releases (`vX.Y.Z-beta.N`) feed the **beta** channel.

### 2. `release.yml` (on `push: tags: v*` in the private source repo)

| Job | Runner | Steps |
|---|---|---|
| `verify` | ubuntu-latest | `pnpm install --frozen-lockfile`, `turbo lint typecheck test`, Firestore/Storage rules tests on the emulator (Java is available on the runner; ADR 0001), and mail-intel/AI eval gates once they exist. Every other job `needs: verify`. |
| `backend` | ubuntu-latest | `firebase deploy --only firestore:rules,firestore:indexes,storage,functions --project bruteforcehr --non-interactive` with the deploy-only service-account credential. Changes are **expand-only**. Hosting is deployed later by `website`. |
| `desktop-mac` | macos-26 | `rustup target add aarch64-apple-darwin x86_64-apple-darwin`; `cargo clippy -- -D warnings` + `cargo test` in `src-tauri`; write the `.p8` from `APPLE_API_KEY_P8` to `$RUNNER_TEMP`; `pnpm --filter @bfhr/desktop tauri build --target universal-apple-darwin --bundles app,dmg`. Tauri env: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` ("Developer ID Application: … (TEAMID)"), `APPLE_API_ISSUER`, `APPLE_API_KEY` (= Key ID), `APPLE_API_KEY_PATH`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Tauri signs with Developer ID and notarizes. Upload the universal DMG, the updater bundle (`BruteForceHR.app.tar.gz`, renamed on upload to `BruteForceHR_X.Y.Z_universal.app.tar.gz`) and its `.sig` to the draft with `gh release upload` (`RELEASES_REPO_TOKEN`). Renaming is safe because the signature covers the file content, not its name. Then delete the `.p8` and the keychain. |
| `desktop-win` | windows-latest | `cargo clippy`/`cargo test`; `pnpm --filter @bfhr/desktop tauri build --bundles nsis` (x64), **no Authenticode signing** (no `signCommand`/`certificateThumbprint`) but with `TAURI_SIGNING_PRIVATE_KEY` + `_PASSWORD`; upload `BruteForceHR_X.Y.Z_x64-setup.exe` and its `.sig`. |
| `ios` | macos-26 | `swift test` for `packages/swift/BFHRCore` and `packages/ui-tokens/swift/BFHRDesignTokens`; `xcodebuild test` (XCUITest) on an iPhone simulator; write the `.p8` to `$RUNNER_TEMP`; then **archive**: `xcodebuild archive -project apps/ios/BruteForceHR.xcodeproj -scheme BruteForceHR -configuration Release -destination 'generic/platform=iOS' -archivePath "$RUNNER_TEMP/BruteForceHR.xcarchive" -allowProvisioningUpdates -authenticationKeyPath … -authenticationKeyID "$APPLE_API_KEY_ID" -authenticationKeyIssuerID "$APPLE_API_ISSUER" MARKETING_VERSION=X.Y.Z CURRENT_PROJECT_VERSION=$GITHUB_RUN_NUMBER`; then **upload**: `xcodebuild -exportArchive -archivePath … -exportOptionsPlist apps/ios/ExportOptions.plist -exportPath "$RUNNER_TEMP/export" -allowProvisioningUpdates` plus the same three key flags. `ExportOptions.plist`: `method` = `app-store-connect`, `destination` = `upload`, `signingStyle` = `automatic`, `teamID`, **`manageAppVersionAndBuildNumber` = `false`** (so **build number = CI run number**), `testFlightInternalTestingOnly` = `true`, `uploadSymbols` = `true`. Signing is automatic with cloud-managed distribution certificates, so the API key has the **Admin** role. After processing, the job sets "What to Test" from the release notes via App Store Connect API [`POST /v1/betaBuildLocalizations`](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-betabuildlocalizations). Distribution goes to the internal tester group only. |
| `publish` | ubuntu-latest | `needs: [backend, desktop-mac, desktop-win, ios]`. Builds `latest.json` from the uploaded `.sig` files: `version` `X.Y.Z`, `notes`, `pub_date` (RFC 3339); `platforms.darwin-aarch64` **and** `platforms.darwin-x86_64` both point at the universal `.app.tar.gz`, and `platforms.windows-x86_64` points at the `-setup.exe`. Every `url` is pinned to the tag (`…/releases/download/vX.Y.Z/<asset>`). It uploads `latest.json` to the draft and publishes it. **Stable:** `gh release edit vX.Y.Z --draft=false --latest`. **Beta tag:** `--prerelease` (never latest). It then copies the same `latest.json` to the **beta channel** pre-release `updater-beta` (`gh release upload updater-beta latest.json --clobber`) for stable *and* beta versions, so beta users also get stable releases. Finally it writes `appConfig/{macos,windows,ios}` (`latestVersion`, `minSupportedVersion` (raised only by an explicit changeset flag), `releaseNotesUrl`, `publishedAt`) with the Admin SDK. |
| `website` | ubuntu-latest | `needs: publish`, so it runs right after the release is published. It can also be started on its own through `workflow_dispatch` (e.g. after a manual release-asset fix), with no cross-repo token. It builds Astro (the download page and changelog read the public GitHub Releases API at build time and **skip the `updater-beta` release**), then runs `firebase deploy --only hosting`. |

If any build job fails, the draft stays unpublished and no `latest.json` is served. The backend job may already have deployed, which is safe because backend changes are expand-only. A re-run of the `ios` job keeps `GITHUB_RUN_NUMBER`, so if the upload already succeeded, retry with a new patch tag instead of re-running.

### 3. Client update behaviour

**Desktop (`tauri-plugin-updater`, static `latest.json` in `Savas07/bruteforcehr-releases`)**
- Endpoints:
  - **Stable:** `https://github.com/Savas07/bruteforcehr-releases/releases/latest/download/latest.json` (in `plugins.updater.endpoints`).
  - **Beta:** `https://github.com/Savas07/bruteforcehr-releases/releases/download/updater-beta/latest.json`.
  - The Settings channel (**Stable / Beta**) picks the endpoint at runtime in Rust (`updater_builder().endpoints(…)`).
- Checks at launch and every 6 h, and downloads in the background (`download`). Shows a non-blocking "Restart to update" with the release notes. `install` + `relaunch` run only on that action or at quit, and never interrupt unsaved edits. On Windows, "Tauri will automatically quit your application before installing updates", so pending writes are flushed in `on_before_exit`. `windows.installMode` is `passive` ([Tauri updater](https://v2.tauri.app/plugin/updater/)).
- **Integrity on every OS:** the updater refuses any bundle whose Ed25519 signature doesn't match the embedded public key. **macOS** bundles are also Developer ID-signed and notarized.
- **Windows (unsigned until a certificate exists):**
  - The first install shows the **SmartScreen "Windows protected your PC"** warning ("More info → Run anyway") ([SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation); Tauri notes signing prevents it — [Windows code signing](https://v2.tauri.app/distribute/sign/windows/)).
  - Updates **are** verified: someone with write access to the releases repo but without the updater private key can't push code to installed clients. The trust anchor becomes the updater private key (CI secret + offline backup, [runbooks/release.md](../runbooks/release.md)).
  - When a certificate is added: configure `bundle.windows.certificateThumbprint` or `signCommand` (Azure Key Vault/Artifact Signing via `signCommand` — [Windows code signing](https://v2.tauri.app/distribute/sign/windows/)). Updater signatures are independent and keep working.
- **No staged rollout percentage:** the static `latest.json` has no equivalent of `stagingPercentage`. A rollout reaches all clients of the channel at their next check. A dynamic update server (a Cloud Function answering 200/204 per client — [Tauri updater](https://v2.tauri.app/plugin/updater/)) is the path if staging is ever needed.
- **iOS:** TestFlight automatic updates, plus an in-app check against `appConfig/ios`: a banner "Update available in TestFlight" when `latestVersion` > installed, and a blocking screen when installed < `minSupportedVersion`.

### 4. Channels

| Channel | Source | Desktop | iOS |
|---|---|---|---|
| Stable | published, non-pre-release GitHub Release marked latest | default; `releases/latest/download/latest.json` | TestFlight internal group |
| Beta | GitHub pre-release `vX.Y.Z-beta.N`; manifest in pre-release `updater-beta` (also updated for stable versions) | opt-in in Settings | same TestFlight group (iOS has one channel) |

The 90-day TestFlight expiry means **at least one release every ~80 days**. `publish` records `publishedAt` in `appConfig/ios`, and a scheduled CI workflow opens an issue when the latest iOS build is older than 75 days. App Store distribution (also release-triggered) is the later alternative if the app is shared publicly.

### 5. Rollback

- **Never delete** a published release that clients may have installed. Ship `X.Y.Z+1` with the revert.
- **Halt a bad desktop release:** replace the `latest.json` asset of the bad release (and of `updater-beta`) with the previous release's `latest.json` (`gh release upload … --clobber`). The default comparator only updates when "`update.version > current`", so clients that haven't updated stay put. Clients that already updated keep the bad version until `X.Y.Z+1`.
- iOS: expire the bad build in App Store Connect → TestFlight. Testers keep the previous build installable.
- Backend: Functions roll back by redeploying the previous tag's `backend` job (re-run on the old tag with `--only functions`), and rules the same way. Data changes are expand-only, so no data rollback is needed.
- Website: `firebase hosting:rollback` or redeploy the previous tag.
- Raise `minSupportedVersion` only after the fix is out, never as a rollback tool.

### 6. Secrets

All release credentials are **CI-only** GitHub Actions secrets on `Savas07/bruteforcehr`: the Apple API key, the Developer ID certificate, the Tauri updater key + password, the Firebase deploy credential and the releases-repo token. Names, scopes, consumers and rotation are listed in **[runbooks/release.md](../runbooks/release.md)**. Runtime secrets (`BREVO_API_KEY`, `ANTHROPIC_API_KEY`, OAuth client secrets, token-encryption key, job API keys) live in **Secret Manager** ([runbooks/accounts.md](../runbooks/accounts.md)). None of them ever ship in a client bundle. Only the updater **public** key is embedded in the desktop app.

## Consequences

- One tag drives every platform. A failed platform blocks publication, so versions stay aligned.
- Windows users see a SmartScreen warning on first install. Accepted for personal use, and **must be revisited before sharing the app**. Unlike the earlier electron-updater design, Windows updates are cryptographically verified.
- The Tauri updater private key is a single point of failure: if it leaks, an attacker who can also publish to the releases repo can ship updates; if it's lost, installed clients can't update (rotation needs a release signed with the old key that embeds the new public key — runtime `pubkey` exists for that, [Tauri updater](https://v2.tauri.app/plugin/updater/)).
- No staged rollouts (see §3). Halting is manual, per §5.
- iOS needs a release at least every 90 days or the app stops launching from TestFlight.
- macOS CI needs paid-minute macOS runners (private repo): two macOS jobs per release (`desktop-mac`, `ios`).
- A Ruby/fastlane toolchain is no longer needed for iOS. `xcodebuild` handles API-key auth, cloud signing and upload natively.

## Amendment — 2026-10-22: Linux-only automatic CI

GitHub Actions stopped starting jobs on the private repo (free minutes / spending limit). The owner chose to **keep the repo private and run automatic CI on Linux only** (`ci.yml`: lint, typecheck, tests, BFHRCore `swift test` in the Swift container, security-rules emulator tests, gitleaks, audit). `desktop.yml` (macOS + Windows build, E2E, real-app captures) is **manual-only** (`workflow_dispatch`).

Consequences for M1, to be decided at M1 kickoff: the `desktop-mac`, `desktop-win` and `ios` release jobs above need macOS/Windows runner minutes. Options: (a) owner funds minutes for release runs only; (b) build, sign and notarize the macOS app and the iOS archive locally on the owner's Mac with a scripted, reproducible release command, and build Windows only via a manually triggered run; (c) make the repo public (free runners). Until then the release flow above is the target design, not an automatic one.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Azure Artifact Signing for Windows** (brief default) | Owner is an individual in Turkey. Individuals must be in the US/Canada, and organizations in a listed country (Turkey isn't) ([quickstart prerequisites](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)). |
| **OV certificate on cloud HSM now** | Paid yearly certificate + HSM service. Postponed by the owner until the app is shared. The path stays open via Tauri `signCommand`. |
| **Self-signed Windows certificate** | Not trusted by Windows, so SmartScreen still warns. Update integrity already comes from the Tauri signature. |
| **Publishing binaries in the private source repo** | Clients would need a GitHub token (BRIEF §2.7). |
| **`tauri-apps/tauri-action`** for build + upload | It can target another repo (`owner`/`repo`) and generate `latest.json` ([README](https://github.com/tauri-apps/tauri-action)). Not chosen: `publish` must merge two runners' signatures, pin URLs to the tag and copy the manifest into `updater-beta`. A small script with `gh` keeps the format under our control and testable. |
| **Dynamic update server (Cloud Function) now** | Would give staged rollouts and per-client decisions, but adds an always-on dependency to updates. Static JSON on GitHub is enough for a personal tool. |
| **fastlane (`build_app`, `upload_to_testflight`)** | Adds Ruby and gems to CI. `xcodebuild -exportArchive` with `destination=upload` and API-key auth does the same. |
| **fastlane match for iOS signing** | Needs an encrypted certificates repo + password. Cloud-managed certificates via the Admin API key are enough for one developer. |
| **Electron (electron-builder + electron-updater) and EAS/`expo prebuild`** | Removed with the stack switch ([ADR 0007](0007-native-ios-tauri-desktop.md)). |
| **Sideloading (AltStore/SideStore)** | Requires weekly re-signing; not a supported distribution channel (BRIEF §3). |
| **release-please instead of Changesets** | Both work. Changesets handles a monorepo with one shared version simply, via `fixed` groups. |
