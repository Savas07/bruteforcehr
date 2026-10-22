# Runbook — releases and the CI secrets inventory

The pipeline itself is specified in [ADR 0004](../adr/0004-release-updates-signing.md). The client stack is in [ADR 0007](../adr/0007-native-ios-tauri-desktop.md). This runbook covers the **secrets inventory** (BRIEF §7.5), the one-time setup and the release procedure.

**Every secret below is CI-only.** They are stored as GitHub Actions secrets on the private source repo `Savas07/bruteforcehr` (Settings → Secrets and variables → Actions) and are read only by `release.yml` jobs. None of them goes into a client bundle, the public releases repo, Firestore, chat or a commit. How to create each Apple and Tauri value: [accounts.md](accounts.md) §6–7. Runtime secrets of the functions (Brevo, Anthropic, OAuth, job APIs) are in Secret Manager, not here ([accounts.md](accounts.md) §1–5).

## Secrets inventory

| GitHub secret | What it is | Jobs | Passed to the tool as | Created in | Rotation / expiry |
|---|---|---|---|---|---|
| `APPLE_TEAM_ID` | 10-character Apple team ID (not really secret, kept with the others) | `ios` | `teamID` in `ExportOptions.plist` / `DEVELOPMENT_TEAM` | Apple Developer → Membership ([accounts.md §6.1](accounts.md#6-apple-macos-signingnotarization--ios-testflight)) | none |
| `APPLE_API_KEY_P8` | Contents of the App Store Connect API private key `AuthKey_<KEYID>.p8`, role **Admin** | `desktop-mac` (notarization), `ios` (cloud signing, upload, "What to Test") | written to `$RUNNER_TEMP/AuthKey.p8` → Tauri `APPLE_API_KEY_PATH`; `xcodebuild -authenticationKeyPath` | App Store Connect → Users and Access → Integrations ([Creating API keys](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)) | Revoke and regenerate if exposed. The `.p8` downloads only once. |
| `APPLE_API_KEY_ID` | Key ID of that key | `desktop-mac`, `ios` | Tauri `APPLE_API_KEY` (Tauri expects the **Key ID** in this variable — [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/)); `xcodebuild -authenticationKeyID` | same | with the key |
| `APPLE_API_ISSUER` | Issuer ID | `desktop-mac`, `ios` | Tauri `APPLE_API_ISSUER`; `xcodebuild -authenticationKeyIssuerID` | same | none |
| `APPLE_CERTIFICATE` | Base64 (`openssl base64 -A`) of the **Developer ID Application** `.p12` (certificate + private key) | `desktop-mac` | Tauri `APPLE_CERTIFICATE`; Tauri imports it into a temporary keychain | Apple Developer → Certificates ([accounts.md §6.3](accounts.md#6-apple-macos-signingnotarization--ios-testflight)) | Renew before the expiry shown in Certificates, Identifiers & Profiles. Re-export and replace both cert secrets. |
| `APPLE_CERTIFICATE_PASSWORD` | Password of that `.p12` | `desktop-mac` | Tauri `APPLE_CERTIFICATE_PASSWORD` | set by you at export | with the certificate |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: <Name> (<TEAMID>)` | `desktop-mac` | Tauri `APPLE_SIGNING_IDENTITY` | `security find-identity -v -p codesigning` | with the certificate |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of the updater private key (`tauri signer generate`). Its public half is committed in `tauri.conf.json` → `plugins.updater.pubkey` | `desktop-mac`, `desktop-win` | env `TAURI_SIGNING_PRIVATE_KEY` ([Tauri updater](https://v2.tauri.app/plugin/updater/)) | your Mac ([accounts.md §7](accounts.md#7-tauri-updater-signing-key-desktop-auto-update)) | **Never lose it**: installed apps only accept updates signed with it. Keep an offline backup. If it leaks, rotate by shipping one release signed with the old key that carries the new public key, then swap the secret. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password of that key | `desktop-mac`, `desktop-win` | env `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | set at generation | with the key |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` + `GCP_DEPLOY_SERVICE_ACCOUNT` (preferred) **or** `FIREBASE_SERVICE_ACCOUNT` (JSON key, fallback) | Firebase deploy credentials for a **deploy-only** service account in project `bruteforcehr` | `backend` (rules, indexes, Storage rules, functions), `publish` (Admin SDK write to `appConfig/*`), `website` (Hosting) | [`google-github-actions/auth`](https://github.com/google-github-actions/auth) (`workload_identity_provider` + `service_account`, or `credentials_json`) → Application Default Credentials, which the Firebase CLI recommends for CI ([Firebase CLI — CI systems](https://firebase.google.com/docs/cli)) | **Owner** in Google Cloud IAM (agents never change IAM or billing) | WIF has no key to rotate. A JSON key: rotate yearly and delete the old key. |
| `RELEASES_REPO_TOKEN` | Fine-grained PAT, repository access **only** `Savas07/bruteforcehr-releases`, permission **Contents: read and write** (needed to create, publish and upload release assets — [Releases API](https://docs.github.com/en/rest/releases/releases); [Release assets API](https://docs.github.com/en/rest/releases/assets)) | `desktop-mac`, `desktop-win`, `publish` | `GH_TOKEN` for `gh release …` | GitHub → Settings → Developer settings → Fine-grained tokens | Set an expiry (≤ 1 year) and a calendar reminder 2 weeks before. |
| *(later)* Windows signing credentials | OV certificate on a cloud HSM, or Artifact Signing if eligibility changes | `desktop-win` | Tauri `bundle.windows.signCommand` ([Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/)) | [accounts.md §8](accounts.md#8-windows-code-signing-later-before-sharing) | per CA |

Not secrets and committed: the updater **public** key (`tauri.conf.json`), `GoogleService-Info.plist` and the Firebase web config (client config), and `apps/ios/ExportOptions.plist` (contains no keys).

Rules for the workflow:
- Secrets are exposed only as `env` on the step that needs them. Files written from secrets (`.p8`, keychains) live in `$RUNNER_TEMP` and are deleted in an `if: always()` step.
- Release jobs run only on tags pushed by the owner. `pull_request` workflows never get these secrets.
- `bruteforcehr-releases` access: only the owner (2FA) and `RELEASES_REPO_TOKEN`. Tag protection on `v*`.

## One-time setup

1. Create the secrets above ([accounts.md](accounts.md) §6–7) and the deploy credential (owner, GCP console).
2. In `Savas07/bruteforcehr-releases`, create the long-lived **pre-release `updater-beta`** (the beta channel manifest — [ADR 0004](../adr/0004-release-updates-signing.md) §3):
   ```sh
   gh release create updater-beta --repo Savas07/bruteforcehr-releases --prerelease --title "Beta update channel" --notes "Update manifest for the beta channel. Not a version."
   ```
   It must stay a pre-release so it never becomes "latest" ([Releases REST API](https://docs.github.com/en/rest/releases/releases): "Drafts and prereleases cannot be set as latest").
3. Commit the updater public key to `apps/desktop/src-tauri/tauri.conf.json` → `plugins.updater.pubkey`, with `bundle.createUpdaterArtifacts: true` and the stable endpoint `https://github.com/Savas07/bruteforcehr-releases/releases/latest/download/latest.json`.

## Releasing

1. Merge the Changesets "Version packages" PR. It bumps `X.Y.Z` in every app's `package.json` (Tauri reads `@bfhr/desktop`'s via `"version": "../package.json"`) and pushes `vX.Y.Z`. For a beta, tag `vX.Y.Z-beta.N` (iOS still gets the numeric `MARKETING_VERSION=X.Y.Z`).
2. `release.yml` runs: `verify` → `backend`, `desktop-mac`, `desktop-win`, `ios` → `publish` → `website`. It is green only when every job passed. A failed build leaves the draft unpublished.
3. Check:
   - The release page lists the DMG, `…universal.app.tar.gz` + `.sig`, `…x64-setup.exe` + `.sig` and `latest.json`.
   - `curl -sL https://github.com/Savas07/bruteforcehr-releases/releases/latest/download/latest.json` shows `X.Y.Z` (stable), or the `updater-beta` asset shows it (beta).
   - TestFlight shows build `X.Y.Z (<run number>)`.
   - `https://bruteforcehr.web.app/download` shows `X.Y.Z`.
4. M1 acceptance (BRIEF §7): install `v0.1.0` on clean macOS and Windows, publish `v0.1.1`, confirm both update with only "Restart", TestFlight gets `0.1.1`, and the website shows `0.1.1`.

## Halting and rolling back

See [ADR 0004](../adr/0004-release-updates-signing.md) §5. To stop desktop clients picking up a bad `vX.Y.Z`, replace its `latest.json` (and the one on `updater-beta`) with the previous release's:

```sh
gh release download vX.Y.(Z-1) --repo Savas07/bruteforcehr-releases --pattern latest.json --dir /tmp/prev
gh release upload vX.Y.Z --repo Savas07/bruteforcehr-releases /tmp/prev/latest.json --clobber
gh release upload updater-beta --repo Savas07/bruteforcehr-releases /tmp/prev/latest.json --clobber
```

Then ship `X.Y.Z+1`. Never delete a published release.
