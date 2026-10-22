# BruteForceHR — Product Requirements (v1)

- **Status:** Draft for M0 approval · **Date:** 2026-10-22
- **Sources:** [BRIEF.md](BRIEF.md) (product brief) adapted by kickoff decisions recorded in [adr/0001-stack.md](adr/0001-stack.md), [adr/0002-data-model.md](adr/0002-data-model.md), [adr/0003-auth-email-otp.md](adr/0003-auth-email-otp.md), [adr/0004-release-updates-signing.md](adr/0004-release-updates-signing.md), [adr/0005-job-sources-scraping.md](adr/0005-job-sources-scraping.md), [adr/0006-hosting-domains.md](adr/0006-hosting-domains.md).
- **Design tracking:** [STATUS.md](STATUS.md)

## 1. Product

| | |
|---|---|
| Name | BruteForceHR (slug `bruteforcehr`, bundle `com.savas07.bruteforcehr`, scheme `bruteforcehr://`) |
| Platforms | iOS (iPhone) · macOS (Apple silicon + Intel) · Windows 10/11 x64 · website `https://bruteforcehr.web.app` |
| Markets | Turkey; EU (Germany, Netherlands, relocation); UK; US; Remote worldwide |
| Languages | English, Turkish, German — UI, CVs, mail parsing |
| Audience | Personal tool; multi-user-capable architecture (unverified Google OAuth app "In production", TestFlight internal) |
| AI | Anthropic Claude via the owner's key, server-side only |
| Backend | Firebase project `bruteforcehr`: Firestore (europe-west1), Auth (custom email code), Storage, Cloud Functions gen2 (europe-west1), Hosting |

**Mission.** One person can (1) find jobs from many sources ranked against their profile and CVs, (2) send applications by email from their own accounts or via the employer's site with everything prepared, (3) create, import, tailor, version and export CVs, (4) track every application from Saved to Offer, (5) connect Gmail, Outlook/Microsoft 365 and IMAP accounts so incoming mail updates applications automatically.

**Persona.** An active job seeker, often stressed and short on time, switching between phone (triage, quick actions) and desktop (heavy work: CV editing, tailoring, bulk tracking, insights).

**UX principles.** Calm and supportive (gentle rejection copy, mutable rejection notifications, no guilt gamification; the in-app tone stays calm despite the product name) · Trust (every automatic action shows source + reason + Undo) · Speed (optimistic UI, < 100 ms input response, keyboard-first desktop) · Progressive disclosure.

## 2. Non-negotiables (BRIEF §2, intent unchanged)

1. **Design protocol is mandatory** for every app screen and website page/section: Mobbin research before designing, `design-critique` after, iterate until it passes. If either tool is missing, stop and tell the user.
2. **GitHub Releases are the single source of truth for versions.** One published release auto-updates desktop, ships iOS to TestFlight, deploys backend (Firebase) and refreshes the website download page.
3. **Never send anything on the user's behalf without explicit confirmation** of that specific message (recipient, subject, body, attachments). No bulk auto-apply.
4. **Never fabricate CV content.** AI may rephrase, reorder, shorten, translate, and quantify only with user-supplied numbers; never invent employers, titles, dates, degrees, skills or metrics. Unknowns become visible placeholders (`[X%]`) the user must fill.
5. **Job-source conduct** — *adapted by owner override ([ADR 0005](adr/0005-job-sources-scraping.md))*: public pages may be fetched even where ToS restrict it (personal use), but **never bypass logins, never solve CAPTCHAs, never automate submission of third-party application forms**, keep polite rate limits and an honest User-Agent. Official APIs, public ATS boards, JSON-LD and the user's own email come first.
6. **Every automatic change is explained and reversible** ("Moved to Rejected: email from jobs@acme.com, 12 Oct · Undo").
7. **No secrets in client bundles.** GitHub tokens, OAuth client secrets, service-account credentials and LLM keys never ship in desktop or iOS apps (they live in Secret Manager / CI secrets).
8. **Verify, don't assume.** Check current official docs before writing config or integration code; prove every milestone by running it.

## 3. Definition of done (every story)

Acceptance criteria met on each relevant platform · tests pass · the [STATUS.md](STATUS.md) design row is **approved** · accessibility review passes (WCAG 2.1 AA; VoiceOver + Dynamic Type on iOS; keyboard-only on desktop) · docs updated · demonstrated by running it with screenshots/recordings as evidence · no stubs, mock data in production paths or `TODO: implement`.

Story IDs: `M<milestone>-<area>-<n>`. "Both clients" = iOS + desktop (macOS and Windows).

---

## M0 — Foundations

Exit: owner approves the design checkpoint; all three apps launch.

