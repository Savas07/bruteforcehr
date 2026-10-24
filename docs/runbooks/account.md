# Runbook — account data: export and deletion

Settings › Data & privacy offers **Export everything** and **Delete account** (brief §4.9, privacy policy "Your choices and rights"). Both are callables of the `default` functions codebase, region europe-west1. Contracts: `packages/core/src/account/index.ts`; implementation: `apps/functions/src/account/`.

## What belongs to a user

`userDataRoots(uid)` in `packages/api/src/paths.ts` is the single list of Firestore trees holding one user's data: `users/{uid}` with every subcollection, and the per-user `serverOnly` trees (`aiUsage`, `jobAlerts`, `jobQuota`, `mail`, `accountExport`). Storage: everything under `userStoragePrefix(uid)` = `users/{uid}/`. A feature that stores per-user data anywhere else must add its root there; the emulator test `src/account/account.emulator.test.ts` fails when a `users/{uid}/…` collection in `DOCUMENT_PATTERNS` has no seeded document.

## Export everything (`accountExport`)

- Input `{}`. Output `AccountExportResponse`: `storagePath`, `fileName`, `sizeBytes`, counts, `createdAt`, `expiresAt`.
- Builds one ZIP (in memory, 2 GiB function):
  - `README.md`: contents, what's not included, list of files.
  - `data/profile.json`, `data/<collection>.json` (nested collections as `data/cvs/revisions.json`), `data/internal/<area>/<collection>.json` for the `serverOnly` trees. Each entry is `{ id, path, data }`; timestamps are ISO 8601 UTC, bytes base64.
  - `files/<path under users/{uid}/>`: CV imports, rendered PDFs/DOCX, CV photos, mail attachments, as stored.
- **Never exported:** `mailTokens` (encrypted mail credentials), the fields `devices.pushToken`, `mailAccounts.secretRef` and `jobs.embedding` (`EXPORT_EXCLUDED_*` in `export.ts`), earlier exports.
- Written to `users/{uid}/exports/{exportId}.bfhr-export.zip` (`storagePaths.accountExport`). The owner reads it with the Storage SDK (rule `users/{uid}/**` read); no signed URL, so the functions' service account needs no `signBlob` permission. A new export deletes the previous ones first.
- **Expiry:** the bucket lifecycle rule `firebase/storage.lifecycle.json` deletes objects under `users/` ending in `.bfhr-export.zip` 7 days after creation (`ACCOUNT_EXPORT_LIMITS.availableDays`; Cloud Storage runs lifecycle actions asynchronously, usually within a day of the age being reached). The apps stop offering the download at `expiresAt`. Apply or check the rule:
  ```sh
  gcloud storage buckets update gs://bruteforcehr.firebasestorage.app --lifecycle-file=firebase/storage.lifecycle.json
  gcloud storage buckets describe gs://bruteforcehr.firebasestorage.app --format="json(lifecycle_config)"
  ```
  The suffix is reserved: no other Storage path may end in `.bfhr-export.zip` (unit test in `account.test.ts`).
- **Limits** (`ACCOUNT_EXPORT_LIMITS`): 2 minutes between exports (`export_too_soon`), 5 per UTC day (`export_daily_limit`), 300 MB of files (`export_too_large`). Counters: `serverOnly/accountExport/users/{uid}/accountExportDays/{YYYY-MM-DD}` with TTL `expireAt` (2 days; the policy is declared in `firebase/firestore.indexes.json` and goes live with the next `firestore:indexes` deploy).
- Logs: `account_export` (uid hash, size, counts, ms), `account_export_refused` (uid hash, reason).

## Delete account (`accountDelete`)

- Input `{ confirm: true }`. Needs a verified email and a **recent sign-in**: the ID token's `auth_time` at most 300 s old (`ACCOUNT_RECENT_SIGN_IN_SECONDS`), else `failed-precondition` / `recent_sign_in_required`. The apps then send a normal sign-in email link; opening it signs the same user in again with a fresh `auth_time`.
- Declares `secrets: MAIL_SECRETS`, so `revokeAllMailAccounts` can decrypt each OAuth refresh token and revoke it at Google (Microsoft has no per-app revocation endpoint: the stored token is deleted; the user can remove the app at <https://account.live.com/consent/Manage>). IMAP app passwords are deleted; the user should also delete them at their provider.
- Steps (`deleteAccount` in `delete.ts`):
  1. `deleteUserData`: revoke mail, recursive delete of every `userDataRoots` tree, delete `users/{uid}/` in Storage.
  2. Delete the Auth user.
  3. Sweep the roots and the Storage prefix once more (another signed-in device may have written with a still-valid ID token).
- **Idempotent:** a retry after a failed step finishes the rest; a call after success returns `{ deleted: true }` (a missing Auth user is not an error). The Auth user is deleted only after the data, so a user whose deletion failed can sign in and retry.
- Logs: `account_deleted` with a 16-hex SHA-256 prefix of the uid (`uidHash`), never the uid or email.
- Residual: an ID token issued before the deletion stays valid for up to an hour. A device that writes in that window after step 3 would leave an orphan document under `users/{uid}`; nobody can read it (the uid no longer exists), and re-running deletion for the uid removes it.

### Interplay with `blockPasswordSignUp` (identity codebase)

`blockPasswordSignUp` is a `beforeUserCreated` blocking function. Deleting an Auth user doesn't run it. After deletion:

- Signing in again with the same email through an email link creates a **new** user (new uid, `emailLink` event: allowed) with no data; nothing of the old account comes back.
- A password sign-up for that email is still refused (`permission-denied`).
- Re-authentication before deleting signs in an existing user, which is not a creation, so the blocking function isn't involved.
  The live check below exercises all three.

## Deploy

```sh
firebase deploy --only functions:default:accountExport,functions:default:accountDelete --project bruteforcehr
```

## Live check

`pnpm --filter @bfhr/functions smoke:account` (needs `gcloud auth application-default login` as the owner): creates a throwaway user through a real email link, writes a document into every user collection and `serverOnly` tree plus a file into every Storage area, calls `accountExport` over HTTPS, downloads and inspects the ZIP (expected files, no secrets), checks the `recent_sign_in_required` path with an old token, calls `accountDelete`, verifies that no document, file or Auth user remains, and checks the `blockPasswordSignUp` interplay (new email-link sign-in gets a fresh uid; password sign-up refused). Prints PASS/FAIL per step.

## Support

Users who can't finish a deletion (for example lost access to their email) open an issue on `Savas07/bruteforcehr-releases` without personal data. The owner can run the deletion for a uid with the Admin SDK: `deleteAccount` from `apps/functions/src/account/delete.ts` (see `scripts/smoke-account.ts` for the setup).
