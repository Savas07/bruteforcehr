# Design decisions (M0 synthesis)

Date: 2026-10-22. Scope: every cross-doc conflict and open question in the 14 research docs (`docs/design/research/*.md`, including `desktop-chrome.md` and `website.md`) that doesn't need the user. Inputs also include ADR 0002 (data model, `@bfhr/core`) and ADR 0003 (sign-in). Each decision lists the options, the decision, why, and the docs it changes. Where a decision changes a research doc, this file wins until the research doc is updated in its next critique round.

The decisions that needed the user (taste or legal) are recorded at the end as U1–U8. The user made all of them on 2026-10-22, so none are open.

Shorthand: **Mod** = ⌘ on macOS, Ctrl on Windows. "Research" = `docs/design/research/`.

## Navigation and IA

### D01 · Where the "To review" badge lives

- **Options:** (a) badge on Today and Mail; (b) Mail only; (c) Today only. connect-email also puts a scan-done count and a progress ring on the desktop Mail item, and desktop-chrome plans "counts on Today and Mail".
- **Decision:** one badge, on **Mail** only: the iOS Mail tab and the desktop Mail sidebar item. The number is the count of `mailMessages` with `reviewState == "pending"`, excluding items snoozed with "Review later" until they're due. Backfill proposals the user postponed with "Not now" are part of that count (see D17). While an inbox scan runs, the desktop Mail item shows a progress ring instead of a number, and the number takes its place when the scan is done. Today shows the same count as plain header text ("To review · 3"). Today, Jobs, Tracker and CVs never get a badge. Account health is a status, not a count: an amber dot plus "Needs attention" on Settings › Mail accounts and on the Mail account rows.
- **Why:** the number belongs where the queue lives, and showing it twice is noise (mail-review OQ1, today-home). One number with one meaning also keeps the scan ring from competing with it.
- **Affects:** today-home, mail-review, connect-email, settings-account, desktop-chrome ("Later: counts on Today and Mail" becomes Mail only).

### D02 · Saved and Preparing: Tracker or Jobs

- **Options:** (a) "Save" on a job is only a feed bookmark (`jobMatches.state = saved`) and the Tracker starts at Applied; (b) "Save" creates an application in `saved`, so the Tracker's Shortlist phase and Jobs › Saved show the same items; (c) two separate "saved" concepts with different names.
- **Decision:** (b), one concept. **Save** on a job writes, in one batch, an application with `status: "saved"` and `jobId`, its `created` event, and `jobMatches/{jobId}.state = "saved"` (kept for feed ranking and filters). Jobs gets a **Saved** scope (iOS scope chip, desktop sidebar child) that lists the same items as the Tracker's Saved stage. Opening the Apply sheet moves the application to **Preparing**. Unsaving from Jobs deletes the application only while it is still `saved` and has nothing but its `created` event, with an Undo toast. Once it has moved on, the bookmark is replaced by its status pill (feed research: "Applied" chip) and there's nothing to unsave. "I'm not applying" in the Apply flow moves it back to Saved (apply.md). The Tracker shows the Shortlist phase in its Active scope. On iPhone, Saved starts collapsed above 5 items. On the desktop board, Saved is a normal column that Display › "Show Saved" can hide (default on).
- **Why:** the brief's status list starts at Saved (§4.6) and job actions are "save, dismiss, apply" (§4.3). A second "saved" with a different meaning would confuse people. Linking the two through `applications.jobId` gives one source of truth, and Today's Deadlines can use saved jobs' closing dates (today-home) without a third list.
- **Affects:** tracker OQ2, job-feed-search (Saved scope added), job-detail, apply, today-home, states ("Back to Jobs" for a removed job stays valid). **ADR 0002 follow-up F1.**

### D03 · Insights entry point on iOS

- **Options:** a sixth tab; inside the avatar sheet; a Tracker toolbar button plus a Today footer link (insights OQ3).
- **Decision:** a **Tracker** nav-bar button (SF Symbol `chart.bar.xaxis`, label "Insights") that pushes Insights on the Tracker stack, plus a "This week in Insights" footer link on Today. The deep link is `bruteforcehr://insights`. Desktop keeps the sidebar item at position 6 (Mod+6).
- **Why:** five tabs is the iPhone maximum before "More", and Insights is a desktop-first, heavy-work view (§4.1 device roles). The avatar sheet is for account and settings, not data. Insights is a view over the tracker, so Tracker is where people look for it.
- **Affects:** insights, today-home, IA.md.

### D04 · Desktop window minimum and layout breakpoints