**M0-REPO-1 — Monorepo.** As the developer, I want one pnpm/Turborepo workspace so all apps share types and tooling.
- `pnpm install` (hoisted) succeeds; `turbo lint typecheck test` passes at root.
- Layout and package names match [ADR 0001](adr/0001-stack.md); React pinned to 19.3.0; TypeScript 6.0.3.

**M0-CI-1 — CI.** As the developer, I want every push checked.
- `ci.yml` runs lint, typecheck, unit tests, gitleaks secret scan and dependency audit; Firestore/Storage rules tests run on the emulator in CI (ubuntu runner with Java).
- A rules test proves user A can't read or write user B's documents, and clients can't read `serverOnly/**`.

**M0-BE-1 — Firebase project.** As the owner, I want the backend provisioned.
- `firebase.json`, `.firebaserc` (`bruteforcehr`), deny-by-default `firebase/firestore.rules`, `firestore.indexes.json`, `storage.rules` committed; Firestore `(default)` exists in europe-west1.
- A health function (`/api/health` via Hosting rewrite) responds 200 from europe-west1.

**M0-APP-1 — Apps launch.** Desktop (macOS dev build) opens a window; iOS dev build runs on iPhone 17 Pro simulator; website builds and serves locally.

**M0-DES-1 — Design research.** As the owner, I want design grounded in references.
- `docs/design/research/<area>.md` exists for every row of BRIEF §5.3 (≥ 5 examined, ≥ 3 kept per screen/flow, `mobbin_url` cited, no images committed).
- IA, user flows (mermaid), tokens in `packages/ui-tokens` (light/dark color, type scale mapped to Dynamic Type, spacing, radius, elevation, motion) and component inventory documented.

**M0-DES-2 — Design checkpoint.** The 5 core screens (Today, Job detail, CV editor, Tracker board, Mail review) on iOS and desktop each have critique logs with zero Critical / zero unresolved Moderate findings; owner approves before broad implementation.

**M0-DOC-1 — Docs.** PRD, ADRs 0001–0006, STATUS.md, runbooks/accounts.md exist.

## M1 — Walking-skeleton release

Exit: BRIEF §7 acceptance demonstrated ([ADR 0004](adr/0004-release-updates-signing.md)).

**M1-AUTH-1 — Email code sign-in.** As a user, I sign in with a 6-digit code emailed to me, no password.
- Code sent via Brevo within 30 s; hashed at rest, with TTL, attempt limit and resend throttling as specified in ADR 0003; success mints a custom token and `signInWithCustomToken` signs in on both clients ([ADR 0003](adr/0003-auth-email-otp.md)).
- Wrong/expired code shows calm, specific copy; session persists across restarts (Keychain on iOS).

**M1-REL-1 — Release pipeline.** As the owner, publishing `vX.Y.Z` ships everything.
- Tag → `release.yml`: backend deploy, macOS signed+notarized DMG+ZIP, Windows unsigned NSIS, iOS TestFlight upload, publish to `Savas07/bruteforcehr-releases`, write `appConfig/{macos,windows,ios}`.
- Install `v0.1.0` on clean macOS and Windows; publish `v0.1.1`; both update with only "Restart". TestFlight receives `0.1.1`; website download page shows `0.1.1`.

**M1-UPD-1 — Desktop updates.** Check at launch + every 6 h; background download; non-blocking "Restart to update" with notes; installs on quit; never interrupts unsaved edits; Stable/Beta channel and "Check for updates" in Settings.

**M1-UPD-2 — iOS version gate.** Banner when `appConfig/ios.latestVersion` > installed; blocking screen below `minSupportedVersion`.

**M1-WEB-1 — Website.** Home, Features, Download, Changelog, Privacy, Terms, Support on `bruteforcehr.web.app`.
- Download detects OS, links latest assets with SHA-256 checksums, explains the Windows SmartScreen prompt, links TestFlight.
- Changelog rendered from GitHub Releases; Lighthouse ≥ 90 in all four categories at 375/768/1440 px.
- Privacy policy accurately describes mail data handling (required by Google consent screen and App Store).

## M2 — CV Studio

Exit: PDF parity tests pass; all CV screens approved.

**M2-CV-1 — Canonical model.** CVs stored as JSON Resume + `meta` (template, theme, custom sections) in `users/{uid}/cvs/{cvId}` with immutable `revisions` (create-only) and `version` for optimistic concurrency.

**M2-CV-2 — Create.** Guided or blank creation on both clients; first CV usable in < 3 minutes.

**M2-CV-3 — Import.** As a user, I import PDF, DOCX, JSON Resume or a LinkedIn data-export ZIP.
- Parsed into structure; review screen highlights low-confidence fields; original file kept attached; re-rendered with our templates.

**M2-CV-4 — Edit.** Desktop split view (structured editor + live preview); iOS section list → edit sheets + preview tab. Reorder sections/items, rich bullets, spell-check in EN/TR/DE.
- AI assists (rewrite, shorten, stronger verb, translate) appear as accept/reject suggestions; a grounding check rejects any entity, number or date not in the source CV.

