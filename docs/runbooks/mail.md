# Runbook — Mail sync and email apply

Design: [ADR 0012](../adr/0012-mail-sync.md). Functions (codebase `default`, europe-west1): `connect` (HTTP, `/connect/**`), `mailConnectStart`, `mailConnectImap`, `mailSyncNow`, `mailBackfillStart`, `mailDisconnect`, `mailSend`, `mailSendCancel`, `mailSendNow` (callables), `mailSyncTask`, `mailSendDispatch` (task queues), `mailPoll`, `mailBodyPurge` (schedules), `mailMessageReviewed`, `mailApplicationChanged` (Firestore triggers).

## Secrets

| Secret                   | Value                                                          | Created                                |
| ------------------------ | -------------------------------------------------------------- | -------------------------------------- |
| `MAIL_TOKEN_KEYS`        | `{"current":"k1","keys":{"k1":"<base64 of 32 random bytes>"}}` | 2026-10-24 (random key, never printed) |
| `GOOGLE_OAUTH_CLIENT`    | `unset` → `{"clientId":"…","clientSecret":"…"}`                | 2026-10-24 as `unset`                  |
| `MICROSOFT_OAUTH_CLIENT` | `unset` → `{"clientId":"…","clientSecret":"…"}`                | 2026-10-24 as `unset`                  |
| `ANTHROPIC_API_KEY`      | existing (ADR 0010)                                            | —                                      |

The integration owner grants `github-deployer` `roles/secretmanager.viewer` on each new secret (ADR 0004). Setting a value takes effect after a redeploy: `firebase functions:secrets:set NAME` then `firebase deploy --only functions:default`.

### Rotate the key-encryption key

1. Generate: `openssl rand -base64 32`. Add it as `k2` and set `"current":"k2"`, keeping `k1`: `firebase functions:secrets:set MAIL_TOKEN_KEYS` (paste the JSON).
2. Redeploy the mail functions. Credentials are rewrapped under `k2` on their next read (every 5-minute poll).
3. After a day, remove `k1` and redeploy. Never delete a key that a document still names (`kid`).

## Owner steps

### Gmail (OAuth client; not automatable with gcloud)

Google OAuth clients for Google APIs can only be created in the Cloud Console (gcloud manages IAP and workforce clients only).

1. Enable the API: `gcloud services enable gmail.googleapis.com --project bruteforcehr` (done by the agent on 2026-10-24 if `gcloud services list` shows it).
2. Console → Google Auth Platform → **Branding**: app name BruteForceHR, support email, home `https://bruteforcehr.web.app/`, privacy `https://bruteforcehr.web.app/privacy`, terms `https://bruteforcehr.web.app/terms`, authorized domain `bruteforcehr.web.app` (verify it in Search Console first, ADR 0006).
3. **Audience**: External. For now keep **Testing** and add your Gmail address under **Test users** (refresh tokens then expire after 7 days: reconnect weekly). Switch to **In production** (unverified) once the flow works, per ADR 0006.
4. **Data access**: add scopes `…/auth/gmail.readonly`, `…/auth/gmail.send`, `openid`, `email`.
5. **Clients → Create client → Web application**, name `bruteforcehr-mail`. Authorized redirect URI: `https://bruteforcehr.web.app/connect/google/callback`. No JavaScript origins.
6. Store it: `firebase functions:secrets:set GOOGLE_OAUTH_CLIENT --project bruteforcehr` with `{"clientId":"<id>.apps.googleusercontent.com","clientSecret":"<secret>"}`, then `firebase deploy --only functions:default:connect,functions:default:mailConnectStart,functions:default:mailSyncTask,functions:default:mailSendDispatch,functions:default:mailSendNow,functions:default:mailDisconnect,functions:default:mailSend`.
7. Hosting must be deployed with the `/connect/**` rewrite (`firebase.json`) — integration owner.

### Microsoft (Entra app)