- **Options:** 960 × 640 (onboarding, insights, connect-email); 480 × 360 (desktop-chrome, already implemented with a 60 px rail below 640).
- **Decision:** **480 × 360** stays (it's implemented and supports Snap thirds and quadrants). Every screen degrades through shared window-width breakpoints in `@bfhr/ui-tokens` `layout.breakpoint`: `compact` 640 (sidebar becomes the icon rail), `narrow` 980 (detail panes push instead of splitting), `preview` 1100 (CV and email previews become a toggle), `detail` 1200 (Today detail pane, one-line filter bar), `wide` 1440 (agenda rail, Mail details rail). Fixed widths from research (onboarding 560 + 280 px, apply panel 400–640 px) stack or turn into a pushed view below them.
- **Why:** Snap layouts matter on Windows and desktop-chrome cites Microsoft's guidance. Shared breakpoints give one set of degradation rules instead of one per screen.
- **Affects:** onboarding-signin, connect-email, insights, cv-editor, apply, job-feed-search; tokens `layout`.

### D05 · Accent color: brand or OS accent

- **Options:** follow the OS accent color (desktop-chrome OQ3) or use the brand accent.
- **Decision:** **brand accent** (`accent.*` tokens) on every platform. The sidebar selection stays a neutral fill (desktop-chrome), and the focus ring uses `line.focus`.
- **Why:** OS accents include yellow and graphite, which fail contrast for text and focus rings. The website and iOS need the same brand. Every brand pair is contrast-tested.
- **Affects:** desktop-chrome OQ3, job-feed-search ("system accent selection" on macOS becomes the neutral selected fill with an accent focus ring).

### D06 · Command palette vs search

- **Decision:** **Mod+K** is always the global palette (navigation, entities, actions, settings; see IA.md). **Mod+F** and `/` search within the current section (Jobs query, Tracker search, Find in CV, Settings search). Apply's "Insert field…" in the cover-letter editor doesn't use Mod+K; typing `{` opens the merge-field menu.
- **Why:** desktop-chrome OQ4 proposed exactly this. apply.md used Mod+K for two things.
- **Affects:** desktop-chrome, apply, job-feed-search.

### D07 · Windows menu access

- **Options:** add a "⋯" app-menu button to the title bar, or rely on the palette and shortcuts sheet (desktop-chrome OQ5).
- **Decision:** no extra button. Every native-menu command is registered once in `apps/desktop/src/shared/shortcuts.ts`, so it appears in the palette (with its keycaps) and the shortcuts sheet on both platforms. Context menus cover per-item actions.
- **Why:** the palette already reaches every command from the keyboard, and a hidden menu behind a "⋯" would duplicate it.
- **Affects:** desktop-chrome.

### D08 · Settings › Job preferences

- **Decision:** add **Job preferences** to Settings: on iOS, a row under the account header next to Profile; on desktop, an "Account" group page. It reuses the onboarding section editors with Glassdoor-style summary rows (onboarding-signin). **Application answers** (the Apply answers library) gets its own Settings page under "Preferences".
- **Why:** onboarding promises "Settings › Job preferences", but settings-account has no such row.
- **Affects:** settings-account, onboarding-signin, apply.

### D09 · Calendar and Today

- **Decision:** **Tracker › Calendar** is the only calendar. Today shows Next up (interviews within 48 h) and Deadlines as rows. On desktop at ≥ 1440 px, Today adds a read-only 7-day agenda list, not a grid. Next up stays fixed at 48 h in v1.
- **Why:** tracker OQ6 and today-home already agree. A configurable window adds a setting nobody asked for.
- **Affects:** tracker, today-home.

### D10 · Hidden jobs and saved searches

- **Decision:** the same names on both platforms: **Saved** (D02), saved searches, **Hidden jobs**. iOS: the scope chips are `All matches · Saved · <saved searches> · +`, and the Saved searches screen (toolbar) has a "Hidden jobs" row. Desktop: these are nested sidebar children under Jobs. Hidden jobs stay hidden until unhidden, and their dedupe fingerprint is kept so the same job doesn't come back from another source.
- **Why:** each platform puts the entry where its idiom puts it, but the names match. job-feed-search OQ7 asked about retention, and the fingerprint answers it.
- **Affects:** job-feed-search.

## Trust: automatic changes, Undo and toasts

### D11 · Undo window for automatic changes

- **Options:** a time-limited Undo (toast only), N days, or no time limit (tracker OQ3, mail-review OQ3).
- **Decision:** two layers.
  1. **Durable Undo.** Every status change, automatic or manual, can be undone with no time limit while it is the application's latest status move. This is `canRevert` in `@bfhr/core`. It lives on the timeline row, the Today auto-change row, and the Mail › Updates list (last 14 days). When a later move supersedes it, the row reads "Can't undo — the status changed since." Undoing an automatic change also marks the mail `corrected` (core).
  2. **Toast Undo.** A toast is a shortcut to the latest action, not the only way back. It shows for `timing.toast` (6 s), or `timing.toastExtended` (10 s) when a screen reader is on, the text runs over 60 characters, or the action touched more than one item (bulk moves, backfill import). It pauses on hover and focus. Mod+Z undoes the latest action even after the toast has gone.
  - **The one hard window is email send.** The server dispatches at `serverAck + 10 s` (apply.md). The toast counts down from the server's `sendAt`, and Undo cancels the Cloud Task. After that, a sent email can't be recalled, and the copy says so.
- **Why:** this matches the state machine that's already built (ADR 0002: no time limit) and the trust principle (every automatic action can be undone). The toast durations from four docs (6 / 8 / 10 s) collapse into one rule.
- **Affects:** tracker, mail-review (8 s → 6 s / 10 s), connect-email (import toast: 10 s by the bulk rule), states, today-home, job-feed-search; tokens `timing`.

### D12 · Toast position and behavior

- **Options:** desktop bottom-left (apply, tracker, mail-review) vs bottom-center of the content area (states OQ2).
- **Decision:**
  - **iOS:** a dark snackbar docked 8 pt above the tab bar, or above the sticky bottom bar (ApplyBar, toolbar) when there is one. It stays above presented sheets. Undo is right-aligned with a ≥ 44 pt target. At accessibility text sizes or with VoiceOver on, it switches to the large-target variant with a full-width Undo. Swipe down dismisses it.
  - **Desktop:** bottom-left of the **content area** (not the window): 16 px from the sidebar edge and the bottom, max 480 px wide, wraps. Undo shows its keycap (Mod+Z). Popovers attached to a toast (the "Why?" dismiss reason) open above it.
  - **Both:** one toast at a time. A newer toast replaces the older one, whose action stays undoable through Mod+Z and history. After Undo, the follow-up toast reads "Restored · Open" and never offers another Undo. Toasts are announced politely (`aria-live="polite"` / UIAccessibility announcement).
- **Why:** bottom-left keeps toasts away from the right-hand detail and Apply panels, which is why three docs chose it. Anchoring to the content area (states' concern) keeps it next to the list being acted on and clear of the sidebar's sync line.
- **Affects:** states OQ2, apply, tracker, mail-review, today-home.

### D13 · AI suggestion vocabulary and bulk accept

- **Options:** cv-editor allows "Use all" and "Accept all in section"; apply forbids any accept-all (§2.4).
- **Decision:** **no bulk accept** for AI-written content anywhere. A queue ("Improve all bullets", Suggestions tab) is fine, but every item is decided one by one. "Keep original for the rest (n)" is allowed because it adds no AI text. One vocabulary:
  - Actions: **Use suggestion** · **Keep original** · **Edit**. Desktop keys: `A` use, `R` keep original, `E` edit. Inline tracked changes: Mod+Enter use, Esc keep original, F8 / Shift+F8 next / previous suggestion.
  - Disclaimer: "Suggested by Claude. Check names, numbers and dates before you use it."
  - Chip: "AI-assisted" with the sparkle symbol. On a match summary: "AI summary · can be wrong".
  - Toasts: "Suggestion applied · Undo" and "Saved as a new version · Undo".
- **Why:** the brief requires that CV content is never invented and every change is the user's choice (§2.4). Bulk accept turns review into a rubber stamp. Two vocabularies for the same act read as two features.
- **Affects:** cv-editor (remove "Use all", "Accept all in section"; "Keep mine" becomes "Keep original"), apply.

### D14 · Undo of "Save as new version" (tailoring)

- **Decision:** Undo **archives** the new variant (CVs are archive-only in v1, ADR 0002) and reselects the previous CV in the Apply checklist. This is only offered while no application has pinned the variant.
- **Why:** apply.md said "deletes", but CVs can't be deleted (ADR 0002, cv-editor). Archive is reversible, which fits better anyway.
- **Affects:** apply OQ9, cv-editor.

## Status and outcome vocabulary

### D15 · Ghosted, follow-up and "still waiting" labels

- **Decision:**
  - Status `ghosted` displays as **No response** (TR "Yanıt yok", DE "Keine Rückmeldung") everywhere: pills, scope chips, outcome sheet, Closed rail, Insights.
  - The suggestion card reads "No reply in 21 days. Mark as no response?" with **Mark as no response** / **Keep waiting**.
  - Insights' bucket for applications that haven't responded yet is **Still waiting** ("3 still waiting"), not "No reply yet". It's a different set (not marked, just waiting).
- **Why:** tracker used three names and insights a fourth. "Ghosted" is slang and judges the employer, while "No response" is a fact.
- **Affects:** tracker, insights.

### D16 · Invalid-move reason

- **Decision:** one string per rule, generated from `TransitionError.code`. For `outcome_requires_offer`: "Accepted and Declined come after an offer." For `automation_*` codes no copy is needed, because automation never reaches the UI as a user choice. Disabled targets are shown greyed with the reason (tooltip on desktop, footnote in the iOS Move to… sheet), never hidden.
- **Why:** tracker had two wordings for the same rule.
- **Affects:** tracker.

### D17 · Backfill proposals and the review queue

- **Options:** a `backfillProposals` subcollection, or review fields on `mailMessages` (connect-email OQ2).
- **Decision:** proposals are `mailMessages` with `reviewState: "pending"`, grouped on the client by proposed application (company + role, plus the linked `applicationId` when it already exists). Backfill progress lives on `mailAccounts/{id}.backfill` (server-written, client read-only). "Not now" keeps them pending. Mail › To review then shows one **bundle row** ("Inbox scan · 14 applications to review"), which opens Backfill Review instead of 40 single-email rows. Each proposal in the bundle counts once toward the Mail badge.
- **Why:** this needs no new collection or rules, reuses the review fields clients may already write, and keeps the large first-run batch from flooding the queue.
- **Affects:** connect-email, mail-review. **ADR 0002 follow-up F4.**

### D18 · Rejection wording (everything except the status label)

- **Decision:**
  - Mail category `rejection` displays as **Decision**: "Acme decided not to move forward. We updated the application."
  - The notification kind is **Decisions**, and it can be muted.
  - The backfill review group header uses the status display label from U2 ("Not selected").
  - No red, no "unfortunately", no "Sorry".
- **Why:** mail-review, settings-account and today-home already agree. Only the status label was open, and the user settled it (U2).
- **Affects:** connect-email ("Not moving forward" header becomes the status label), mail-review, settings-account, today-home.

### D19 · Dismiss verbs and snooze presets

- **Decision:**
  - **Not for me** for jobs, both in the feed and in Today's New matches.
  - **Not needed** for suggestions (follow-up, ghosted).
  - **Not job mail** for mail.
  - The word "Dismiss" doesn't appear in the UI. On desktop, `D` triggers whichever of these applies to the focused row.
  - Snooze presets: Later today · Tomorrow · Next week · **Pick a date…**, numbered 1–4 in the desktop menu.
  - The dismiss toast reads "Hidden from your feed · Undo · Why?" on desktop. On iOS the inline undo row reads "Hidden · Undo · Tell us why".
- **Why:** the docs had five wordings for three different acts. Each object keeps its own verb, and the shortcut stays the same.
- **Affects:** today-home, job-feed-search, job-detail, mail-review.

### D20 · CV conflict wording

- **Decision:** states.md's wording applies everywhere.
  - Banner: "This CV changed on another device. {device} saved a newer version at {time}."
  - Actions: **Keep this version** · **Use the other version** · **Compare**.
  - Compare columns: "This device" vs "{device}, {time}". Desktop adds per-field picks and **Save merged version**.
  - The losing side is always written as a revision first, so the restore confirmation can say it "stays in history".
- **Why:** the brief's "keep mine / keep theirs" implies another person. Here there is only one user on several devices.
- **Affects:** cv-editor, states, BRIEF §6.3 wording.

## Mail, sending and apply

### D21 · Mail scopes: read first, send on first email-apply

- **Options:** request read and send at connect (BRIEF §3 lists `Mail.Send`), or incremental consent (connect-email OQ1).
- **Decision:** least privilege. Connect asks only for **read**:
  - **Gmail:** `https://www.googleapis.com/auth/gmail.readonly`.
  - **Microsoft Graph:** `Mail.Read`, `offline_access`, `User.Read`.

  **Send** is requested the first time the user picks that account in Apply › Send via Email:
  - **Gmail:** `https://www.googleapis.com/auth/gmail.send`, with `include_granted_scopes=true`.
  - **Graph:** `Mail.Send`.

  `FromAccountPicker` shows "Allow sending from {address}". That opens the same browser handoff (`/connect/{provider}?nonce=…&intent=send`), which returns to `bruteforcehr://connected?intent=send` and then to the Review email step, with the draft intact. `mailAccounts.canSend` drives the picker. IMAP accounts collect SMTP settings at connect, because the app password covers both, so they need no second step. Screen B keeps four promises. The fifth ("Sends only what you send") appears on the send-consent step.

- **Why:** people who only want tracking never grant send, and Google's review of restricted Gmail scopes is easier to justify one scope at a time. It also keeps the first connect screen calm.
- **Affects:** connect-email, apply, settings-account, website (privacy policy lists both scope sets). **Needs an ADR amendment by the backend owner:** BRIEF §3 lists `Mail.Send` up front, and ADR 0002 leaves `mailAccounts.scopes` free-form.

### D22 · Daily send cap

- **Options:** core default 20 with a schema range of 0–200; apply proposed 20, configurable up to 50.
- **Decision:**
  - Default **20** per user per local calendar day, using `profile.timezone`.
  - Settings › AI & sending offers **5–50** in steps of 5.
  - The send function enforces it on the server. The client shows `SendBlockerLine`: "Daily limit reached. Your draft is saved, and you can send it tomorrow."
  - The "near" line ("You can send 3 more emails today.") appears only at ≤ 5 remaining, never as a progress bar.
- **Why:** 50 is already far beyond careful one-by-one applying. A ceiling of 200 invites the bulk sending the brief forbids (§2.3).
- **Affects:** apply, settings-account. **ADR 0002 follow-up F5:** the schema max becomes 50.

### D23 · Apply route preference and default channel

- **Options:** apply.md preselects Email whenever both routes exist. job-detail OQ6 orders the routes direct ATS → company site → `applyEmail` → aggregator.
- **Decision:** one order everywhere, **direct ATS → company site → apply email → aggregator**. It sets the `ApplyButton` label and the preselected **Send via** row. Email is preselected only when it ranks first (the posting asks for email, or the only URL is an aggregator). Both choices are always listed with their source line, and switching takes one tap. A recruiter address the user types in makes Email the choice.
- **Why:** the posting's own route is the one the employer reads. A generic mailbox found next to an ATS link is often unmonitored.
- **Affects:** apply, job-detail.

### D24 · Cover letter: body or attachment

- **Decision:** the default is a short intro in the email body plus the cover letter attached as a PDF, the same for every country. "Cover letter in message" stays a toggle in the compose form. There are no per-country defaults in v1.
- **Why:** this works for both DE (attached Anschreiben) and UK/US (readers who read the body). Per-country rules would be guesses.
- **Affects:** apply OQ10.

### D25 · Push permission timing

- **Decision:** never ask at launch. Ask in context the first time the user turns on a saved-search alert, or after the first successful import ("Get notified when an employer replies?"), whichever comes first.
- **Affects:** connect-email OQ10, job-feed-search, settings-account.

### D39 · No notification center screen on iPhone

- **Decision:** there's no in-app notification center (bell) screen. Mail › **Updates** is the history of automatic changes, and push notifications deep-link to the review sheet or the Updates row; their only action is **Open**. Recorded 2026-10-24 from the mail-review research decision so the BRIEF §5.3 "notification center" row in STATUS.md can point at an id.
- **Why:** a second list of the same events would compete with Updates, and confirming from a notification without seeing the evidence breaks the trust principle (mail-review.md "Notification center").
- **Affects:** mail-review, STATUS.md (iOS Notification center row is N/A).

### D26 · Scope items deferred (not in the brief)

- **Decision:** these stay out of v1. Revisit after the mail fixture set exists (M5).
  - Sender or domain exclusion lists (connect-email OQ5).
  - Corrections that become sender rules (mail-review OQ2).
  - Inline profile questions in the feed (job-feed-search OQ6).
  - On-demand AI summaries for non-top-N jobs (job-detail OQ3).
- **Why:** none is required by the brief, and each adds a settings surface or an AI call per tap.

## Keyboard

### D27 · Shortcut conflicts

The consolidated map is in [IA.md § Keyboard map](IA.md#keyboard-map). These changes resolve the conflicts between research docs:

| Conflict                                  | Was                                                               | Now                                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Version history                           | ⌘⌥H (macOS Hide Others)                                           | **Mod+Shift+H**                                                                                                                     |
| Toggle inspector / details panel          | ⌘\\ (hard to type on DE/TR layouts)                               | **Mod+Shift+D**                                                                                                                     |
| Preview toggle (CV editor, email compose) | ⌘⇧P in both docs, kept                                            | **Mod+Shift+P** stays: the app has no Print or Page Setup command (export is Mod+E), so Mod+P stays unassigned and nothing collides |
| Collapse section                          | ⌘. (macOS cancel)                                                 | no shortcut; Enter / Space on the focused section header                                                                            |
| Next / previous AI suggestion             | ⌥] / ⌥[ (types characters on macOS, brackets need AltGr on DE/TR) | **F8 / Shift+F8**                                                                                                                   |
| Apply panel steps                         | Mod+[ / Mod+] (global Back/Forward)                               | **Mod+↓ / Mod+↑** inside the panel                                                                                                  |
| Insights range                            | `[` / `]` (AltGr on DE/TR)                                        | ← / → while the range control has focus                                                                                             |
| Insert merge field                        | Mod+K (palette)                                                   | type `{`                                                                                                                            |
| Mail "Change…"                            | `F` (focus filters elsewhere)                                     | **`M`**, as in Tracker's Move to…                                                                                                   |
| Backfill review status                    | `S` (Save elsewhere)                                              | **`M`**                                                                                                                             |
| Today dismiss                             | `#` (AltGr+3 on TR)                                               | **`D`**                                                                                                                             |
| Tracker board columns                     | `H` / `L` (`H` = Later elsewhere)                                 | ← / →                                                                                                                               |
| Rename                                    | ⇧R                                                                | **F2** (plus the context menu)                                                                                                      |
| Export                                    | ⌘E for CV, CSV, Insights                                          | **Mod+E** = "Export…" for the current view (one command, context decides the format)                                                |
| Primary action                            | Mod+Enter, overloaded                                             | kept, with one rule: Mod+Enter runs the primary action of the focused surface (Continue, Send, Import, use suggestion, open record) |

- **Why:**
  - Avoid OS-reserved keys and keys the webviews reserve (⌘H, ⌘⌥H, ⌘M, ⌘Q, ⌘W, ⌘P, ⌘⌥I / Ctrl+Shift+I, Ctrl+R, F11, F12, Alt+F4, Alt+Space, Win+…). The desktop app is Tauri 2: WKWebView on macOS, WebView2 on Windows.
  - Avoid keys that need AltGr on German and Turkish layouts.
  - One letter means one thing across views.

### D28 · Single-key shortcuts

- **Decision:** bare-letter and digit shortcuts fire only when focus isn't in a text field, an editable cell or a combobox. They're matched on `event.key` (the character), so `?` and `/` work on every layout, while Mod+digit matches physical keys (desktop-chrome). They're always listed in the menu, tooltips and the shortcuts sheet. `?` opens the shortcuts sheet as well as Mod+/, because "/" needs Shift on DE and TR layouts.
- **Affects:** every desktop research doc.

## Deep links

### D29 · `bruteforcehr://` scheme

- **Decision:** the custom scheme from the kickoff is ratified. The full route map is in [IA.md § Deep links](IA.md#deep-links).
  - **No universal links** in v1, because there's no custom domain.
  - **Links only navigate.** They never confirm, send, import or change data, so a forged link can at most open a screen.
  - `connected` is accepted only with the nonce of a pending connect started on this device. Anything else lands on Today with no error.
  - On desktop, `app.setAsDefaultProtocolClient("bruteforcehr")` handles the links: `open-url` on macOS, the second-instance argv on Windows.
- **Why:** connect-email depends on it, notifications need targets, and Insights drill-downs need filterable Tracker URLs. ADR 0002 and ADR 0003 don't define the scheme, so it's recorded here.
- **Affects:** connect-email, insights, mail-review (push targets), job-detail OQ8. ADR follow-up: the backend `/connect/**` handler redirects to these URLs.

## Storage and data-model follow-ups (for ADR 0002)

These are proposals for the ADR 0002 owner. None changes rules that are already merged. They name the paths the research needs.

### Cloud Storage

ADR 0002 defines only `users/{uid}/cv-imports/{fileId}` and `users/{uid}/rendered/{fileId}`. Proposed additions, all under the same `users/{uid}/` prefix so "Delete account" stays one prefix delete:

| Path                                 | Holds                                                                                                           | Written by                                     | Lifecycle                                                                  | Research         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| `users/{uid}/exports/{exportId}.zip` | "Export everything" ZIP (JSON + files)                                                                          | Server (export callable)                       | Deleted after 7 days (bucket lifecycle rule on the prefix)                 | settings-account |
| `users/{uid}/attachments/{fileId}`   | Extra files the user attaches to an email application (portfolio PDF, certificates) from Files or the drop zone | Client upload, ≤ 20 MB total per email (apply) | Kept while an application references it, then deleted with the application | apply            |
| `users/{uid}/cv-photos/{fileId}`     | Photo for CV variants that turned it on (U6: opt-in per variant, off by default)                                | Client upload                                  | Deleted when no CV revision references it                                  | cv-editor OQ8    |

Explicitly **not stored**:

- Avatars (the avatar is an initials monogram; there's no upload in v1).
- Inbound mail attachments (we link to the provider message instead).
- Company logos (monogram fallback; any logo source is fetched at render time and not persisted).

### Firestore

| #   | Change                                                                                                                                                                                                                                                                                    | Why                                                                 | Research                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------- |
| F1  | Contract: "Save" writes `applications` (`status: saved`, `jobId`) + `created` event + `jobMatches.state = saved` in one batch. "Is this job tracked?" is `applications where jobId == …` (single-field, auto-indexed)                                                                     | D02                                                                 | tracker, job-feed-search         |
| F2  | `users/{uid}/exports/{id}`: status, sizeBytes, storagePath, expiresAt (server-written, client read)                                                                                                                                                                                       | Export cards with expiry                                            | settings-account OQ2             |
| F3  | `users/{uid}/jobSources/{sourceId}`: enabled (client), `{configured, last4, lastUsedAt, lastError, jobsLastRun}` (server)                                                                                                                                                                 | Key state without exposing secrets                                  | settings-account OQ2             |
| F4  | `mailAccounts/{id}.backfill`: `{windowDays, since, scanned, total?, candidates, stage, finishedAt}` (server-written)                                                                                                                                                                      | Scan progress + D17                                                 | connect-email OQ2                |
| F5  | `settings.dailySendCap` max 50 (was 200)                                                                                                                                                                                                                                                  | D22                                                                 | apply                            |
| F6  | `applications/{id}.emailSend`: `{state: scheduled\|sent\|cancelled\|failed, sendAt, providerMessageId, threadId}`; the Cloud Task name stays server-only                                                                                                                                  | Real 10 s window, "Sending in 7 s · Cancel" banner                  | apply OQ2                        |
| F7  | `users/{uid}/templates/{id}` (kind `email` \| `cover_letter`, language, body) and `users/{uid}/answers/{id}` (category, label, per-language values, country/currency tags)                                                                                                                | Templates and the answers library                                   | apply OQ1                        |
| F8  | `mailMessages` review snooze: add `reviewLaterUntil` to the client-updatable review fields                                                                                                                                                                                                | "Review later" (H) without a new collection                         | mail-review, today-home          |
| F9  | `applications/{id}.followUpSnoozedUntil`, `jobMatches/{id}.snoozedUntil`                                                                                                                                                                                                                  | Snooze for computed Today items, on the source doc (today-home OQ1) | today-home                       |
| F10 | `mail_received` events carry `mailCategory` (and `revertsEventId` stays status-only)                                                                                                                                                                                                      | Insights "response" from replies that don't change status (D30)     | insights OQ1                     |
| F11 | Tailored CVs: `Cv.variantKind` `role` \| `language` \| `tailored` and `tailoredForJobId`                                                                                                                                                                                                  | apply creates tailored variants, cv-editor's kinds lacked one       | apply, cv-editor OQ1             |
| F12 | Profile settings: `settings.notifications.{kind}` (interviews, offers, assessments, decisions, reauth, matches) and the quiet-hours shape `{enabled, days, start, end, timeZone, summary}`                                                                                                | Notification settings, settings-account proposal                    | settings-account                 |
| F13 | Appearance is **not** synced to Firestore. iOS follows the system, with no in-app override (HIG). Desktop: Settings › Desktop app › Appearance (System / Light / Dark, default System), also in the palette, stored per install by the Tauri app and applied as `data-theme` on `<html>`. | Appearance is a device preference                                   | settings-account, desktop-chrome |

## Insights

### D30 · What counts as a "response"

- **Options:** status changes only, or status changes plus human replies that don't change status (insights OQ1).
- **Decision:** for an application in the cohort (its `applied` move falls in the range), the **first response** is the earliest of:
  1. a `status_changed` event (any actor, not undone) to `screening`, `interviewing`, `offer` or `rejected`, after it reached Applied;
  2. a `mail_received` event linked to the application with `mailCategory` in `interview_invite`, `assessment`, `offer`, `rejection` or `info_request` (F10).

  Excluded: `acknowledged` and `application_received` (automatic receipts), `ghosted` and `withdrawn` (not employer actions), and `recruiter_outreach` (often not about this application).
  - Response rate = responded ÷ cohort, with `n` always shown and rates suppressed below n = 5.
  - Median time to first response covers responded applications only, with "{n} still waiting" alongside.
  - Channel comes from `applications.channel` (core enum).
  - The "Market" filter derives the country from `applications.location` (and the job's `countryCodes`), with "Remote" as its own value.

- **Why:** a human reply is a response even when the status doesn't change. Receipts are automatic, so counting them would inflate the rate. A single definition in `@bfhr/core` keeps iOS and desktop identical.
- **Affects:** insights. **Core follow-up:** `insights` selectors and F10.

### D31 · Insights computation and threshold

- **Decision:** computed on the client from `applicationEvents` in v1 (works offline). Revisit above a few thousand events. The low-sample threshold is fixed at n < 5, not configurable. iOS ranges are `4W · 12W · All` and desktop ranges are `30D · 90D · 6M · 12M · All · Custom…`; the platforms differ on purpose, so each fits its width.
- **Affects:** insights OQ4, OQ6.

### D36 · Insights implementation rules (M3)

- **Applied date:** the application's `appliedAt` (the spreadsheet date for CSV imports), counted only when a kept (not undone) `created` / `status_changed` event reached Applied or later, or a `created` into a closed status with `appliedAt` set. Stages reached by the `created` event itself count, but their time is unknown (excluded from medians).
- **Mail responses (D30 rule 2) before F10:** `mail_received` events resolve their category through `evidence.mailMessageId` → `mailMessages/{id}.category`. Clients pass `mailCategories`; desktop and iOS live data don't sync mail messages yet (M5), so until then only status moves count.
- **Market:** keyword match of `applications.location` against the target markets' countries and main cities (diacritics folded), else `remote`, else none (`@bfhr/core` `marketOf`).
- **Funnel monotonic:** interview = reached Interviewing or later, offer = reached Offer or later.
- **Weekly activity:** 12 weeks ending this week, independent of the range; follow-ups = `mail_sent` more than 1 h after applying; interviews = `interviews.startsAt` up to now.
- **Drill-down URL:** `stage` (applied · responded · interview · offer · waiting · no_response · withdrawn) or `activity` (applied · follow_up · interview), `from`/`to` (YYYY-MM-DD), `source`/`channel`/`cv`/`market` (`none` = unset); resolved by `selectDrillDownIds` on both platforms.
- **Affects:** insights, tracker (table drill-down chip), conformance `packages/core/conformance/insights.json`.

## Tracker

### D32 · No drag-to-move on iPhone in M0

- **Options:** (a) three equal move paths on iPhone: Move to…, swipes, and dragging a row onto a stage; (b) Move to… and swipes only (tracker OQ5).
- **Decision:** (b), recorded for the integration owner on 2026-10-22. On iPhone an application moves through **Move to…** (long-press context menu, the row's VoiceOver action, the detail's status pill and ⋯ menu) and **swipe actions** (leading "Move to {next stage}", trailing Move to… / Close…). There's no drag affordance, so nothing half-working ships. Desktop keeps drag between board columns. Revisit with real usage in M3.
- **Why:** in the Pipeline (a `List` whose rows also carry a context menu), the long press opens the menu instead of lifting the row. Three implementations failed under XCUITest: `.draggable` on the row, `onDrag`, and `.draggable` on the row content, each with the stage strip as drop targets. Both remaining paths reach every status, work with VoiceOver and Switch Control, and go through the same state machine with Undo (critiques/ios/tracker-board r2–r4).
- **Affects:** tracker (iOS decision, OQ5 → "no for now"), components.md `StageIndexStrip` (no drop-chip mode on iPhone).

### D33 · iPhone reminders are local notifications the user sets

- **Options:** (a) push notifications from the server for reminders and interview prep; (b) local notifications scheduled on the device from the user's own reminders; (c) also notify for follow-up suggestions.
- **Decision:** (b), M3. A dated reminder on an application (`nextAction` + `nextActionAt`, synced) notifies at its time; interview prep ("1 hour before" / "1 day before") is chosen per round **on this device** (stored per user in `UserDefaults`, not synced). Suggestions never notify (automation never runs on clients). Permission is asked only the first time the user sets a reminder, after an in-app explainer that previews that reminder as a notification ("Turn on notifications" / "Not now"); after a refusal the reminder editor says notifications are off and links to Settings. At most 64 pending, soonest first; sign-out removes them. Tapping one opens `bruteforcehr://applications/{id}` or `interviews/{id}`.
- **Why:** reminders are the user's own and must work offline; a server push path is M5+ (devices collection, quiet hours). Prep timing is a per-phone preference, like an alarm.
- **Affects:** tracker (detail Reminder, Interviews), today-home (Deadlines lists the reminder), settings-account (Notifications page later lists these kinds).

### D34 · iPhone Calendar is a dated agenda list

- **Options:** (a) week strip + month sheet + agenda (tracker.md iOS-7); (b) the agenda list only.
- **Decision:** (b) for M3: Tracker › Calendar (title menu and a toolbar switch) is a list grouped by day with **Upcoming · Past** (90 days). Rows: interviews (time, type · round, Add to Calendar (.ics)), reminders ("Overdue" in amber, never red), suggested follow-ups (all-day, from 7 days after applying, honouring "Not now" and snoozes) and email deadlines. Overdue reminders and due follow-ups sit on today in Upcoming. Rows open the Application detail.
- **Why:** the agenda is what users act on (Joi, Posh, Luma); a month grid adds little at personal volume. The week strip can come later without changing the data.
- **Affects:** tracker (iOS calendar), components.md `WeekStrip` / `MonthSheet` (deferred), `IcsExportAction` (UTC event, organiser zone in the description).

### D35 · CSV import is desktop-only in v1

- **Decision:** importing applications from a spreadsheet exists on desktop only (Tracker table, bulk review). iPhone offers **Log an application** for one at a time, and its empty Pipeline says "Have a spreadsheet of applications? Import it in the desktop app." Imported applications reach iPhone through Firestore like any other, with a `created` event whose reason reads "Imported from {file} · row {n}" (shown on the timeline).
- **Why:** mapping columns and reviewing duplicates needs a large screen and a file picker the iPhone flow doesn't have; the brief puts bulk tracking on desktop (IA.md device roles).
- **Affects:** tracker (empty state copy), flows.md §2 (Log an application), desktop tracker import.

### D37 · No Undo for "I followed up"

- **Options:** (a) Undo as a reverting event, like a status move (D11, D16); (b) no Undo: the follow-up stays on the timeline and the suggestion asks again after the next round.
- **Decision:** (b) in M3. "I followed up" appends a user `mail_sent` event; its toast reads "Follow-up noted · {company}" with no Undo, on desktop and iPhone.
- **Why:** `applicationEvents` are append-only and `revertsEventId` is reserved for user `status_changed` events (ADR 0002, `ApplicationEventSchema`): a reverting `mail_sent` would be refused by the schema on every shipped client, so older builds would drop the retraction and keep counting the follow-up. Allowing it is a contract change (schema rule + BFHRCore + rules tests) for a low-stakes action: a mistaken tap only moves the next follow-up suggestion by `followUpAfterDays`, and the user can still answer "Not needed" or snooze it. Revisit with M5, when follow-ups sent from the app write the same event.
- **Affects:** today-home, tracker (application detail suggestion card), states (toast without Undo).

### D38 · No Table view on iPhone

- **Decision:** the Tracker's Table view is desktop-only. On iPhone the title menu switches **Pipeline · Calendar** (D34); filtering and search on the Pipeline list cover what the table does. Recorded 2026-10-24 from the tracker research decision (tracker.md, iOS IA) so the STATUS.md row can point at an id.
- **Why:** a spreadsheet table on a phone truncates its columns (tracker.md, rejected for iOS), and the Pipeline list already lists every application with its status and dates.
- **Affects:** tracker, STATUS.md (iOS Tracker table row is N/A).

## Onboarding

### D40 · Onboarding step 3 is Finish (first saved search), not Mail

- **Options:** (a) step 3 = Connect mail (onboarding-signin.md flow); (b) step 3 = Finish: create the first saved search from the roles + places, refresh matches, land on Today.
- **Decision:** (b) on desktop and iPhone (M6 onboarding contract, 2026-10-24). The saved search uses the **first role** as its query (connectors require every query word, so roles are never OR-joined), the places' countries and the workplace types as filters, no seniority filter (matching scores it), daily, alerts for Good and above (score 65), `nextRunAt` = now; it is skipped when the user already has a saved search. Without a role or a place there is nothing to search for: the step offers "Back to preferences" and "Go to Today". Every step can be skipped; skipping all still sets `onboardingCompletedAt` (no re-prompt). Preferences are edited later in Settings › Job preferences. Mail is connected from Settings › Mail accounts or the Today card.
- **Why:** matching and Today need preferences and a running search to show anything on day one; mail connect needs OAuth apps that are not switched on yet (Entra registration pending) and has its own flow (connect-email.md).
- **Affects:** onboarding-signin (Desktop wizard, iOS flow), job-feed-search (first saved search), settings-account.

### D41 · Preference values follow the profile schema

- **Decision:** the research's preference controls map onto `ProfileSchema` as it is: **seniority is one value** (chips act as a single choice, choosing it again clears it), not "up to 2"; **work authorization** asks Yes / No / Not sure per country (one "EU / EEA" question for EU/EEA countries): Yes keeps a stored citizen or permanent-resident status and otherwise stores `work_permit`, No stores `needs_sponsorship`, Not sure stores no entry; **languages** use the CEFR levels (Native, C2–A1) instead of Native · Fluent · Professional · Basic; places carry country, optional city and "I'd move here" (`relocation`); "Remote worldwide" is the Remote workplace with no places, not a place. Desktop and iPhone write identical values.
- **Why:** changing the schema would touch matching, BFHRCore and the conformance vectors for a label difference; the stored values keep their meaning for matching (`needs_sponsorship` vs any other status, FLUENT = native–B2).
- **Affects:** onboarding-signin (Preferences), settings-account (Job preferences).

### D42 · Desktop CV step uses option rows, not an inline drop zone

- **Decision:** onboarding step 1 on desktop shows two option rows, **Import a CV file** (opens the CV Studio import dialog: upload → `cvImport` → review) and **Start from scratch**, plus the AI disclosure; after an import or a new CV the rows give way to a status card ("Imported from {file}", what it suggests for the next step). The research's 560 × 200 drop zone and first-page thumbnail card are not built.
- **Why:** the import dialog already has the drop zone, the parse progress and the review step with its error recovery; a second drop zone would duplicate that flow and its states. The review step is part of the import, so the thumbnail adds nothing the review doesn't show.
- **Affects:** onboarding-signin (Step 1/3 CV desktop), cv-editor (import).

### D44 · iPhone onboarding: one relocation toggle, four currencies, Skip finishes without a search

- **Decision:** on iPhone (M6), the Preferences step keeps the research's single **Open to relocation** toggle under Where: it sets `relocation` on every place (D41's per-place value, written the same way as the desktop). The salary floor's currency is a menu of the four target-market currencies (EUR, TRY, GBP, USD; default from the device region) instead of a searchable sheet. Step 3 has no separate "Finish without a search" button: **Skip for now** in the navigation bar finishes without one, and **Start searching** (or **Go to Today** when a saved search exists) is the only bottom action; D40's nothing-to-search state shows **Back to preferences** above **Go to Today**. An imported CV is saved straight to CV Studio without the review step; its low-confidence fields are checked there later (onboarding-signin.md "Decision — iOS", the Today card).
- **Why:** one toggle answers the question once instead of per place on a small screen; the four currencies cover every target market, and other currencies can be added when a market is; a second text button at the bottom of step 3 would sit next to the Skip that already does the same; the review step would break the ≤ 30 s CV budget.
- **Affects:** onboarding-signin (iOS Screens 3–4, Finish), settings-account (Job preferences on iPhone).

## Other open questions resolved

| Question                                                   | Decision                                                                                                                                                                                                           | Doc                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Match number on list rows                                  | Band pill only. The number appears in the detail ("72 of 100"), the dense mode, tooltips and the a11y label.                                                                                                       | job-detail OQ1           |
| "I have this" target                                       | `profile.skills` (server re-score, core). "Add to CV…" edits the CV.                                                                                                                                               | job-detail OQ4           |
| Jobs failing a hard filter, reached by search or deep link | Shown with an "Outside your preferences: {detail}" notice, never hidden                                                                                                                                            | job-detail OQ8           |
| Push threshold and digest defaults                         | Alerts for Good+ matches, daily digest at 09:00 local                                                                                                                                                              | job-feed-search OQ5      |
| Live result counts                                         | Count when a filter popover or sheet opens, then debounced (300 ms) while editing; never per keystroke                                                                                                             | job-feed-search OQ3      |
| Snoozed review items in the badge                          | Not counted until due (D01)                                                                                                                                                                                        | mail-review OQ5          |
| "Open in Gmail/Outlook"                                    | `providerMessageId` / `providerThreadId` are already client-readable in `mailMessages` (ADR 0002) and build the provider web URL; IMAP opens the default mail app with `message:` on macOS and is hidden elsewhere | mail-review OQ4          |
| Retention line                                             | Only inside the "Show full email" disclosure                                                                                                                                                                       | mail-review OQ6          |
| Lookback options                                           | 30 / 90 / 180 days; no 365 in v1 (cost)                                                                                                                                                                            | connect-email OQ4        |
| Default-checked backfill rows                              | Strong link (`thread` or `ats_company_role`) and confidence ≥ `settings.autoApplyConfidence`                                                                                                                       | connect-email OQ3        |
| Resend cooldown on the code screen                         | ADR 0003 has no cooldown, only 5 sends/hour with `retryAfterSeconds`. UI: "Send a new code" is enabled after 30 s (client-side), and a `rate_limited` reply shows "You can ask for a new code in {m} min."         | onboarding-signin OQ1    |
| Done-today reset                                           | Local midnight                                                                                                                                                                                                     | today-home OQ4           |
| Today first run                                            | "Connect your email" card (primary) + "Find jobs" text button                                                                                                                                                      | today-home vs states     |
| iOS connection banner scope                                | Every tab (one banner component under the nav bar)                                                                                                                                                                 | states OQ6               |
| Stale-cache stamp                                          | When `fromCache` or older than 15 min                                                                                                                                                                              | states OQ3               |
| Offline queue older than a day                             | Sync silently; the sidebar / nav-bar sync line shows the count                                                                                                                                                     | states OQ4               |
| Delete account confirmation                                | A fresh email-link sign-in (`auth_time` < 5 min, checked server-side); no codes exist (ADR 0008)                                                                                                                   | settings-account OQ4     |
| Beta → Stable                                              | Wait for the next stable; no downgrade                                                                                                                                                                             | settings-account OQ5     |
| Quiet-hours exceptions                                     | None; the catch-up summary covers it                                                                                                                                                                               | settings-account OQ6     |
| AI key ownership                                           | Per-user write-only key via callable, owner's key as fallback while personal                                                                                                                                       | settings-account OQ1     |
| Company watchlist                                          | A Jobs-area screen ("Companies you follow") linked from Settings › Job sources                                                                                                                                     | settings-account OQ3     |
| Revision granularity                                       | Coalesce per editing burst (iOS sheet Save; desktop 60 s idle or section blur); AI accept, import, restore and template/theme each get their own revision                                                          | cv-editor OQ2            |
| Import confidence flags                                    | Below 0.8, stored as `meta.importReview.flags[fieldPath]`, cleared on edit or ✓                                                                                                                                    | cv-editor OQ3            |
| Keyword extraction                                         | Claude extracts once and the result is cached on `jobs/{jobId}`. Matching against the CV is deterministic, so coverage updates live with no new AI calls                                                           | cv-editor OQ4            |
| iOS preview / PDF offline                                  | Preview renders offline in a WebView with bundled fonts; PDF export needs a connection (server Chromium) and says so                                                                                               | cv-editor OQ5            |
| Template thumbnails before a CV exists                     | Structural skeleton thumbnails with a caption, never invented people                                                                                                                                               | cv-editor OQ7            |
| Translate scope                                            | "Translate all" once at variant creation, then per section; translated fields marked for review                                                                                                                    | cv-editor OQ9            |
| German tab/sidebar label for CVs                           | "Lebensläufe" (desktop-chrome); "Lebenslauf" in body copy                                                                                                                                                          | onboarding-signin OQ7    |
| TR names                                                   | Jobs "İlanlar", Tracker "Takip", CVs "CV'ler", Mail "Posta" (changed to "E-posta" by Q9), Insights "İçgörüler"                                                                                                     | desktop-chrome, insights |
| Website localized routes                                   | `/` English, `/tr/…`, `/de/…`                                                                                                                                                                                      | website OQ6              |
| Website checksums                                          | Publish `SHA256SUMS.txt` with each release; the site shows SHA-256                                                                                                                                                 | website OQ2              |
| Website status line                                        | Not in v1 (no public health endpoint)                                                                                                                                                                              | website OQ5              |

## User decisions (taste or legal)

These needed the user. The user decided all eight on 2026-10-22 (kickoff); nothing here is waiting on the user any more. Options and evidence are kept for context.

### U1 · Turkish siz, German du

- **Evidence:**
  - **German:** every doc uses **du**: today-home, mail-review, apply, cv-editor, settings-account, states, onboarding-signin, insights, job-detail, desktop-chrome and the ADR 0003 sign-in email ("Dein Anmeldecode").
  - **Turkish, sen:** today-home, mail-review, apply, cv-editor, settings-account, states, onboarding-signin, insights.
  - **Turkish, siz:** job-detail and the job-feed-search drafts ("deneyin"), the shipped desktop shell strings ("gezinin", "deneyin"), and the ADR 0003 sign-in email ("paylaşmayın", "Sizden"), which already ships.
- **Options:** TR sen + DE du · TR siz + DE du · TR siz + DE Sie.
- **Decision (user):** **Turkish uses siz, German uses du.**
- **Consequence:** the sen drafts in 8 research docs are rewritten to siz in the copy pass, together with the TR native review.

### U2 · "Rejected" is shown as "Not selected"

- **Options:** "Rejected" / "Not selected" / "Unsuccessful" / "Closed by employer".
- **Decision (user):** **Not selected** (TR "Olumsuz sonuç", DE "Absage"), in the neutral grey Closed tone, never red (`color.status.rejected` = `color.phase.closed`; a test enforces it). It stays distinct from **Declined** (TR "Ben reddettim", DE "Abgelehnt (von mir)"). The enum stays `rejected`. Charts and notifications use the D18 wording.

### U3 · Legal pages in English only

- **Options:** English only · translated plain summaries only · full translations with English as the governing text.
- **Decision (user):** **English only.** The Privacy Policy and Terms (and their plain summaries) exist in English; the `/tr/…` and `/de/…` website routes and the in-app links point to the English pages.

### U4 · Support through GitHub issues only

- **Options:** a dedicated mailbox · the user's personal address · GitHub issues only.
- **Decision (user):** **GitHub issues only**, on the public `Savas07/bruteforcehr-releases` repo. No support email address is published (website or app). The issue template warns not to paste personal data, because issues are public. The website's Support page links to a new issue instead of showing an address.

### U5 · Brand accent: teal-green

- **Earlier proposal:** indigo-blue (`#2F54C8`), not taken.
- **Decision (user):** a **teal / green accent family**. Re-derived in `@bfhr/ui-tokens` at OKLCH hue ≈ 188: light `accent.solid` `#216863`, `accent.text` `#1F635D`; dark `accent.solid` `#2B827B`, `accent.text` `#43BEB4`. The In progress status ramp follows the accent hue; Accepted and success stay a separate gentle green, closed outcomes stay grey. Every pair is contrast-tested, with increased-contrast variants for iOS (system.md "Color").

### U6 · CV photo and date of birth: opt-in per variant

- **Options:** no photo field at all · per-variant opt-in, off by default · on for DE variants by default.
- **Decision (user):** for German- and Turkish-market CVs, **photo and date of birth are each an opt-in per CV variant, off by default.** The toggle carries a neutral note that German and Turkish employers may expect them while UK/US employers usually don't (under the German AGG a photo can invite bias). `users/{uid}/cv-photos/` exists for variants that turn the photo on.

### U7 · TestFlight: "Invite only"

- **Options:** "Invite only" copy (internal testing has no public link) · enable external testing (needs Beta App Review) and publish a public link.
- **Decision (user):** the website's iPhone row shows an **"Invite only" TestFlight note** (internal testing, no public link).

### U8 · No greeting on Today

- **Decision (user):** **no greeting** on Today (today-home OQ6). The screen opens with its content.

## M0 checkpoint taste answers (Q1–Q10)

The owner approved the [M0 design checkpoint](checkpoint-m0.md) on 2026-10-23 and answered its ten taste questions.

### Q1 · Today: tint on the "Next up" card

- **Decision (user):** **kept as is.** The selected Next up card keeps the `surface.selected` tint; unselected it has a border.

### Q2 · Today: "Updated automatically · you can undo these"

- **Decision (user):** **kept as is.** The heading keeps the promise of Undo.

### Q3 · Match bar colour for weak bands

- **Decision (user):** the shared `MatchBandBar` (desktop and iOS) fills the current segment with the neutral **`chart.neutral`** tone for **Partial** and **Stretch**, and with the accent for **Good** and **Strong**. The band label still carries the meaning.

### Q4 · Job list: short salary provenance

- **Decision (user):** job list rows show the short form, "· employer" (or "· estimate"); the full wording ("· from employer") is the row's tooltip and accessible text. Job detail is unchanged. iOS has no job list rows in M0, so the change is desktop only.

### Q5 · Job detail: "AI" shown twice

- **Decision (user):** keep the AI badge; the label becomes **"Summary · can be wrong"** (TR "Özet · hatalı olabilir", DE "Zusammenfassung · kann Fehler enthalten") on desktop and iOS.

### Q6 · Tracker on iPhone: no drag (D32)

- **Decision (user):** **kept as is.** No drag on iPhone in M0; Move to…, the status pill, VoiceOver actions and swipe actions move applications. Revisit in M3 with real usage.

### Q7 · Tracker on iPhone: status order

- **Decision (user):** **kept as is.** The pipeline keeps stage order.

### Q8 · Tracker on desktop: column collapse buttons

- **Decision (user):** keep the « buttons, **visible only on column hover and keyboard focus**. They stay in the Tab order and are hidden with opacity, so the header doesn't shift.

### Q9 · Turkish name for Mail

- **Decision (user):** **"E-posta" everywhere** (desktop and iOS TR catalogs, IA.md). Still subject to the native TR review.

### Q10 · Tracker on desktop: two polish items

- **Decision (user):** **scheduled for M3:** let the German record-panel header wrap instead of truncating, and dim the columns behind the error card.