**M2-CV-5 — Variants & history.** Base CV with role/language variants; revision history with diff and restore; duplicate; archive. Concurrent edit conflict shows "keep mine / keep theirs / compare".

**M2-CV-6 — Templates.** ≥ 3 ATS-safe templates (single column, real text, standard headings, embedded fonts, no text in images/layout tables); theme: accent, font pair, density, A4/Letter.

**M2-CV-7 — Export.** PDF (desktop `printToPDF` offline; server Chromium for iOS/attachments; tagged where supported), DOCX, JSON. Default name `First-Last-CV-<Company>.pdf`. Raster diff between engines within threshold in CI.

**M2-CV-8 — ATS check.** Text extracted from our PDF round-trips every section; keyword coverage shown against a chosen job description.

## M3 — Tracker

Exit: full lifecycle on iOS + desktop; state-machine tests.

**M3-TR-1 — State machine.** Saved → Preparing → Applied → Acknowledged → Screening → Interviewing → Offer → Accepted | Declined; any active status → Rejected, Withdrawn, Ghosted. One machine in `@bfhr/core` used by clients and functions.
- Automation may move forward or to Rejected only; never to Accepted/Declined/Withdrawn/Ghosted. Only the user moves backward. Every transition writes an `applicationEvents` doc (append-only). Ghosted only suggested after 21 silent days (configurable).

**M3-TR-2 — Views.** Board (drag between columns; keyboard move on desktop), Table (filter, sort, bulk edit, CSV export), Calendar (interviews, deadlines). 60 fps with 1,000 applications.

**M3-TR-3 — Detail.** Header (company, role, status, next action), timeline (status changes, inbound/outbound mail snippets, notes), documents used, contacts, interview rounds, reminders.

**M3-TR-4 — Manual add & CSV import.** Add in ≤ 3 fields on iOS; CSV import with column mapping and preview.

**M3-TR-5 — Reminders.** Follow-up suggested 7 days after Applied with no response (configurable); interview prep reminders; `.ics` export.

**M3-IN-1 — Insights v1.** Funnel (applied → response → interview → offer), response rate by source/channel/CV variant, median time to first response, weekly activity — computed from `applicationEvents`.

## M4 — Jobs + Apply

Exit: a real email application is sent and tracked end to end.

**M4-JOB-1 — Connectors.** Keyless sources (Remotive, Arbeitnow, Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee) and keyed sources (Adzuna, Jooble, USAJOBS, Reed) behind one interface with rate limits and attribution, per [ADR 0005](adr/0005-job-sources-scraping.md); each has `docs/integrations/<source>.md`.
- Attribution rendered per source terms (e.g. Remotive name + link; Adzuna label ≥ 116×23 px linked).

**M4-JOB-2 — Company watchlist.** User adds a company by careers URL; ATS auto-detected; postings refresh on schedule.

**M4-JOB-3 — Save from anywhere.** iOS Share Extension; desktop paste URL / drag link. JSON-LD `JobPosting` first, then readable text + LLM extraction, then paste fallback. User confirms fields before saving.
- Scraping honours ADR 0005 hard limits (no login bypass, no CAPTCHA solving, rate limits, honest UA; robots.txt recorded).

**M4-JOB-4 — Normalize & dedupe.** Fingerprint on normalized company/title/location + description shingles; duplicates merged keeping every source link.

**M4-JOB-5 — Match score.** 0–100 per job vs profile + selected CV: hard filters (location, remote, authorization, salary, seniority) → skill/keyword overlap → embedding similarity (Firestore vector search, server-side) → LLM rationale for top N. Detail shows "why it matches" and "gaps".

**M4-JOB-6 — Saved searches & alerts.** Scheduled runs (`onSchedule`), push above threshold, optional daily digest. Job actions: save, dismiss (reason feeds ranking), apply.

**M4-AP-1 — Apply sheet: CV.** Pick a variant or "Tailor for this job": AI edits shown as a diff, accepted/rejected individually, saved as a new revision; grounding check enforced.

**M4-AP-2 — Cover letter.** Generated from CV + job + tone; fully editable; reusable templates.