1. Entra admin center → App registrations → New: name BruteForceHR, **Accounts in any organizational directory and personal Microsoft accounts**, redirect **Web** `https://bruteforcehr.web.app/connect/microsoft/callback`.
2. API permissions (Microsoft Graph, delegated): `openid`, `email`, `profile`, `offline_access`, `User.Read`, `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`.
3. Certificates & secrets → New client secret (24 months; put the expiry in the calendar).
4. `firebase functions:secrets:set MICROSOFT_OAUTH_CLIENT` with `{"clientId":"<Application (client) ID>","clientSecret":"<value>"}`; redeploy as above.

### Live IMAP check (no account could be created without the owner)

Free providers require phone or CAPTCHA verification to create a mailbox, so no live IMAP test ran. With your own account:

1. Create an app password (Gmail: 2-Step Verification on → <https://myaccount.google.com/apppasswords>; iCloud: <https://account.apple.com> → App-Specific Passwords; Yahoo/Yandex/GMX/WEB.DE: account security; GMX/WEB.DE also need "POP3/IMAP Abruf" turned on).
2. In the app: Settings › Mail accounts › Add › your provider; or call `mailConnectImap` from the desktop dev console.
3. Expect: `mailAccounts/{id}` `connected`, `backfill.state` `running` → `done` within minutes, job mail in `mailMessages`. Send a test email apply to yourself and check that exactly **one** copy appears in Sent (Yahoo/Yandex/GMX/WEB.DE copy via IMAP APPEND; if you see two copies, set that preset's `smtpSavesSent` to true).

## Operations

- **Logs** (PII-free): `mail_sync`, `mail_poll`, `mail_connected`, `mail_send_scheduled`, `mail_sent`, `mail_send_failed`, `mail_sync_needs_reauth`, `mail_sync_failed`, `mail_body_purge`, `mail_alert_postings` (`found`, `created`, `updated`, `matched` per alert), `mail_alert_postings_failed`. `gcloud functions logs read mailSyncTask --region europe-west1 --project bruteforcehr`.
- **Job alerts without postings in Jobs:** check `mail_alert_postings` for the message's sync run. `found: 0` means the reader didn't recognize the layout: copy the alert (anonymized) into `packages/ai/eval/mail/fixtures/alerts.ts` with the expected postings, fix `packages/core/src/mail/alerts.ts` until `pnpm --filter @bfhr/ai test` passes, and regenerate the report with `pnpm --filter @bfhr/ai eval:mail-alerts`. `mail_alert_postings_failed` usually means the embedding call (Vertex AI, `profile_embedding_failed` for the profile side) failed; the next alert or `jobMatchesRefresh` retries. Matches written by the mail sync have no AI rationale until the jobs pipeline adds one.
- **Interviews from invites:** nothing is created until the user confirms the message (pending → confirmed/corrected, or "Add interview" on an auto-applied invite: auto_applied → confirmed). The interview id is the message id; `mailMessages/{id}.interviewSuggestion.interviewId` shows that it was created. A wrong or missing time: add the invite to `fixtures/invites.ts` and fix `packages/core/src/mail/calendar.ts`.
- **Account stuck in `syncing`:** a crashed run holds the lease up to 9 minutes; the next poll continues.
- **`needs_reauth`:** the user reconnects (IMAP: new app password through `mailConnectImap` with `accountId`; OAuth: `mailConnectStart`).
- **Re-run a lookback scan:** `mailBackfillStart({ accountId, lookbackDays })`.
- **Eval:** `ANTHROPIC_API_KEY=$(gcloud secrets versions access latest --secret ANTHROPIC_API_KEY --project bruteforcehr) pnpm --filter @bfhr/ai eval:mail` (≈ $0.05); commit `eval/mail/recordings/*.json` and `report.md`.
- **Desktop E2E:** `apps/desktop/e2e/specs/mail.e2e.ts` runs the built app against the Auth, Firestore, Storage **and Functions** emulators (`BFHR_EMULATORS=auth,firestore,storage,functions scripts/with-emulators.sh pnpm test:e2e`, which builds `apps/functions` first and writes `lib/default/.env.local` with `PUBLIC_BASE_URL`): it seeds an inbox, an Applied application and a pending invite, confirms in Mail, waits for `mailMessageReviewed` to move the application to Interviewing, then undoes the move from the application's timeline. Secrets are unset in the emulator, so `mailConnectStart` answers `provider_not_configured` there too.
- **Emulator tests:** `pnpm --filter @bfhr/functions test:emulator` runs `src/mail/emulator/*.emulator.test.ts` (lookback scan and incremental sync against imapkit, email apply through smtp-server with a Storage attachment, the review and retention triggers, the OAuth callback with a fake provider) on the Firestore and Storage emulators. They need Java, so they run in CI (job `rules`); the default `test` excludes them.
- **Account deletion:** `deleteUserData(db, bucket, uid)` (apps/functions/src/account/user-data.ts) first runs `revokeAllMailAccounts(uid)` (apps/functions/src/mail/functions.ts). That revokes each OAuth grant at the provider while the encrypted token still exists, and deletes the account's messages, dedupe hashes, token and account document. After that it deletes every `userDataRoots(uid)` tree and the Storage prefix. The function that calls it needs `secrets: MAIL_SECRETS`, otherwise the tokens can't be decrypted and the revocation is skipped (logged as `mail_revoke_failed`). All mail `serverOnly` data lives under `serverOnlyPaths.mailRoot(uid)`, which is one of the `userDataRoots` (packages/api/src/paths.test.ts checks this).

## Live check

`pnpm --filter @bfhr/functions smoke:mail` (ADC owner credentials) runs the deployed callables with a throwaway email-link user, then cleans up with `deleteUserData` and deletes the Auth user. Nothing is sent. **No test IMAP account exists**, so the successful connect, sync and real send paths aren't covered (see "Live IMAP check" above). The script seeds an IMAP account without credentials plus a job, so email apply can be scheduled and cancelled without any mailbox.

**2026-10-24**, functions deployed from `da1ebbc`: all 12 expectations met.

| Call                                                       | Expected                                                                                  | Result |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ |
| `mailConnectStart({provider:'google'})`                    | `failed-precondition` / `provider_not_configured`                                         | pass   |
| `mailConnectImap` icloud, wrong app password               | `permission-denied` / `auth_failed`, field `password`                                     | pass   |
| `mailConnectImap` outlook preset                           | `failed-precondition` / `oauth_required`                                                  | pass   |
| `mailConnectImap` `imap.host` 169.254.169.254              | `unavailable` / `host_unreachable`, field `imapHost`                                      | pass   |
| `mailSend`, nonexistent `accountId`                        | `not-found` / `account_not_found`                                                         | pass   |
| `mailSend` (seeded account, `applicationId` null, `jobId`) | `{state:'scheduled', applicationId, sendAt}`, outbox doc exists                           | pass   |
| `mailSendCancel` 1.1 s later                               | `{state:'cancelled'}`; `emailSend.state` `cancelled`, status `preparing`; outbox doc gone | pass   |
| second `mailSendCancel`                                    | `failed-precondition` / `already_sent`                                                    | pass   |
| 15 s after `mailSend`                                      | still `cancelled` (dispatch task deleted)                                                 | pass   |
| cleanup                                                    | Auth user deleted, nothing left under `userDataRoots`                                     | pass   |

The first run, against the build deployed on 2026-10-23, returned `host_unreachable` instead of `auth_failed` for iCloud: the host guard (`providers/net-guard.ts`) had an IPv6 rule for `::ffff:0:0/96`. Node's `BlockList` checks IPv4 addresses against IPv6 rules in their IPv4-mapped form, so that rule refused **every** IPv4 mail server. With the rule removed (`64d0cf0`; the IPv4 rules already catch mapped addresses, and a test now covers this), `mailConnectImap`, `mailSyncTask`, `mailSendDispatch`, `mailSendNow` and `mailDisconnect` were redeployed from a clean checkout and the check passed.

Rerun the same day after merging main, with cleanup through `deleteUserData`: all 12 expectations met again. The cancel came 6.7 s after `mailSend` because of a cold start, still inside the window. The cleanup logged `mail_revoke_failed` (`MailAuthError`, as expected: the seeded account has no token and the script has no `MAIL_SECRETS`), then `mail_disconnected`, and nothing was left under `userDataRoots`.
