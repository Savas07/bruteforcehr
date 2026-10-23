# Runbook — releases and the CI secrets inventory

The pipeline itself is specified in [ADR 0004](../adr/0004-release-updates-signing.md). The client stack is in [ADR 0007](../adr/0007-native-ios-tauri-desktop.md). This runbook covers the **secrets inventory** (BRIEF §7.5), the one-time setup, releasing, dry runs and rollback.

Releases are GitHub Releases of the **public** source repo `Savas07/bruteforcehr` (BRIEF §0: the source repo is the public releases repo when it's public). `Savas07/bruteforcehr-releases` is unused.

**Every secret below is CI-only.** They are GitHub Actions secrets on `Savas07/bruteforcehr` (Settings → Secrets and variables → Actions), read only by `release.yml` jobs. None of them goes into a client bundle, Firestore, chat or a commit. How to create each Apple value: [accounts.md](accounts.md) §6. Runtime secrets of the functions (Brevo, Anthropic, OAuth, job APIs) are in Secret Manager, not here ([accounts.md](accounts.md) §1–5).

## Secrets inventory

Status on 2026-10-23: **set** = configured; **pending** = the owner doesn't have it yet. A pending secret is not an error: the job that would use it logs `skipped: <what>, secret(s) <NAMES> not configured` and takes the fallback in the last column. Adding the secret turns the feature on at the next release, with no workflow change.

| GitHub secret | Status | What it is | Jobs | Passed to the tool as | Created in | Rotation / expiry | Without it |
|---|---|---|---|---|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | **set** | Contents of the updater private key (`tauri signer generate`, password-protected, key id `C39774B86CA8CBE9`). Its public half is committed in `tauri.conf.json` → `plugins.updater.pubkey` | `desktop-mac`, `desktop-win` | env `TAURI_SIGNING_PRIVATE_KEY` ([Tauri updater](https://v2.tauri.app/plugin/updater/)) | owner's Mac, 2026-10-23; offline backup in `~/.bruteforcehr/updater/` (below) | **Never lose it**: installed apps only accept updates signed with it. If it leaks, rotate by shipping one release signed with the old key that carries the new public key, then swap the secret. | Required: the desktop jobs fail. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | **set** | Password of that key | `desktop-mac`, `desktop-win` | env `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | generated with the key | with the key | Required. |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | **set** | `projects/33654863934/locations/global/workloadIdentityPools/github/providers/bruteforcehr-repo` (an identifier, not a credential) | `backend`, `publish`, `website` | [`google-github-actions/auth`](https://github.com/google-github-actions/auth) `workload_identity_provider` → short-lived Application Default Credentials, which the Firebase CLI recommends for CI ([Firebase CLI — CI systems](https://firebase.google.com/docs/cli)) | Google Cloud IAM, 2026-10-23 (below) | No key to rotate. | Required. |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | **set** | `github-deployer@bruteforcehr.iam.gserviceaccount.com` | `backend`, `publish`, `website` | `service_account` of the same action | same | none | Required. |
| `APPLE_CERTIFICATE` | pending | Base64 (`openssl base64 -A`) of the **Developer ID Application** `.p12` (certificate + private key) | `desktop-mac` | Tauri `APPLE_CERTIFICATE`; Tauri imports it into a temporary keychain | Apple Developer → Certificates ([accounts.md §6.3](accounts.md#6-apple-macos-signingnotarization--ios-testflight)) | Renew before the expiry shown in Certificates, Identifiers & Profiles. Re-export and replace all three certificate secrets. | Ad-hoc signed app (`APPLE_SIGNING_IDENTITY=-`): Gatekeeper blocks the first open; System Settings → Privacy & Security → **Open Anyway**. |
| `APPLE_CERTIFICATE_PASSWORD` | pending | Password of that `.p12` | `desktop-mac` | Tauri `APPLE_CERTIFICATE_PASSWORD` | set by you at export | with the certificate | as above |
| `APPLE_SIGNING_IDENTITY` | pending | `Developer ID Application: <Name> (<TEAMID>)` | `desktop-mac` | Tauri `APPLE_SIGNING_IDENTITY` | `security find-identity -v -p codesigning` | with the certificate | as above |
| `APPLE_API_KEY_P8` | pending | Contents of the App Store Connect API private key `AuthKey_<KEYID>.p8`, role **Admin** | `desktop-mac` (notarization), `ios` (cloud signing, upload, "What to Test") | written to `$RUNNER_TEMP/AuthKey.p8` (deleted in an `always()` step) → Tauri `APPLE_API_KEY_PATH`; `xcodebuild -authenticationKeyPath`; `testflight-notes` | App Store Connect → Users and Access → Integrations ([Creating API keys](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)) | Revoke and regenerate if exposed. The `.p8` downloads only once. | No notarization; `ios` builds an unsigned device archive and uploads nothing. |
| `APPLE_API_KEY_ID` | pending | Key ID of that key | `desktop-mac`, `ios` | Tauri `APPLE_API_KEY` (Tauri expects the **Key ID** in this variable — [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/)); `xcodebuild -authenticationKeyID` | same | with the key | as above |
| `APPLE_API_ISSUER` | pending | Issuer ID | `desktop-mac`, `ios` | Tauri `APPLE_API_ISSUER`; `xcodebuild -authenticationKeyIssuerID` | same | none | as above |
| `APPLE_TEAM_ID` | pending | 10-character Apple team ID (`67NPXV7CSZ` in the Xcode project; not really secret, kept with the others) | `ios` | `teamID` in the generated `ExportOptions.plist`, `DEVELOPMENT_TEAM` | Apple Developer → Membership | none | No TestFlight upload. |
| _(later)_ Windows signing credentials | — | OV certificate on a cloud HSM, or Artifact Signing if eligibility changes | `desktop-win` | Tauri `bundle.windows.signCommand` ([Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/)) | [accounts.md §8](accounts.md#8-windows-code-signing-later-before-sharing) | per CA | Unsigned installer, SmartScreen warning (accepted, ADR 0004). |

No GitHub token secret is needed: the release lives in the same repo, so jobs use the workflow's `GITHUB_TOKEN` with per-job permissions (`contents: write` only in `prepare` and `publish`).

Not secrets and committed: the updater **public** key (`tauri.conf.json`), `GoogleService-Info.plist` and the Firebase web config (client config). `ExportOptions.plist` is generated by the `ios` job.

Rules for the workflow:

- Secrets are exposed only as `env` on the step that needs them. Files written from secrets (`.p8`) live in `$RUNNER_TEMP` and are deleted in an `if: always()` step.
- Real releases run only on `v*` tags (pushed by `version.yml` or the owner). `pull_request` workflows never get these secrets, and pull requests from forks get neither secrets nor an OIDC token for Workload Identity Federation.

### Updater key offline backup

`~/.bruteforcehr/updater/` on the owner's Mac (directory `700`, files `600`):

- `bruteforcehr-updater.key` — the private key (minisign, encrypted with the password)
- `bruteforcehr-updater.key.password` — its password
- `bruteforcehr-updater.key.pub` — the public key (same as `plugins.updater.pubkey`)

Copy the directory to an offline medium (encrypted USB stick or password manager attachment) and keep it apart from the Mac. To restore the GitHub secrets: `gh secret set TAURI_SIGNING_PRIVATE_KEY --repo Savas07/bruteforcehr < ~/.bruteforcehr/updater/bruteforcehr-updater.key` and the same for the password file (strip the trailing newline: `tr -d '\n' < …key.password | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo Savas07/bruteforcehr`).

### Firebase deploy identity (Workload Identity Federation)

Created on 2026-10-23 in project `bruteforcehr` (number `33654863934`); roles and their reasons: [ADR 0004 §6](../adr/0004-release-updates-signing.md#6-secrets).

```sh
gcloud iam workload-identity-pools describe github --location=global --project bruteforcehr
gcloud iam workload-identity-pools providers describe bruteforcehr-repo --workload-identity-pool=github --location=global --project bruteforcehr
gcloud projects get-iam-policy bruteforcehr --flatten=bindings --filter="bindings.members:github-deployer@" --format="value(bindings.role)"
gcloud iam service-accounts get-iam-policy github-deployer@bruteforcehr.iam.gserviceaccount.com --project bruteforcehr
# resource-level grants: actAs on the two accounts the functions deploy uses, bucket metadata for Storage rules
gcloud iam service-accounts get-iam-policy 33654863934-compute@developer.gserviceaccount.com --project bruteforcehr
gcloud iam service-accounts get-iam-policy bruteforcehr@appspot.gserviceaccount.com --project bruteforcehr
gcloud storage buckets get-iam-policy gs://bruteforcehr.firebasestorage.app
```

The provider accepts only tokens whose `repository` is `Savas07/bruteforcehr` **and** whose `repository_id` is `1429601845` (a deleted and re-created repo with the same name doesn't match). Only that repository's principal set may impersonate `github-deployer`. The `gcf-artifacts` repository in `europe-west1` has a cleanup policy (images older than 1 day), so `firebase deploy` doesn't need `--force`.

**Deploying the `auth` functions codebase** (when Brevo exists, [accounts.md §1](accounts.md#1-brevo-transactional-email-for-sign-in-codes)): deploy it once by hand as the owner (`firebase deploy --only functions:auth`), which also grants the runtime service account access to `BREVO_API_KEY` and `OTP_PEPPER`. To let CI deploy it afterwards, grant `github-deployer` `roles/secretmanager.admin` **on those two secrets only** (the CLI reads their versions and manages the runtime account's access), then add `functions:auth` to the `backend` job's `--only` list and remove its `skipped:` line.

## One-time setup

Done on 2026-10-23: updater key + secrets, WIF pool/provider/service account + secrets, **Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"** (needed by `changesets/action` for the version PR). The `updater-beta` pre-release is created by the first `publish`.

Owner, when available: the Apple secrets above ([accounts.md §6](accounts.md#6-apple-macos-signingnotarization--ios-testflight)); in App Store Connect → TestFlight, an internal group with **automatic distribution** so new builds reach testers without a click.

## Releasing

1. Add a changeset to every user-facing PR: `pnpm changeset` (any `@bfhr/*` package; one fixed group, so the whole app moves together).
2. On merge to `main`, `version.yml` opens or updates the **"chore: version packages"** PR (versions + CHANGELOG.md files). A PR opened with `GITHUB_TOKEN` doesn't start `ci.yml`; close and reopen it if you want CI on it.
3. Merge that PR. `version.yml` then tags `vX.Y.Z`, creates the **draft** release with the notes and starts `release.yml` on the tag.
4. `release.yml` runs `prepare` → `verify` (full CI) + `desktop-mac` + `desktop-win` + `ios` → `backend` → `publish` → `website`. It is green only when every job passed. A failed job leaves the draft unpublished; fix forward with a new patch version.
5. **Beta:** `pnpm changeset pre enter beta`, merge the version PR, then push the tag yourself: `git tag v0.2.0-beta.0 && git push origin v0.2.0-beta.0` (the tag must equal `apps/desktop/package.json`'s version). The release is published as a pre-release and only `updater-beta` gets its manifest. `pnpm changeset pre exit` returns to stable versions.
6. Check:
   - The release page lists `BruteForceHR_X.Y.Z_universal.dmg`, `…_universal.app.tar.gz` + `.sig`, `…_x64-setup.exe` + `.sig`, `latest.json` and `SHA256SUMS.txt`.
   - `curl -sL https://github.com/Savas07/bruteforcehr/releases/latest/download/latest.json` shows `X.Y.Z` (stable); `https://github.com/Savas07/bruteforcehr/releases/download/updater-beta/latest.json` shows the newest stable or beta.
   - `appConfig/macos` and `appConfig/windows` show `latestVersion: X.Y.Z` (and `appConfig/ios` once TestFlight uploads run).
   - TestFlight shows build `X.Y.Z (<run number>)` (once the Apple secrets exist).
   - `https://bruteforcehr.web.app/download` shows `X.Y.Z`.
7. M1 acceptance (BRIEF §7): install `v0.1.0` on clean macOS and Windows, publish `v0.1.1`, confirm both update with only "Restart", TestFlight gets `0.1.1`, and the website shows `0.1.1`.

**Raising `minSupportedVersion`:** edit `scripts/release/min-supported-versions.json` in the PR that needs it (never above the version being released; `publish` refuses that). It takes effect with that release's `appConfig` write.

## Dry run

Builds and signs everything, verifies the updater signatures, assembles `latest.json` + `SHA256SUMS.txt` (artifact `release-assets-dry-run`, kept 14 days), checks the deploy identity (`firebase projects:list`, `firebase deploy --dry-run`, a read of `appConfig`) — and publishes, tags, uploads and deploys nothing.

```sh
# release.yml already on main:
gh workflow run release.yml --ref main -f dry_run=true -f version=0.1.0
# testing pipeline changes on a branch (workflow_dispatch only sees workflows on main):
git push origin HEAD:refs/heads/release-dry-run/0.1.0
gh run download <run-id> -n release-assets-dry-run
```

Delete the `release-dry-run/*` branch afterwards. First green dry run of the whole pipeline (v0.1.0, without Apple secrets): run [39877762524](https://github.com/Savas07/bruteforcehr/actions/runs/39877762524).

## Halting and rolling back

See [ADR 0004](../adr/0004-release-updates-signing.md) §5. To stop desktop clients picking up a bad `vX.Y.Z`, replace its `latest.json` (and the one on `updater-beta`) with the previous release's:

```sh
gh release download vX.Y.(Z-1) --repo Savas07/bruteforcehr --pattern latest.json --dir /tmp/prev
gh release upload vX.Y.Z --repo Savas07/bruteforcehr /tmp/prev/latest.json --clobber
gh release upload updater-beta --repo Savas07/bruteforcehr /tmp/prev/latest.json --clobber
```

Then ship `X.Y.Z+1`. Never delete a published release.