**M4-AP-3 — Email channel.** From-account picker, template merge fields, attachments (pinned CV PDF + cover letter PDF), full preview, explicit **Send**, 10-second undo, daily send cap. Provider message/thread IDs stored. Graph attachments > 3 MB use an upload session ([Graph large attachments](https://learn.microsoft.com/en-us/graph/outlook-large-attachments)).

**M4-AP-4 — External channel.** Opens the ATS/company URL (Safari view on iOS) with a copy-ready kit (CV file, cover letter, answers library). On return: "Did you submit?" → Applied. Never auto-fills or submits third-party forms.

**M4-AP-5 — Pinning.** Each application pins the exact CV revision, PDF and cover letter used (immutable).

## M5 — Mail intelligence

Exit: eval gate passes; live demo with a real Gmail and Outlook account.

**M5-MAIL-1 — Connect accounts.** Gmail (Gmail API), Microsoft (Graph, delegated `Mail.Read`, `Mail.Send`, `offline_access`, `User.Read`, authority `common`), IMAP/SMTP (iCloud, Yahoo, custom; app password or XOAUTH2). OAuth via `https://bruteforcehr.web.app/connect/...` ([ADR 0006](adr/0006-hosting-domains.md)); tokens encrypted server-side; "needs re-auth" state with notification; disconnect revokes and purges.

**M5-MAIL-2 — Backfill (onboarding).** On connect, scan last 90 days (configurable) and propose found applications ("We found 14 applications and 3 interview invites") for one-tap import with correct status.
- **Acceptance (BRIEF §4.2):** a new user with a CV and a Gmail or Outlook account reaches a populated tracker without typing application data.

**M5-MAIL-3 — Incremental sync.** Gmail `history.list` (resync window if expired), Graph delta per folder, IMAP UID/MODSEQ; includes Spam/Junk; poll every 5 min via scheduled + task-queue functions. 3 accounts sync in < 30 s.

**M5-MAIL-4 — Pre-filter & classify.** Cheap pre-filter (thread match, ATS sender list as data, tracked domains, multilingual heuristics); non-candidates stored as message ID + hash only. Classes: `application_received`, `rejection`, `interview_invite`, `assessment`, `offer`, `recruiter_outreach`, `info_request`, `job_alert`, `other_job`, `not_job`; extraction of company, role, dates with timezone, meeting links, deadlines, contact.
- **Acceptance:** labeled fixture set ≥ 150 messages, ≥ 2 languages, all categories incl. hard cases → macro-F1 ≥ 0.90, precision ≥ 0.97 on auto-applied transitions; CI fails below.

**M5-MAIL-5 — Link & act.** Evidence order: thread/In-Reply-To > ATS sender + company + role > company domain > LLM choice. Confidence ≥ 0.9 with strong link → apply transition + notify with Undo; else → Review queue (Mail tab) for one-tap confirm/correct; corrections stored as labeled examples.

**M5-MAIL-6 — Job alerts.** LinkedIn/Indeed/Glassdoor/company alert emails parsed into Jobs with source "Alert email".

**M5-MAIL-7 — Notifications.** Interview invites, offers, assessments with deadlines, rejections (gentle, mutable), re-auth needed; quiet hours; private-notification mode with minimal payloads.

## M6 — Hardening + v1.0

Exit: all STATUS.md rows approved; `v1.0.0` released through the pipeline.

**M6-SET-1 — Settings & data control.** Mail accounts (connect/re-auth/disconnect + purge), job sources + keys, AI toggle "Allow sending email text to AI", notifications + quiet hours, desktop launch-at-login + menu bar/tray mode (opt-in), update channel, **Export everything** (ZIP: JSON + files), **Delete account** (hard delete incl. Storage and token revocation).

**M6-SEC-1 — Security review.** Electron hardening (contextIsolation, sandbox, no nodeIntegration, strict CSP, zod-validated IPC allowlist, https-only `openExternal` allowlist, navigation blocked, Fuses: RunAsNode off, ASAR integrity on); iOS Keychain sessions, `PrivacyInfo.xcprivacy`, App Privacy answers; data minimization (non-job mail never stored; job-mail bodies kept while active + 180 days); AI minimum text, no PII in logs; crash reporting opt-in and scrubbed.

**M6-PERF-1 — Budgets.** Desktop cold start < 2.5 s; 60 fps with 5,000 jobs and 1,000 applications; iOS launch-to-interactive < 2 s; 3-account incremental sync < 30 s.

**M6-QA-1 — Final critiques & a11y.** Final-stage critique and accessibility review on every screen and website page; E2E: Playwright (Electron macOS + Windows, website), Maestro on iOS (onboarding, share-save, email apply, mail-driven status change, CV export).

**M6-DOC-1 — Docs.** Privacy policy, user guide, runbooks (release, accounts, Google verification/CASA for a public launch, Windows signing).

## 4. Out of scope for v1

Android, Linux, browser-extension autofill, automated form submission, LinkedIn integration beyond share/paste/alert emails, two-way calendar sync, payments, team/recruiter features, local LLMs (AI interface stays pluggable).

## 5. Open items owned by the user

Brevo account (needed for M1 sign-in), Microsoft Entra app registration (M5), job API keys (M4), Windows signing (before sharing). Steps: [runbooks/accounts.md](runbooks/accounts.md).
