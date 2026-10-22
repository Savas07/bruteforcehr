# User flows

Status: M0 synthesis, 2026-10-22. Sources: the research docs named per flow, [decisions.md](decisions.md) and [IA.md](IA.md). Each flow names its trust points (source + reason + Undo) and where it differs per platform. Whole-flow critiques (BRIEF §5.5.7) use these diagrams as their script.

## 1. Onboarding: email code → CV import → preferences → connect mail → backfill review

Sources: onboarding-signin.md, connect-email.md, ADR 0003. Time budget: sign in ≤ 45 s, CV ≤ 30 s, preferences ≤ 60 s, mail ≤ 45 s (≈ 3 min worst case).

```mermaid
flowchart TD
  A([Open app, signed out]) --> E[Email screen<br/>Send code enabled after a basic syntax check]
  E -->|authRequestCode| E1{Result}
  E1 -->|rate_limited| E2["Inline: You can ask for a new code in {m} min."] --> E
  E1 -->|delivery_failed| E3["Inline: We couldn't send the code. Check your connection and try again."] --> E
  E1 -->|ok, expiresAt| C[Code screen<br/>email chip + Change · 6 cells · paste and autofill]
  C -->|6th digit, auto-submit| V{authVerifyCode}
  V -->|invalid_code| C1["Cells clear, keep focus, error haptic<br/>That code doesn't match…"] --> C
  V -->|too_many_attempts| C2[Cells disabled until a new code is sent] --> C
  V -->|no_active_code| C3["This code has expired. · Send a new code"] --> C
  V -->|token| S[signInWithCustomToken]
  S --> N{Profile complete?}
  N -->|yes| TODAY([Today])
  N -->|no| CV["Step 1 of 3 · CV<br/>Upload PDF/DOCX/JSON · LinkedIn ZIP · Start from scratch"]
  CV -->|file picked| U["Uploading… → Reading your CV…<br/>Continue enabled once uploaded; parsing continues"]
  CV -->|Start from scratch / Skip for now| P
  U --> P["Step 2 of 3 · Preferences<br/>pre-filled from the CV with 'From CV' tags; nothing required"]
  U -.->|parse failed| UE[Row error + Choose another file / Start from scratch] -.-> P
  P --> M["Step 3 of 3 · Connect your email"]
  P -->|Skip for now| TODAY2([Today + toast: You're set up · Open settings])
  M -->|Gmail / Outlook| B[Pre-permission sheet<br/>4 promises · lookback 90 days · expectation card]
  M -->|iCloud / Yahoo / Other| IM[App-password form] -->|Test connection OK| SC
  IM -->|auth / host / TLS error| IM
  M -->|Skip for now| TODAY2
  B -->|Continue to Google/Microsoft| OA[System browser / ASWebAuthenticationSession<br/>consent: read scope only]
  OA -->|bruteforcehr://connected?status=ok| SC["Scanning: Checking the last 90 days → Finding job-related emails → Matching companies and roles → Preparing your review"]
  OA -->|scope unchecked / admin consent / network| B
  SC -->|Continue while it runs| TODAY3([Today card: scanning… → We found 14 applications and 3 interview invites · Review])
  SC -->|done while open, 300 ms cross-fade| BR
  TODAY3 --> BR["Backfill review<br/>grouped by status · high confidence pre-checked · Needs a look unchecked"]
  BR -->|Import n| TR(["Tracker + toast: 14 applications added · Undo (10 s)"])
  BR -->|Not now| MQ([Mail › To review bundle row, counted in the Mail badge])
```

Notes:

- One screen serves sign-in and sign-up. The server creates the user on first verify.
- Detailed CV review isn't part of onboarding. Today shows "Review your imported CV · {n} fields to check" (`bruteforcehr://cvs/{cvId}`).
- **Trust:** each imported card carries a "From email" source tag linking to its evidence. Import Undo removes exactly the applications this import created. Already-tracked rows update instead of duplicating ("Already in Tracker · will update to Interviewing").
- **Desktop:** the same steps in a full-window wizard (stepper CV · Preferences · Mail, signed-in email + Sign out). The browser handoff waits for either the deep link or the `mailAccounts` snapshot. After 10 min it says "Still waiting? If you closed the browser tab, open it again." It lands on Tracker if items were imported, otherwise on Today.
- Push permission is asked after the first successful import, never at launch (D25).

