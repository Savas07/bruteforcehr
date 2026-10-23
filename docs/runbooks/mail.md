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

- **Logs** (PII-free): `mail_sync`, `mail_poll`, `mail_connected`, `mail_send_scheduled`, `mail_sent`, `mail_send_failed`, `mail_sync_needs_reauth`, `mail_sync_failed`, `mail_body_purge`. `gcloud functions logs read mailSyncTask --region europe-west1 --project bruteforcehr`.
- **Account stuck in `syncing`:** a crashed run holds the lease up to 9 minutes; the next poll continues.
- **`needs_reauth`:** the user reconnects (IMAP: new app password through `mailConnectImap` with `accountId`; OAuth: `mailConnectStart`).
- **Re-run a lookback scan:** `mailBackfillStart({ accountId, lookbackDays })`.
- **Eval:** `ANTHROPIC_API_KEY=$(gcloud secrets versions access latest --secret ANTHROPIC_API_KEY --project bruteforcehr) pnpm --filter @bfhr/ai eval:mail` (≈ $0.05); commit `eval/mail/recordings/*.json` and `report.md`.
- **Account deletion** must call `revokeAllMailAccounts(uid)` (apps/functions/src/mail/functions.ts) before deleting `userDataRoots(uid)`.
