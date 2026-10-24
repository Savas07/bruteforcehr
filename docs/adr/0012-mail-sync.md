# ADR 0012 — Mail sync, classification and email apply

- **Status:** Accepted
- **Date:** 2026-10-24
- **Deciders:** Savas (owner), lead engineer agent
- **Related:** [0002-data-model.md](0002-data-model.md), [0004-release-updates-signing.md](0004-release-updates-signing.md), [0006-hosting-domains.md](0006-hosting-domains.md), [0010-ai.md](0010-ai.md), [runbooks/mail.md](../runbooks/mail.md), BRIEF §4.4, §4.7, §6.4, §8; design `connect-email.md`, `mail-review.md`, `apply.md`, `decisions.md` D11/D22/F6, `flows.md` §2–3

## Context

M5 reads job mail from Gmail, Microsoft and IMAP mailboxes, turns it into tracker updates, and M4 sends email applications. Constraints: no Docker or local JDK (in-process test servers only), tokens never reach clients, every automatic change is explained and undoable, the Google OAuth app runs unverified, and the Entra app registration does not exist yet.

## Decision

### Providers

| Provider                | Auth                                                                                                                                                          | Sync cursor                                                                                                                                              | Send                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| IMAP (`imap`)           | App password, tested server-side by `mailConnectImap` (IMAP login, then SMTP AUTH; SMTP failure still connects for reading with `smtpWarning`)                | JSON per folder (INBOX + `\Junk`): `UIDVALIDITY`, `UIDNEXT`, `HIGHESTMODSEQ`. Unchanged mailbox = one `STATUS` per folder. `UIDVALIDITY` change → rescan | SMTP (TLS or STARTTLS, never plaintext), then `APPEND` to `\Sent` unless the preset says the provider files SMTP mail itself (Gmail)         |
| Gmail (`gmail`)         | OAuth web client, authorization code + PKCE, `access_type=offline`, `gmail.readonly` (+ `gmail.send` for intent `send`, incremental consent)                  | `historyId`; `history.list` 404 → rescan                                                                                                                 | `messages.send` (multipart upload above 4 MiB of base64)                                                                                     |
| Microsoft (`microsoft`) | Entra multi-tenant + personal accounts, PKCE, `Mail.Read`, `User.Read`, `offline_access` + OpenID (+ only `Mail.Send` for intent `send`, incremental consent) | Delta links per folder (inbox, junkemail), `changeType=created`, immutable ids                                                                           | One request: `sendMail` (`saveToSentItems: true`) or, for follow-ups, `messages/{id}/reply`; base64 `fileAttachment`s inline, request ≤ 4 MB |

IMAP presets (`IMAP_PRESETS` in `@bfhr/core`): Gmail, iCloud (local-part username fallback, SMTP with the full address), Yahoo, Yandex, GMX, WEB.DE. **Outlook.com is OAuth only**: Microsoft turned off basic auth/app passwords for Outlook.com on 2024-09-16, so the preset returns `oauth_required` and the client routes to Microsoft.

**Microsoft send without `Mail.ReadWrite` (2026-10-24).** The privacy policy promises Microsoft users `Mail.Read`, `User.Read`, `offline_access` and OpenID for reading and only `Mail.Send` for sending, so the adapter no longer creates drafts or upload sessions (both need `Mail.ReadWrite`). Consequences:

- **Attachment limit.** Graph caps a request at about 4 MB and the attachments travel base64-encoded inside it, so a Microsoft account sends about 2.9 MB of attachments (`MAIL_SEND_MICROSOFT_MAX_ATTACHMENT_BYTES`; Gmail and IMAP keep 18 MB). `graphSendOverLimit` sizes the exact request from file sizes (the JSON with empty `contentBytes` plus each file's base64 length); `mailSend` refuses before scheduling with `attachments_too_large` and `details.limitBytes` (what fits next to this message), and the adapter refuses again before calling Graph (`MailTooLargeError` → `emailSend.error.code` `attachments_too_large`; the account stays connected). Clients check `mailSendMaxAttachmentBytes(provider)` before sending.
- **Ids.** `sendMail` and `reply` answer `202` with no id. We set the Message-ID ourselves (`PidTagInternetMessageId`, extended property `String 0x1035`) and store it as `rfc822MessageId` and `providerMessageId`; `threadId` is the replied message's conversation id, or null for a first message (the thread ref then falls back to the Message-ID, which incoming replies quote in `In-Reply-To`/`References`). Microsoft documents the property but not this use on send: the first live send must show our Message-ID in the received headers (runbook "Microsoft (Entra app)" step 5).
- **Threading.** Follow-ups use `POST /me/messages/{id}/reply` (also `Mail.Send` only): Exchange fills `In-Reply-To`, `References` and the conversation as the draft flow did, and our text body replaces the quoted original. The replied message must still exist in the mailbox (as with `createReply` before); if it was deleted the send fails with `send_failed`.

User-supplied IMAP/SMTP hosts are resolved first and refused when any address is private, loopback, link-local (metadata server) or otherwise non-public; the connection uses the resolved address with the name kept for TLS (SSRF and DNS-rebinding guard).

The Gmail and Microsoft OAuth clients are secrets created with the value `unset` (`GOOGLE_OAUTH_CLIENT`, `MICROSOFT_OAUTH_CLIENT`, JSON `{clientId, clientSecret}` once real). While unset, `mailConnectStart` answers `provider_not_configured`; setting the secret and redeploying turns the provider on (same pattern as the keyed job sources).

### Credentials: envelope encryption with a Secret Manager KEK

- Each account's credentials (app password or refresh/access token) are JSON encrypted with **AES-256-GCM under a fresh 256-bit data key**; the data key is wrapped with AES-256-GCM under the **key-encryption key from Secret Manager `MAIL_TOKEN_KEYS`** (`{ current, keys: { id: base64 } }`). Both layers authenticate the document path as AAD, so a ciphertext copied into another user's document fails to decrypt.
- Stored at `serverOnly/mail/users/{uid}/mailTokens/{accountId}` (`mailAccounts.secretRef` is that path below `serverOnly/`). Rotation: add a key, make it `current`, redeploy; documents are rewrapped on their next read.
- **Why not Cloud KMS:** KMS would need the KMS API, a key ring and an IAM grant to the runtime service account (we don't change IAM by hand), and adds a network call per decrypt. Secret Manager access is granted per secret by the Firebase CLI at deploy, and the KEK never leaves server memory. KMS remains the upgrade path (same envelope format, `kid` would name a KMS key version).

### Sync engine

- `mailPoll` (every 5 min) enqueues one `mailSyncTask` per connected account (Cloud Tasks id per 5-minute bucket dedupes). A Firestore lease on the token document keeps one run per account.
- Lookback scan (30/90/180 days, default 90) runs in `mailSyncTask` mode `backfill`: it takes the incremental cursor first, then pages through the window, writing progress to `mailAccounts.backfill` (stage, scanned/total, job messages, applications, interview invites, alerts, pending review) and re-enqueues itself every 6 minutes until done.
- Dedupe: document id = SHA-256(accountId + provider id); non-job mail leaves only `serverOnly/mail/users/{uid}/mailSeen/{hash}` with a 200-day TTL (longer than the longest lookback).
- A message whose RFC 822 Message-ID is already stored for the account is skipped before analysis: IMAP provider ids embed `UIDVALIDITY`, so a rescan after a reset would otherwise store and apply the same mail again.

### Classification pipeline (`analyzeMail` in `@bfhr/ai`, rules in `@bfhr/core`)

1. **Pre-filter** (data, not code: ATS / job-board / assessment sender domains; tracked company domains and names; thread match; EN/TR/DE phrase patterns). Bulk mail needs a phrase, a tracked company or candidate-facing career content; personal mail needs job vocabulary.
2. **Classify.** With "Allow sending email text to AI" on (`settings.aiMailTextAllowed`, off by default) and AI enabled: Claude **`claude-haiku-5-5`**, prompt `mail-classify@2`, JSON output (category, confidence, language, screening flag, company, role, contact, dates with offset/zone, meeting links, application pick). The rules cross-check: a decisive rule phrase for another category caps the model's confidence at 0.8. Otherwise rules only (`actor: "rule"`); rules reach the auto-apply range only with a decisive phrase, a sender/thread anchor and no competing status phrase.
3. **Ground** extraction in the text (company/role/contact must occur; meeting URLs verbatim; dates converted with the stated offset, zone, or the profile zone).
4. **Link** (`linkApplication`): `thread` > `ats_company_role` (company **and** role from an ATS, assessment platform or the company's domain) > `company_domain` > `llm` (never between two applications at one company without a role) > `none`. Alerts and non-job mail are never linked.
5. **Decide** (`decideMailAction`): category → target (`application_received`→acknowledged, `rejection`→rejected, `interview_invite`→interviewing or screening for a first screen, `assessment`→screening, `offer`→offer). Automatic only when the move is forward or to rejected (`canTransition` for `rule`/`ai`), confidence ≥ `settings.autoApplyConfidence` (0.9) and the link is `thread` or `ats_company_role`. The event is `status_changed` with actor `ai`/`rule`, confidence and evidence `{mailMessageId, reason}`; the message gets `reviewState: auto_applied` and `appliedEventId` (the Undo target, ADR 0002). Everything else is `pending` (review queue) or `not_required` (alerts; strongly linked mail with nothing to change). Strongly linked mail also appends a `mail_received` event and remembers the provider thread on the application.
6. **Review** (`mailMessageReviewed` trigger): Confirm/Change on a pending message links it, appends `mail_received` and, for a forward move, a user `status_changed`; "Not job mail" deletes the message. Every changed category/link is stored as a labeled example in `serverOnly/mail/users/{uid}/mailCorrections` (no body).

Reasons shown to users are generated from category, sender domain and link kind, never from model text, so events never hold body text.

Cost: about $0.00023 per classified message with Haiku (eval: $0.046 for 206 messages); the per-user daily AI cap of ADR 0010 applies, and over the cap the pipeline falls back to rules.

### Eval and CI gate

- 206 labeled messages (EN 68, TR 68, DE 70; every category ≥ 12; 138 hard cases), synthetic or shaped like public ATS/job-board templates, fictional parties (`packages/ai/eval/mail/fixtures`). No real mailbox samples were available; owner corrections (`mailCorrections`) are the source for anonymized samples later.
- `pnpm --filter @bfhr/ai eval:mail` runs the live model and records replies; `pnpm --filter @bfhr/ai test` replays them through the current pipeline and **fails below macro-F1 0.90 or below 97 % precision on automatic changes** (BRIEF §4.7), and also gates rules-only precision. A prompt change invalidates the recording.
- Result 2026-10-24 (`eval/mail/report.md`): Haiku macro-F1 **0.938**, automatic changes **51/51 correct (100 %)**, coverage 89.5 %, link accuracy 99.5 %. Sonnet 5.5: macro-F1 0.995 at 18× the cost (`report-claude-sonnet-5-5.md`). Rules only: macro-F1 0.68 (not gated: the AI-off classifier is deliberately conservative), automatic changes 21/21 correct. The fixture set also informed the prompt's category definitions (`mail-classify@2`), so it is a development set; new owner-labeled mail is the held-out check.

### Job alerts (`parseJobAlert` in `@bfhr/core`, `mail/job-alerts.ts`)

- Messages classified `job_alert` are stored as before (`not_required`, never linked) and their postings go to Jobs: deterministic readers, no model. The sender picks the board (LinkedIn, Indeed, StepStone, Kariyer.net, XING, Glassdoor); each board has a posting-link recognizer that yields a canonical URL (LinkedIn `jobs/view/<id>`, Indeed `viewjob?jk=`, Glassdoor `job-listing/j?jl=`, StepStone/Kariyer.net/XING path without query) and drops redirect hosts and tracking parameters. Other senders get the generic reading: a link next to one "title — company — location" (or "title at company") line; meeting, scheduling, assessment and account links never count.
- Text and HTML bodies: HTML links are kept as `text <url>` (`alertTextFromHtml`); the body yielding more postings wins. Cards are split at posting links (links closing each card, or opening it on the title/logo); cards of one alert share a layout, so a header or footer line is trimmed by the field count of the other cards. Lines are classified as fields (title, company, location; Glassdoor puts the employer first), salary (EUR/USD/GBP/TRY/CHF, ranges, period, "est."), posting age (EN/DE/TR relative or dated) or badges/boilerplate.
- At most 50 postings per message (`MAX_ALERT_POSTINGS`). Each becomes a `jobs` draft (`alertPostingToJob`: source `alert_email`, `sourceId` null so the key is `alert_email:<canonical url>`, `isDirectFromEmployer` false, normalized location/remote type/seniority, fingerprint). `mail/job-alerts.ts` hands the drafts to the jobs pipeline: `JobStore.upsert` (candidates by `sourceKeys` and `fingerprint`, merged with `isSameJob` + `mergeJobListing`, embeddings for new jobs), so an alert repeating a posting, or listing one a search already found, adds a source instead of a duplicate; then `matchJobs` writes `jobMatches` (state `new`, so the posting shows in the Jobs feed). No AI rationale from the mail sync (the jobs pipeline adds rationales on its runs); profile, CV and profile vector are loaded once per sync run. A failed import is logged; the message is kept.

### Interviews from invites (review-first)

- Every `interview_invite` message gets `interviewSuggestion` (ADR 0002 expand field) when a time is known, from the most reliable source: a calendar part (`text/calendar` or `.ics`: VEVENT DTSTART/DTEND or DURATION, TZID as IANA, Windows or vendor-prefixed names, floating times in the profile zone, METHOD:CANCEL/STATUS:CANCELLED and all-day events ignored, meeting link from URL/conference properties/LOCATION/DESCRIPTION), else the model's single `interview` date, else one explicit date + time in the text (`interviewSlotInText`: ISO, `05.11.2026`, `5. November`, `5 Kasım 2026`, `November 5`, weekday/tomorrow; `14:00`, `2 pm`, `14 Uhr`, `saat 14:00`; ranges for the length; zone abbreviations, names, cities in parentheses or UTC offsets; restatements in another zone and quoted replies ignored; several different times → no suggestion). Length from DTEND, a range or a duration phrase, else null.
- **No interview is created automatically.** Confirming a pending invite (Confirm/Change in the review queue) creates `interviews/{messageId}` in the same transaction as the link and status change; on an automatically applied invite, the "Add interview" action writes `reviewState: confirmed` (auto_applied → confirmed), which creates only the interview. The interview: round = the application's interviews + 1, kind recruiter call for a first screen else from the wording, duration default 30 (screen) / 60 min, organizer zone else the profile zone, the contact as a person, `sourceMailMessageId`; an `interview_scheduled` user event goes on the timeline and `interviewSuggestion.interviewId` records it. No new collection, no change to the client-writable review fields or the rules.
- Why: a wrong time silently placed in Today/Calendar costs more than one tap, and the review queue already carries the message; Undo of an automatic status change stays a pure status revert.

### Alert and invite eval

- `packages/ai/eval/mail/fixtures/alerts.ts` (16 alerts: every board, EN/TR/DE, text and HTML, a company careers alert, a digest without links; 37 postings) and `fixtures/invites.ts` (10 invites: Google/Outlook/Zoom/floating calendar parts, explicit EN/TR/DE times, Calendly, reply threads, offsets). Deterministic, so separate from the replayed classification set. `alerts-gate.test.ts` fails below posting recall 0.90 / precision 0.95 (URL, title, company and location all right) or interview start accuracy 0.90; `pnpm --filter @bfhr/ai eval:mail-alerts` writes `eval/mail/report-alerts.md`.
- Result 2026-10-24: postings recall and precision 100 % (37/37), salary/age 100 %; interviews start, zone, length and link 100 % (10/10). Development set; the held-out check (classification-set invites with one labelled time, text only) is 21/23: one German invite without a zone read in the persona's Istanbul zone, one rescheduling mail naming the old and the new time (no suggestion).

### Email apply (`mailSend`)

`mailSend` validates account (`canSend`, connected), attachments (rendered files or `users/{uid}/mail-attachments/*`, ≤ 18 MB; Microsoft: the whole Graph request ≤ 4 MB, see above), daily cap (`settings.dailySendCap`, counted in `serverOnly/.../mailSendDays`), stores the message in `serverOnly/.../mailOutbox/{sendId}`, sets `applications/{id}.emailSend` to `scheduled` (creating the application from the job when needed) and enqueues `mailSendDispatch` at server ack + 10 s. `mailSendCancel` cancels while scheduled; `mailSendNow` sends at once. Dispatch claims `scheduled → sending` in a transaction (no double send), sends, then in one transaction: `emailSend.sent` with provider ids, empty pins filled (write-once after `appliedAt`), channel email, `fromAccountId`, thread ref, `mail_sent` and — before applied — a user `status_changed` to applied. Failures release the cap slot and set `emailSend.failed` (auth and scope failures also flip the account to `needs_reauth`; `attachments_too_large` doesn't).

### Retention

`bodyPurgeAt` follows ADR 0002: null while the linked application is active, close + `mailBodyRetentionDays` once closed (`mailApplicationChanged` trigger), receipt + retention for unlinked mail. `mailBodyPurge` (daily) clears `bodyText` and `snippet`. `mailDisconnect` revokes (Google), deletes the account's messages, hashes and credentials.

## Consequences

- One codebase, 15 new functions in `default` (europe-west1). Hosting must rewrite `/connect/**` to `connect` (in `firebase.json`; goes live with the next Hosting deploy).
- New secrets `MAIL_TOKEN_KEYS`, `GOOGLE_OAUTH_CLIENT`, `MICROSOFT_OAUTH_CLIENT` need `roles/secretmanager.viewer` for `github-deployer` (ADR 0004).
- Google "Testing" status gives 7-day refresh tokens (ADR 0006); in Testing the owner reconnects weekly until the consent screen is moved to "In production" (unverified).
- Not in this change: push notifications, Gmail watch/Graph subscriptions.

## Alternatives considered

- **Cloud KMS KEK:** see above. **Plain Secret Manager secret per account:** one secret per user account doesn't scale and needs IAM per secret.
- **Client-side 10 s undo:** a killed app could still send or never send; the server-side window matches decisions.md D11.
- **Sonnet for classification:** better F1, 18× cost; Haiku passes the gate with 100 % automatic precision.
- **GreenMail/Dovecot for tests:** Docker/Java are not available; `imapkit` (in-process IMAP with CONDSTORE/SPECIAL-USE/UIDPLUS over real TLS sockets) and `smtp-server` (STARTTLS) cover the protocol paths.