## 2. Apply: email and external

Sources: apply.md, job-detail.md, states.md; decisions D02, D11, D21–D23.

```mermaid
flowchart TD
  J([Job detail · Apply / Jobs row menu / ⇧⌘A]) --> SH["Apply sheet (iOS page sheet) / Apply panel (desktop, docked right)<br/>application moves to Preparing"]
  L([Tracker · Log an application]) --> SH
  SH --> R1["CV row: best-matching variant (Match 82) or last used"]
  SH --> R2["Cover letter row: None or Draft one"]
  SH --> R3["Send via: route order direct ATS → company site → apply email → aggregator"]
  R1 -->|Change| CP[CV picker] --> SH
  R1 -->|Tailor for this job| TL[[Flow 4 · CV tailoring]] --> SH
  R2 -->|Draft one| CL["Cover letter editor<br/>Drafted from your CV and this job · Use template without AI · Undo"] --> SH
  R3 -->|Email| FA{From account can send?}
  FA -->|no account| NA["Connect an email account to send from"] --> CONN[[Connect email]] --> FA
  FA -->|connected, read-only| SC["Allow sending from {address}<br/>incremental consent: gmail.send / Mail.Send"] --> FA
  FA -->|yes| RE["Review email (iOS: compose + preview in one screen;<br/>desktop: Compose → Review 'Sending details')"]
  RE --> BL{Blocker?}
  BL -->|offline · field unresolved · no account · cap reached| BLK["SendBlockerLine: one reason at a time, draft saved"] --> RE
  BL -->|none| SEND["Send to jobs@acme.com"]
  SEND --> T10["Sheet closes · toast: Sending in 10 s · Undo · ✕ sends now<br/>countdown from the server's sendAt"]
  T10 -->|Undo| UN["Not sent. Your draft is saved. → Review email reopens intact"] --> RE
  T10 -->|window ends| SENT["Sent to Acme. Marked as Applied. · View in Tracker<br/>pins CV revision + PDF + cover letter · stores message and thread ids"]
  R3 -->|Company site| KIT["Your application kit<br/>files · answers with Copy · cover letter text"]
  KIT -->|Open company site| WEB[SFSafariViewController / default browser]
  WEB -->|Done / window refocus| ASK{"Did you submit your application to Acme?"}
  ASK -->|Yes, I applied| AP["Marked as Applied · Undo<br/>pins documents"]
  ASK -->|Not yet| PR[Stays Preparing · card collapses to 'Open company site again'] --> KIT
  ASK -->|I'm not applying| SV[Back to Saved]
  MAIL[(ATS confirmation email, M5)] -.->|strong link + confidence| AUTO["Confirmed by an email from no-reply@greenhouse.io, 14:02 · Undo"]
  AUTO -.-> AP
```

Email send timing (the only hard Undo window, D11):

```mermaid
sequenceDiagram
  participant U as User
  participant C as Client
  participant F as Cloud Function (send)
  participant Q as Cloud Tasks
  participant P as Gmail / Graph / SMTP
  U->>C: Send to jobs@acme.com
  C->>F: sendRequest(applicationId, draft)
  F->>F: check cap (per local day), canSend, pins
  F->>Q: schedule dispatch at serverAck + 10 s
  F-->>C: emailSend {state: scheduled, sendAt}
  C-->>U: toast "Sending in 10 s · Undo" (counts down to sendAt)
  alt Undo before sendAt
    U->>C: Undo
    C->>F: cancelSend(applicationId)
    F->>Q: delete task
    F-->>C: emailSend {state: cancelled}
    C-->>U: "Not sent. Your draft is saved."
  else window ends
    Q->>F: dispatch
    F->>P: send with attachments (Graph upload session > 3 MB)
    F->>F: status → applied (event: mail_sent + status_changed), pin documents
    F-->>C: emailSend {state: sent, providerMessageId, threadId}
    C-->>U: "Sent to Acme. Marked as Applied." · View
  end
```

Notes:

- Send needs a connection. Nothing queues offline, so a send can't fire after the user stopped watching.
- There's no bulk apply. The desktop panel's ‹ › stepper moves between saved jobs, and each one is still sent separately.
- iOS: swiping the sheet down asks Keep draft / Discard. Desktop: Esc closes the panel and keeps the draft.

## 3. Mail intelligence: automatic change with Undo vs Review queue

Sources: BRIEF §4.7, mail-review.md, today-home.md, tracker.md, ADR 0002 (status machine, review states); decisions D01, D11, D17.

```mermaid
flowchart TD
  POLL([Poll every 5 min · pull-to-refresh asks for an immediate poll]) --> PRE{"Pre-filter: thread of a sent application · known ATS domain · tracked company · keywords"}
  PRE -->|not a candidate| DROP[Store only a message id hash · never the body]
  PRE -->|candidate| CLS["Classify (rules first, then LLM if 'Allow sending email text to AI' is on)"]
  CLS -->|job_alert| JA["Extract postings → Jobs feed, source 'Alert email'<br/>Mail: 'Job alerts · 12 new postings sent to Jobs'"]
  CLS -->|not_job| DROP
  CLS -->|other categories| LNK["Link to an application: thread > ATS + company + role > company domain > LLM pick / create new"]
  LNK --> GATE{"confidence ≥ autoApplyConfidence (0.9)<br/>AND link is thread or ats_company_role<br/>AND canTransition(actor: rule/ai) allows it"}
  GATE -->|yes| AUTO["Apply transition: status_changed event with confidence + evidence<br/>mail reviewState = auto_applied"]
  AUTO --> NOTIF["Toast if open: Acme · moved to Interviewing from an email · Undo · View<br/>Push (if enabled): interview, offer, assessment, decision"]
  AUTO --> ROWS["Durable rows: Today 'Moved to Interviewing — from an email by Acme · Undo'<br/>timeline 'Automatic · Mail' row · Mail › Updates (14 days)"]
  ROWS -->|Undo, while it's the latest status move| REV["revert(): compensating user event (revertsEventId)<br/>mail reviewState = corrected → labeled example"]
  ROWS -->|a later move happened| NO["Can't undo — the status changed since."]
  GATE -->|no| Q["Review queue: reviewState = pending<br/>Mail badge +1 · Today 'To review · n'"]
  Q --> RS["ReviewSheet / review card: proposal sentence · reason line · evidence · Category · Application · Status"]
  RS -->|Confirm| CF["Server trigger validates with @bfhr/core → event · reviewState confirmed<br/>toast: Confirmed: Acme moved to Interviewing · Undo"]
  RS -->|Change…| CH["Category / Application (search + Create application) / Status pickers"] --> CF2[reviewState corrected + event]
  RS -->|Not job mail| FG["We'll forget this email. → document deleted"]
  RS -->|Review later| SN["reviewLaterUntil · leaves the badge until due"] -.-> Q
  CF --> NEXT[Focus moves to the next item]
  CF2 --> NEXT
```

Notes:

- Automation moves forward or to Rejected only. It never sets Accepted, Declined, Withdrawn or No response, and never moves a closed application (`AUTOMATION_FORBIDDEN_STATUSES`).
- Clients never write `applications` from Mail. They write the four review fields, and a server trigger turns them into events.
- Every automatic change shows its **source** (account, sender, received time), its **reason** ("Same email thread as your application of 3 Oct", "Sent from greenhouse.io and mentions this role", "Sorted by rules (AI is off)") and **Undo**.
- Decisions (rejections) use calm copy ("Acme decided not to move forward. We updated the application."), never red, and their notifications can be muted.
- Offline: the queue stays readable from the cache. Confirm and Change are queued and show "Will sync when you're back online".

## 4. CV tailoring

Sources: apply.md (Tailor review), cv-editor.md (AI assist, revisions, variants); decisions D13, D14.

```mermaid
flowchart TD
  S([Apply checklist · Tailor for this job<br/>or CV editor · Check against a job → Tailor]) --> I["Choose intensity: Light (wording, order) · Thorough (also summary + skills emphasis)"]
  I --> LD["Reading the job description… (cancellable, no fake %)<br/>after 10 s: This can take up to a minute. You can keep working."]
  LD -->|offline| OFF["Disabled in place: Needs a connection. Tailoring runs on our server."]
  LD --> RV["'8 suggested edits' · section filter · Changes / Preview toggle<br/>Suggested by Claude. Check names, numbers and dates before you use it."]
  RV --> CARD{"Suggestion card: section path · original (struck) · suggestion · why"}
  CARD -->|Use suggestion| OK[Accepted]
  CARD -->|Keep original| KO[Kept]
  CARD -->|Edit| ED[Edited text] --> OK
  CARD -->|contains a placeholder token like 10%| PH["Use is blocked: 'Fill in [X%] with your real number, or keep the original.'"] --> CARD
  OK --> MORE{All cards decided?}
  KO --> MORE
  RV -->|Keep original for the rest n| MORE
  MORE -->|no| CARD
  MORE -->|yes| SAVE["Save as new version → new variant 'Acme · Senior Frontend' (renamable)<br/>immutable revision, source ai_tailor, tailoredForJobId"]
  SAVE --> PDF[Render PDF · select it in the Apply checklist]
  PDF --> T["Toast: Saved as a new version · Undo"]
  T -->|Undo, variant unused by any application| AR[Variant archived · previous CV reselected]
```

Notes:

- There's no "Accept all". The AI never adds a skill or number the user doesn't have, and unknowns become visible `[X%]` tokens (BRIEF §2.4).
- On desktop, Tailor review takes over the content area with a 360 px suggestion rail. Keys: `A` use, `R` keep original, `E` edit, `J`/`K` next / previous card, Esc returns to the panel with the new version selected.
- In the CV editor (outside Apply), the same suggestion model runs inline: tracked changes with ✓ / ✕ and a gutter bar on desktop, and the AI assist sheet on iOS. Every accept writes a revision.

## 5. Tracker move with Undo

Sources: tracker.md, states.md, ADR 0002 (`canTransition`, `canRevert`); decisions D11, D12, D16.

```mermaid
flowchart TD
  M(["Move: drag card (desktop) / long-press drag (iOS) · Move to… (M, context menu, status pill) · leading swipe 'Advance to {next}' · ⇧⌘→ / ⇧⌘←"]) --> G{"canTransition(from, to, actor: user)"}
  G -->|same_status| X[No-op]
  G -->|outcome_requires_offer| D1["Target disabled with reason: Accepted and Declined come after an offer.<br/>drag springs back"]
  G -->|allowed| W["Optimistic write: application.status + status_changed event<br/>counts update · card lands · live-region announcement"]
  W --> T["Toast: Acme · moved to Screening · Undo (⌘Z)<br/>6 s, or 10 s with a screen reader / long text / bulk"]
  W --> OFFQ{Online?}
  OFFQ -->|offline| SY["Queued (Firestore outbox) · sync glyph on the card"]
  SY -->|reconnect, rules or state machine reject| RJ["Inline alert: which change didn't save · Review"]
  SY -->|reconnect ok| DONE[Synced]
  OFFQ -->|online| DONE
  T -->|Undo or ⌘Z| CR{"canRevert(event)"}
  CR -->|ok| RV["Compensating user event (revertsEventId) · card returns<br/>toast: Restored · Open"]
  CR -->|superseded| SUP["Can't undo — the status changed since."]
  T -->|toast hides| HIST["Undo stays available: ⌘Z, timeline row, while it's the latest move"]
  HIST --> CR
  M -->|drop on Closed rail / trailing swipe 'Close…'| OC["Outcome: Not selected · Withdrawn · No response (+ Accepted / Declined from Offer)<br/>no confirmation dialog: Undo replaces it"]
  OC --> W
```

Bulk (desktop Table): select rows → Set status writes one event per application, and one Undo covers the batch ("3 applications moved to Applied · Undo").

Suggestions never move anything by themselves:

- At 7 days after Applied: "No reply in 7 days. Send a short follow-up?" with **Draft follow-up** / **Not now**.
- At 21 days: "No reply in 21 days. Mark as no response?" with **Mark as no response** / **Keep waiting**.
- Both thresholds come from `settings.followUpAfterDays` and `settings.ghostedAfterDays`.
