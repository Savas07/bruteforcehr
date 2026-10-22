# Mail review queue: design research

Research date: 2026-10-22. Source: Mobbin MCP `search_screens`. Every call used `task_intent` "Design a cross-platform job search, CV builder and application tracker app" and `output_destination: "code"`. The user's saved Mobbin collections contain only website sections (see kickoff), so none of them apply here. I judged every reference from its screenshot. No images are committed; open a `mobbin_url` to see the screen.

## Scope

This covers the brief §5.3 row **Mail review queue**. Mail review is one of the 5 core screens (§5.6).

| Platform | Matrix entry | Queries run (mode) | Examined | Kept |
|---|---|---|---|---|
| iOS | email inbox | "email inbox screen" (standard) | 7 | 3 |
| iOS | review/triage queue | "review queue screen to confirm or correct suggested categorizations one at a time" (deep); "triage screen for sorting incoming items with swipe actions" (standard) | 14 | 8 |
| iOS | notification center | "notification center screen" (standard); "toast message with undo button after an action" (standard) | 13 | 7 |
| Desktop (`web`) | three-pane email client | "email client with folder sidebar, message list and reading pane" (standard); "Linear triage inbox screen" (standard) | 12 | 7 |
| Desktop (`web`) | triage queue | "triage queue screen for accepting or declining incoming items" (standard) | 7 | 4 |

Product requirements:

- **§4.7 pipeline.** Classes are `application_received`, `rejection`, `interview_invite`, `assessment`, `offer`, `recruiter_outreach`, `info_request`, `job_alert`, `other_job` and `not_job`. If confidence is ≥ 0.9 **and** the link is strong, the transition is applied automatically and the user gets a notification with Undo. Everything else goes to the **Review queue** (Mail tab), where one tap confirms or corrects it. Corrections are stored as labeled examples.
- **§2.6.** Every automatic change says what it did, why, and has an Undo: "Moved to Rejected: email from jobs@acme.com, 12 Oct · Undo".
- **§4.6 state machine.** Automation may only move an application forward or to Rejected. The user may move it anywhere.
- **§8 data rules.** Non-job mail is never stored. Job-mail bodies are kept while the application is active plus 180 days.
- **Firestore (kickoff).** Clients may update only the review fields of `users/{uid}/mailMessages/{id}`. `mailAccounts` are read-only status on the client.

## References

### iOS: email inbox

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Spark Mail | Smart inbox with "People / Notifications / Newsletters" sections | https://mobbin.com/screens/c62fc2b4-5b24-4027-b768-a7c913b14127 | Sections grouped by kind, each with a header check-mark that clears the whole section. A title menu ("Smart ▾") switches the scope. A one-time explainer card ("Personal messages come first… Got it"). | The title menu is where we switch between all accounts and a single account. The one-time card explains on the first visit what the Mail tab shows (only job mail). |
| Apple Mail | Inbox with category chips and a dismissible category explainer | https://mobbin.com/screens/4a7b840c-5b83-4080-a5dd-829bbcfd05aa | A horizontal row of category chips under the large title. The account line plus "Updated Just Now" under the title. Messages split into "New Messages" / "Older Messages". | This is the native iOS 26 pattern for filtering by category. "Updated just now" is a calm sync indicator, and we need one because the server polls every 5 minutes. |
| Gmail | Primary inbox with smart chips | https://mobbin.com/screens/fd433465-e5e2-417e-9d74-f1a83ce47d31 | Rows are sender / subject / snippet with extracted data shown as chips inside the row (an attachment chip, "Expected by Tue, Jan 14"). | This is how an extracted interview time or deadline should look: a chip in the row, so the user doesn't have to open the email. |

### iOS: review/triage queue

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Alta | Batch of AI-tagged items, each with Retry / Add and per-card undo | https://mobbin.com/screens/9e295581-6995-4c42-b494-895d117ec64f | Each machine guess is its own card with editable fields (brand, category) and its own confirm button. A missing field is shown in red text ("Select category") and that card's confirm stays disabled until it's filled. | This is the closest structural match: a queue of AI guesses, confirmed one at a time, with missing data visible instead of guessed. We don't take the "Add All" header button (see Decision). |
| Instagram | "See more of what you love" card with Not interested / Interested | https://mobbin.com/screens/5d3ab198-5610-4a20-9097-5ea844086b37 | Two equal-width buttons sit directly under the item being judged, with a one-line explanation of why the user's answer matters ("Your preferences help shape what you see"). | Full-width paired buttons give 44 pt targets and room for TR/DE. The explanation line sets up our "your corrections improve sorting" message. |
| Lloyds Mobile Banking | "Change category" sheet | https://mobbin.com/screens/4bdae728-774f-4441-98de-1d2e1e351945 | A sheet with the item summary pinned at the top (merchant, current category, amount), a radio list of categories and a single Continue button. | This is the "Change…" sheet for the category field. Keeping the email summary pinned means the user doesn't lose context while correcting. |
| Revolut | "Update category: All from this merchant / Only this transaction" | https://mobbin.com/screens/7b88d7cc-e58c-4222-9ed8-163797df794e | After a correction, a scope question asks whether it applies to this item only or to all items from the same source. | This is the proposed UI if we let corrections become sender rules (Open question 2). It isn't in v1. |
| Commons | "Always save this recategorization? Remember / Not now" | https://mobbin.com/screens/bd567624-399d-47a8-abfb-5ca3f261d78a | It asks the user to turn a correction into a rule, with a polite "Not now" exit. | It's a second data point for Open question 2. The "Not now" wording keeps the question from feeling like a demand. |
| Spark Mail | Smart 2.0 with bundled "Notifications 99+" / "Newsletters 99+" rows | https://mobbin.com/screens/549157c4-7a1f-4905-99e6-c3022deb5cb4 | Low-value categories collapse into a single bundle row that shows the sender avatars inline. | Job alerts and `other_job` mail collapse into one "Job alerts" bundle row, so they don't push review items out of view. |
| LinkedIn | Messaging select mode with "Jobs" filter chip and bottom action bar | https://mobbin.com/screens/353b7200-164f-4ba4-b470-456a8e457579 | "Select" mode with checkboxes and a bottom toolbar (Mark unread / Delete / Archive), plus filter chips that include a "Jobs" chip. | This is the bulk path ("Not job mail" for several newsletters at once) without a dangerous "confirm all" button. |
| Manus | Row with leading swipe revealing Favorite / Delete | https://mobbin.com/screens/824cf0e4-1752-4208-81d5-16c3c60c0b27 | Two colored swipe actions on one side, each with an icon and a label. | This is the swipe grammar: leading swipe = Confirm, trailing swipe = Change / Not job mail. Labels sit under the icons so swipe actions stay understandable. |

### iOS: notification center

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Nike Run Club | Inbox with an inline ✕ / ✓ on one actionable row | https://mobbin.com/screens/f62ce5c8-172b-4e9b-8edf-b9d530e5cb77 | Only rows that need a decision get compact ✕ / ✓ buttons. Informational rows are passive. | This separates "needs you" (review) from "FYI" (applied automatically) in the same list. The Today doc uses the same reference, so both screens stay consistent. |
| Linear Mobile | Inbox with event-type badge on the avatar | https://mobbin.com/screens/97e4122c-fb36-414e-8f11-da31e1a8aebc | Each row's avatar has a small corner badge for the event type (comment, mention, reminder). The title line names the object and the second line describes the event. | The event badge carries the classification (interview / offer / decision / assessment) without another colored pill. |
| GitHub | Inbox with filter chips and a "Configure" notifications card | https://mobbin.com/screens/8963ec2f-94b1-4436-ba10-51639fdbd097 | Filter chips (Inbox ▾ / Focused / Unread / Repository ▾) under a large "Inbox" title, plus a dismissible card linking to notification settings. | This is the chip grammar for To review / Updates / All, and the slot for the "Reconnect account" banner. |
| Notion | Inbox overflow menu "Mark all as read / Archive all" | https://mobbin.com/screens/5f76aca8-07db-4f96-bbde-9240c43e2dc5 | Bulk housekeeping lives in an overflow menu, not as visible buttons. | We acknowledge every automatic update this way ("Mark all as seen"). It never applies to items waiting for review. |
| Google Photos | Bottom snackbar "Unstacked all 2 photos · Undo" | https://mobbin.com/screens/271108af-b336-489e-bac3-7b4639152cb4 | A dark snackbar above the bottom toolbar, with the action described in past tense and a right-aligned "Undo". | This is the `UndoToast` pattern after every confirm or correction. It sits above the tab bar, so it never covers the next queue item. |
| X | Top pill "Notifications muted for this conversation" with a full-width Undo | https://mobbin.com/screens/ed4a0353-637c-44de-89b8-4b7f681ac94d | The Undo button is as wide as the pill, so it's a large target. | Used when VoiceOver is on or at accessibility text sizes, where a small trailing "Undo" link is hard to hit. |
| Google Drive | Snackbar over a sheet "File will be made available offline · Undo" | https://mobbin.com/screens/364e5cb6-eb04-43f4-b4a5-7fe8e4f64862 | The snackbar stays visible above a presented sheet. | Corrections happen inside a sheet. The Undo must still show after the sheet closes. |

### Desktop (`web`): three-pane email client

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Notion Mail | Sidebar views + dense list + reading pane, "Thread moved to Trash · Undo" toast | https://mobbin.com/screens/9d8e58ec-3d37-432d-9af9-76ad8a83fe47 | The left sidebar has user-defined **Views** above the "Mail" folders. A one-line, dense message list. A reading pane with "Add label / Add category" right under the subject. A bottom-left Undo toast. | Views map to our category folders. Classification controls placed right under the subject are where our review card goes. The Undo toast placement leaves the reading pane clear. |
| Lemni | Inbox + message + right **Details** panel (Status, Priority, Contact, Thread summary) | https://mobbin.com/screens/5b67dcf3-405b-4f0d-a426-61350e1bd786 | A structured details panel beside the email: status, dates, contact, company, plus a one-line AI **Summary** of the thread. | The evidence for a classification (company, role, contact, extracted dates) sits next to the email it came from. The Today doc uses this panel too, so we can share one `ReviewDetailPane`. |
| Superhuman Mail | Split inbox tabs + keyboard hint bar | https://mobbin.com/screens/67b64e53-c74b-4c83-a570-fc7ae5250809 | Split-inbox tabs with counts ("Important 639", "Other") above a very dense list, and a dismissible bottom hint bar ("Hit E to Mark Done…"). | The hint bar teaches the review shortcuts (C / F / N) in context. That supports our keyboard-first desktop. |
| Front | Open / Later / Done folders with "Archive in …" header button | https://mobbin.com/screens/42adf3bd-2dee-4f3b-82a8-bdec59a9556b | Every conversation has a clear life cycle (Open → Later → Done), and the primary resolve action sits in the top-right of the reading pane. | A review item is either *to review*, *reviewing later* or *done*. One primary button resolves it. |
| Linear | Inbox list + issue detail with Properties panel and Activity log | https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338 | The right Properties panel (status, priority, assignee, labels, project). Below the body, an Activity list in plain sentences ("moved from Todo to In Progress · 10d ago"). | The linked application's recent `applicationEvent`s appear in the reading pane as plain sentences. That shows what changed before, so the proposed change makes sense. |
| Linear | Inbox with empty detail pane "7 unread notifications" | https://mobbin.com/screens/18c6955a-c42f-4cc1-9aa2-0276456720fb | When nothing is selected, the reading pane shows a quiet line-art icon and a count instead of being blank. | This is our no-selection state: "4 emails to review. Select one to see what we found." |
| Linear | Snooze menu ("An hour from now / Tomorrow / Next week / Custom…") over the inbox | https://mobbin.com/screens/17c8ce50-57d6-4a36-aeba-700bcb563fc6 | A natural-language input on top ("Try: 4 pm, 2 days…") above preset rows that show the resolved date and time. | This is "Review later" for review items. It uses the same `SnoozeMenu` as Today, with a free-text field added on desktop. |

### Desktop (`web`): triage queue

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| hilos | "Hilo proposes 1": a proposal row with a reason line and Approve / Dismiss | https://mobbin.com/screens/e573bca6-ce45-486a-bc9e-9fe86dff5ea9 | The machine proposal is phrased as an action ("Dispatch T-1 to @dot") with its **reason** underneath ("most recently active in the workspace") and two text buttons. The proposals block sits above the regular list. | This is the clearest example of the trust principle: proposal + reason + decision in one row. It's the template for our review card header. |
| Lemni | Agent-drafted email with inline Decline / Approve and "Waiting for approval…" | https://mobbin.com/screens/31c9c03a-dff3-4ab4-9710-b2990d13adbe | The approval controls sit inside the content block they act on, with a pending status chip underneath. | The Confirm / Change buttons sit on the review card in the reading pane, not in a distant toolbar. |
| Acctual | Bills with stage tabs (Draft 1 / Approve 2 / Ready 3 / Paid 2) and per-row ✓ / ✕ | https://mobbin.com/screens/4b992650-0ce5-4fc7-9efb-8407b7ac70ac | Stage tabs with counts, and per-row approve / reject icons in a fixed Action column. An "Uncategorized" value is shown as plain text, not hidden. | This is the hover actions on list rows (confirm without opening). "Unlinked" applications show as plain text the same way. |
| Braintrust | Offer cards with a Pending chip and Decline / Accept | https://mobbin.com/screens/c1a094dc-669d-4811-971b-efced426b82a | A card with a status chip on the right and the primary action (Accept) visually stronger than the secondary one (Decline). | This sets the visual weight on desktop: Confirm is primary and Change is secondary. Both are text buttons, not icons. |

## Examined but rejected

| App | `mobbin_url` | Reason |
|---|---|---|
| Microsoft Outlook (iOS inbox) | https://mobbin.com/screens/5ae2e18d-8877-499b-9214-1486bf023efe | A heavy brand-colored header and a near-empty list. Nothing beyond the Apple Mail / Gmail rows. |
| Notion Mail (iOS inbox) | https://mobbin.com/screens/dfd4172f-6857-48f7-a6a4-c1f134385e47 | A generic all-mail list with "99+" counters and a shutdown banner. Raw mail volume is what we filter out. |
| Amie (iOS) | https://mobbin.com/screens/c700c991-aa45-45bb-a46a-bf011bf7ed45 | Calendar and email split in one screen. That mixes Tracker → Calendar with Mail. |
| Angi (iOS inbox) | https://mobbin.com/screens/0ae63ff3-89a1-4b3e-a871-84b03393504b | A plain two-row message list. It has no classification or triage pattern. |
| Pillow (iOS) | https://mobbin.com/screens/52e30e18-719d-4dec-b3c3-a36b356eccbd | A wheel picker for re-categorizing, on a dark gradient. Wheels hide the options and are slow for a list of 10 classes. |
| Twitch (iOS AutoMod queue) | https://mobbin.com/screens/d3acda17-6ed7-400c-9619-db6ef2092fe9 | Allow / Deny buttons are pinned and disabled on an empty queue. The empty state offers no next step. |
| Cleo (iOS) | https://mobbin.com/screens/2b301b36-7501-41a4-84ef-348ccd6a036a | Category correction happens inside a chat with emoji pills. Too playful for a stressful task, and slower than a sheet. |
| Depop (iOS inbox) | https://mobbin.com/screens/3307a28d-5000-4e5f-a0dc-08c5cc66338b | The only swipe action is a destructive red "Delete". We never delete the user's mail from the provider. |
| Quo (iOS voicemails) | https://mobbin.com/screens/7e60ef54-bf2f-4a54-ae6f-81111337e610 | Rename / Delete swipe actions on media files. Not a triage pattern. |
| Superlist (iOS "Group By" sheet) | https://mobbin.com/screens/3397245e-462d-4ce1-909a-b34900dead58 | Nine grouping options. That's too much choice for a queue that should have one sensible order. |
| Bond (iOS inbox) | https://mobbin.com/screens/5fa949fb-e446-46e5-949e-42aac68fd1b4 | Repeated identical rows ("New suggestion for…" ×6). This is the notification spam we avoid. |
| TikTok (iOS inbox) | https://mobbin.com/screens/67e35e3b-09af-4deb-8ca6-ec6edde8ec44 | A social inbox with a stories header and category drill-ins. Not task-oriented. |
| Swarm (iOS notifications, empty) | https://mobbin.com/screens/1bee7dc1-c4c5-4551-9174-c16ca6a824bc | "No notifications yet" with no explanation of what will appear or why. |
| Medium (iOS toast) | https://mobbin.com/screens/ed637f28-2d0d-40a6-bb79-b7fe7d8505e8 | The top toast covers the navigation bar and the first row, which is the next item the user wants. |
| Quo (iOS activity + toast) | https://mobbin.com/screens/28233f22-360a-456d-9973-ef2942fdf2fa | A wall of red error icons. The alarm styling conflicts with the calm principle. |
| Kitchen Stories (iOS toast) | https://mobbin.com/screens/2c766245-5fbd-47db-aaf7-df4a8d37afed | Wordy "successfully removed from the favourite ingredients list". The toast covers the content it refers to. |
| folk (web) | https://mobbin.com/screens/bda17e3b-43d0-4eda-8649-62b7dcd6e6fe | Outbound campaign tracking (opened / clicked). Inbound triage is a different job. |
| Cloaked (web) | https://mobbin.com/screens/ae447e7c-bdae-4b14-b52d-8c77e992c964 | A conventional three-pane layout plus a trial banner. Notion Mail covers the layout better. |
| Intercom (web) | https://mobbin.com/screens/b1a806f1-b212-45a8-b525-fea3fa01b961 | Four panes, many collapsible attribute groups and team inbox navigation. Built for support teams and too heavy for one person. |
| Linear (web, project update reminder) | https://mobbin.com/screens/8337813e-f0dd-4415-8a29-87c114b0442b | The detail pane is a project update composer. It's unrelated to classification review. |
| Linear (web, empty inbox) | https://mobbin.com/screens/5e4be052-1838-45d0-b850-fd7306cd4bff | "No notifications" with no hint of what would show up. The populated empty-pane variant (kept) is better. |
| Deel (web "Action required") | https://mobbin.com/screens/adf2f701-8ec4-4bad-9243-1673a86dba46 | 71 near-identical rows with icon-only red/green circles. Easy to mis-click, and rubber-stamping is encouraged. |
| Xero (web) | https://mobbin.com/screens/e2860d2e-4007-4f92-a1a5-d7427ad15d0b | Bulk "Submit for approval" behind a modal "OK / Cancel". A confirm dialog adds friction without explaining anything. |
| Melio (web approvals) | https://mobbin.com/screens/bf5a95bf-1d81-4017-ac17-0e35ad2c2885 | A single "Approve" text link with no reject path and no reason shown. |

## Decision — iOS

**Placement:** the `Mail` tab (5th tab, §4.1). It has a native large title "Mail" with a title menu (Spark "Smart ▾") that switches between **All accounts** and each connected address. Under the title, a quiet sync line reads "Checked 3 min ago" (Apple Mail "Updated Just Now"). The list is a native `List` with pull to refresh. Pull to refresh asks the server for an immediate poll and is rate-limited.

**Filter chips** (Apple Mail / GitHub), with one active at a time:

1. **To review (n)**: the queue. This is the default whenever n > 0.
2. **Updates**: changes applied automatically in the last 14 days, each with source + reason + Undo.
3. **All job mail**: every stored job email, newest first. The category filter menu (Interviews, Assessments, Offers, Decisions, Recruiters, Info requests, Job alerts, Other) is the last chip ("Category ▾"), so the row stays short enough for DE.

**Review row** (in the To review list, Nike/Linear style): sender name + an account dot if more than one account is connected, a relative time, the subject, and one *hedged* classification line with a type badge on the company monogram (Linear Mobile). For example, "Looks like an interview invite · Acme · Frontend Engineer". Extracted dates appear as chips (Gmail "Expected by…" style), e.g. "Thu 24 Oct, 14:00". The leading swipe is **Confirm**. The trailing swipe is **Change…** and **Not job mail** (Manus labeled actions). The long-press context menu has the same actions plus "Review later" and "Open in Gmail/Outlook".

**Review sheet** (tap a row; shared `ReviewSheet` with Today, form sheet with medium/large detents):

- **Header (hilos proposal pattern):** the proposal as one sentence: "Move **Acme · Frontend Engineer** from Applied to **Interviewing**". The reason sits under it in secondary text: "Same email thread as your application of 3 Oct" / "Sent from greenhouse.io and mentions this role" / "Sorted by rules: AI is off".
- **Evidence block:** from (name + address), the account it arrived in, the received time, the subject, and a 3-line excerpt with a "Show full email" disclosure. Extracted fields (date/time + time zone, meeting link, deadline, contact) appear as editable rows.
- **Three fields, each editable in place** (Alta): *Category*, *Application* and *Status change*. A missing value is shown, not guessed: "No application found" with **Link to application…** / **Create application**. While a required field is empty, the Confirm button is disabled (Alta). The status picker shows the transitions allowed for the user (any), and the proposal itself only ever comes from automation-allowed transitions (§4.6).
- **Actions:** two full-width buttons at the bottom, **Confirm** (primary) and **Change…** (secondary) (Instagram). Change… turns the three fields into pickers: a Lloyds-style radio sheet for the category, a searchable application picker with "Create application" pinned at the top, and a status list. "Not job mail" is a plain text button below, because it removes the message from storage (§8) and needs to stay separate from Confirm.
- **After any action:** the sheet closes, the next item slides up, and an `UndoToast` appears above the tab bar (Google Photos), e.g. "Confirmed: Acme moved to Interviewing · Undo". At accessibility text sizes or with VoiceOver, the toast uses the full-width Undo variant (X). The toast stays 8 s, or until the next action. Undo is also available for the last 10 actions from the Updates chip.

**Updates list** (auto-applied, ≥ 0.9): FYI rows with no confirm buttons. Each row says "Moved to Interviewing: email from interviews@acme.com, 22 Oct" with a trailing **Undo** button. A Notion-style overflow menu has "Mark all as seen". Undo writes a reverse `applicationEvent` and moves the message into To review with the correction pre-opened, so the user can say what it actually was.

**Bulk:** a "Select" button in the toolbar (LinkedIn) enables checkboxes. The bottom bar offers **Not job mail** and **Review later**. There is **no "Confirm all"** (Alta's "Add All" is rejected for this domain). Each status change must be looked at once, because a wrong confirm moves a real application.

**Job alerts:** `job_alert` messages don't enter the review queue. In All job mail they collapse into one bundle row "Job alerts · 12 new postings sent to Jobs" (Spark bundles). The postings themselves go to the Jobs feed (§4.7.4).

**Notification center:** there is **no separate bell screen**. The Updates chip is the in-app history of automatic changes, and push notifications deep-link to the review sheet or to the Updates row. iOS notification actions are **Open** only. Confirming from the lock screen without seeing the evidence would break the trust principle.

**Account health:** when an account needs re-auth, a GitHub-style card at the top of the list says "Reconnect savas@gmail.com. We can't check this inbox until you sign in again." with a **Reconnect** button. The card can't be dismissed while the account is broken.

**States:**

- **Empty queue:** "Nothing to review. When we're unsure how to sort an email, it shows up here."
- **No account:** a connect card. Its copy is shared with Today.
- **Loading:** skeleton rows.
- **Offline:** the list stays readable from the Firestore cache. Confirm/Change are queued with a small "Will sync when you're back online" line.
- **Error:** an inline retry row, never a blocking alert.

**Badge:** the Mail tab badge equals the To review count. This depends on Open question 1, because Today currently proposes the same badge.

## Decision — Desktop (macOS + Windows)

**Layout (Notion Mail + Lemni):** three panes inside the main window. The app sidebar already exists (§4.1), so the Mail folders are **nested under the Mail sidebar item** and there is no fourth column:

- **Sidebar (Mail expanded):** To review (n) · Updates · All job mail · Categories (collapsible: Interviews, Assessments, Offers, Decisions, Recruiters, Info requests, Job alerts, Other) · Accounts (one row per address with a status dot: none = healthy, amber = needs re-auth).
- **List pane (360–440 px, resizable):** dense one-line rows (sender · classification · subject · time), like Notion Mail and Superhuman. Hovering a To review row shows Acctual-style **✓ Confirm** and **✎ Change** icon buttons with tooltips that name the shortcut. Each tooltip reads in full, e.g. "Confirm: move to Interviewing (C)", so the icons are never ambiguous.
- **Reading pane (fills the rest):** the `ReviewDetailPane` card is pinned at the top (hilos proposal + reason; Lemni inline Confirm / Change; Braintrust weighting: Confirm primary, Change secondary, "Not job mail" a text button). Below it is the email body, and below that the linked application's **recent activity** as plain sentences (Linear Activity).
- **Details rail (≥ 1440 px):** a collapsible right column (Lemni Details / Linear Properties) with company, role, current status, contact, extracted dates and a link to open the application in Tracker. Below 1440 px this content folds into the review card.

**Correction:** Change (F) opens a cmdk-style popover anchored to the field (Linear property pickers). Tab cycles Category → Application → Status, typing filters the options, and Enter applies. "Create application" is always the first option in the Application picker.

**Keyboard** (shown in tooltips, menus, the shortcuts sheet and a dismissible Superhuman-style hint bar on first use: "C confirm · F change · N not job mail · H review later"):

| Key | Action |
|---|---|
| `J` / `K`, ↑ / ↓ | next / previous message |
| `Enter` / `Esc` | open in reading pane / back to list |
| `C` | Confirm the proposal |
| `F` | Change… (opens the field popover) |
| `N` | Not job mail |
| `H` | Review later (Linear snooze menu with natural-language input + presets) |
| `⌘Z` / `Ctrl+Z` | Undo the last action (also the toast button) |
| `O` | Open the original in Gmail / Outlook / the default mail app |
| `G` then `M` | Go to Mail |
| `1` / `2` / `3` | Switch between To review / Updates / All job mail |

After Confirm or Change, focus moves to the next To review item automatically (Superhuman flow). A bottom-left `UndoToast` (Notion Mail) shows what happened, e.g. "Confirmed: Acme moved to Interviewing · Undo ⌘Z".

**No selection:** the empty reading pane shows "4 emails to review. Select one to see what we found." (Linear), or "Nothing to review" with the same explanation as iOS.

**Life cycle (Front):** To review → Review later (snoozed until a time) → Done. Once confirmed, an item leaves To review and appears in All job mail with a quiet "Confirmed" chip. Auto-applied items appear in Updates until the user marks them seen.

**Email rendering (both platforms, security):** the body renders in a sandboxed view (desktop: an iframe with `sandbox` and no scripts, inside the hardened renderer; iOS: a non-JS `WKWebView`). Remote images are blocked by default with a "Load images" control, and links open externally only through the https allowlist from §8. Plain text is preferred when the message has it.

**OS notifications (desktop):** Electron notifications follow the same rules as push. They appear only for interview invites, offers, assessments with deadlines, rejections (mutable) and re-auth. Clicking one focuses the window and selects the message. When the window is closed, they only arrive if tray / menu bar mode is enabled (§4.9; see `settings-account.md`).

## Components needed

| Component | Platforms | Notes |
|---|---|---|
| `ReviewSheet` (iOS) / `ReviewDetailPane` (desktop) | iOS / desktop | Shared with Today. Contains the proposal sentence, reason line, evidence block, three editable fields, Confirm / Change / Not job mail, and a disabled state when a required field is empty. |
| `ProposalSentence` ("Move {application} from {status} to {status}") | both | Built from the shared status dictionary so every language keeps one grammar. Bold is used only for the target. |
| `ReasonLine` | both | Maps the pipeline's link evidence (thread match, ATS sender, domain, LLM, rules-only) to one sentence. Shared with `AutoChangeRow`. |
| `MailRow` (review / update / plain variants) | both | iOS: swipe + context menu. Desktop: hover actions + focus ring. The type badge sits on `CompanyChip`. |
| `ClassificationBadge` (icon only, for interview / assessment / offer / decision / recruiter / info / alert / other) | both | Icon + accessible label. A neutral palette, never red for decisions. |
| `CategoryPicker`, `ApplicationPicker` (search + "Create application"), `StatusPicker` | both | iOS: sheets. Desktop: cmdk popovers. `StatusPicker` reads its allowed transitions from `@bfhr/core`. |
| `AutoChangeRow` with Undo | both | Shared with Today. |
| `UndoToast` (standard + large-target variant) | both | App-wide. Stacks at most 1. A new action replaces the toast but keeps its Undo in the Updates history. |
| `FilterChips` (To review / Updates / All / Category ▾) | iOS | Uses the system chip style. Wraps to two lines at accessibility sizes instead of scrolling horizontally. |
| `MailSidebarSection` (nested folders + account health dots) | desktop | Part of the app sidebar. |
| `AccountHealthBanner` (Reconnect) | both | Shared with Settings → Mail accounts. |
| `BundleRow` (job alerts summary) | both | Links to Jobs, filtered to source "Alert email". |
| `EmailBodyView` (sandboxed, images blocked by default) | both | |
| `KeyboardHintBar` | desktop | Can be dismissed for good. Its keys mirror the shortcuts sheet. |
| `SnoozeMenu` (+ natural-language input on desktop) | both | Shared with Today. |
| `EmptyState` | both | Variants: queue empty, no account, nothing selected. |

**Data mapping:** the list reads `users/{uid}/mailMessages` (review fields: `reviewState` to_review / later / done, `proposal`, `confidence`, `reason`, `linkedApplicationId`, `category`). Confirm and Change write **only the review fields** (kickoff rule). A server trigger validates the transition with `@bfhr/core`, writes the `applicationEvent`, and stores the labeled example (§4.7.6). Undo is a client write of a "revert" review field that the same trigger turns into a reverse `applicationEvent`. Clients never write `applications` from Mail directly.

## Copy notes

Tone: calm, hedged when unsure, factual when sure. Never write "unfortunately", "rejected!" or urgency words. The `rejection` class is displayed as **Decision** ("Acme decided not to move forward"). TR uses informal "sen" and DE uses informal "du", matching the Today doc (still pending the ux-copy pass).

| Key | EN | TR | DE | Note |
|---|---|---|---|---|
| Tab / screen title | Mail | Posta | Mail | DE uses the loanword "Mail", which is common in UI. |
| Chip: to review | To review | İncelenecek | Zu prüfen | Same term as the Today section. |
| Chip: updates | Updates | Güncellemeler | Updates | DE "Aktualisierungen" is ~2× longer, and "Updates" is standard. |
| Chip: all | All job mail | Tüm iş postaları | Alle Job-Mails | |
| Proposal (review) | Move Acme · Frontend Engineer to Interviewing? | Acme · Frontend Engineer mülakat aşamasına taşınsın mı? | Acme · Frontend Engineer zu „Vorstellungsgespräch" verschieben? | DE runs ~+40 %. The sentence must wrap, and the application name must never be truncated before the status. |
| Hedged classification | Looks like an interview invite | Mülakat daveti gibi görünüyor | Sieht nach einer Einladung zum Gespräch aus | Only used when confidence is < 0.9. |
| Reason: thread | Same email thread as your application of 3 Oct | 3 Eki tarihli başvurunla aynı e-posta dizisi | Gleicher E-Mail-Verlauf wie deine Bewerbung vom 3. Okt. | Dates come from `Intl.DateTimeFormat`. |
| Reason: ATS | Sent from greenhouse.io and mentions this role | greenhouse.io'dan gönderilmiş ve bu pozisyondan bahsediyor | Von greenhouse.io gesendet, nennt diese Stelle | |
| Reason: rules only | Sorted by rules (AI is off) | Kurallarla sıralandı (yapay zekâ kapalı) | Nach Regeln sortiert (KI ist aus) | |
| Confirm | Confirm | Onayla | Bestätigen | |
| Change | Change… | Değiştir… | Ändern… | |
| Not job mail | Not job mail | İşle ilgili değil | Keine Job-Mail | Footnote in the sheet: "We'll forget this email." / "Bu e-postayı saklamayacağız." / "Wir speichern diese E-Mail nicht." |
| No application found | No application found | Eşleşen başvuru yok | Keine passende Bewerbung | |
| Create application | Create application | Başvuru oluştur | Bewerbung anlegen | |
| Auto-applied row | Moved to Interviewing: email from interviews@acme.com, 22 Oct · Undo | Mülakat aşamasına taşındı: interviews@acme.com'dan e-posta, 22 Eki · Geri al | Zu „Vorstellungsgespräch" verschoben: E-Mail von interviews@acme.com, 22. Okt. · Rückgängig | Matches the §2.6 example format exactly. |
| Decision (rejection) | Acme decided not to move forward. We updated the application. | Acme süreci ilerletmemeye karar verdi. Başvuruyu güncelledik. | Acme hat sich gegen eine weitere Runde entschieden. Wir haben die Bewerbung aktualisiert. | Same string as the Today doc. Notifications for decisions can be muted. |
| Undo toast | Confirmed: Acme moved to Interviewing · Undo | Onaylandı: Acme mülakat aşamasına taşındı · Geri al | Bestätigt: Acme ist jetzt bei „Vorstellungsgespräch" · Rückgängig | |
| Queue empty | Nothing to review. When we're unsure how to sort an email, it shows up here. | İncelenecek bir şey yok. Bir e-postayı nasıl sıralayacağımızdan emin olmadığımızda burada görünür. | Nichts zu prüfen. Wenn wir bei einer E-Mail unsicher sind, erscheint sie hier. | |
| No selection (desktop) | 4 emails to review. Select one to see what we found. | İncelenecek 4 e-posta var. Ne bulduğumuzu görmek için birini seç. | 4 E-Mails zu prüfen. Wähle eine aus, um zu sehen, was wir gefunden haben. | Uses ICU plural rules. TR has no plural noun change. |
| Reconnect banner | Reconnect savas@gmail.com. We can't check this inbox until you sign in again. | savas@gmail.com hesabını yeniden bağla. Tekrar giriş yapana kadar bu gelen kutusunu kontrol edemiyoruz. | savas@gmail.com neu verbinden. Bis du dich erneut anmeldest, können wir dieses Postfach nicht prüfen. | |
| Sync line | Checked 3 min ago | 3 dk önce kontrol edildi | Vor 3 Min. geprüft | |
| Offline | Will sync when you're back online | Tekrar çevrimiçi olduğunda eşitlenecek | Wird synchronisiert, sobald du wieder online bist | |

Layout rules from length expansion: buttons have no fixed widths. The iOS review sheet buttons stack vertically when either label exceeds the half width (DE "Bestätigen" / "Ändern…" fit side by side at default size and stack at AX sizes). The desktop list truncates only the subject, never the classification or the time.

## Open questions

1. **One badge, one place.** Today (see `today-home.md`) and the Mail tab both propose a badge with the To review count. Showing the same number twice is noise. *Recommendation:* the badge goes on the Mail tab only, because that's where the queue lives. Today shows the count as plain section text.
2. **Corrections as sender rules.** Should a correction offer "Apply to future mail from this sender" (Revolut / Commons pattern)? It would cut down on repeated reviews of the same recruiter newsletter, but it adds a rules-management screen to Settings. *Recommendation:* not in v1. Corrections are stored only as labeled examples (§4.7.6). Revisit after the fixture set exists.
3. **Undo window for auto-applied changes.** Is Undo available forever (it writes a reverse event) or only for N days? *Recommendation:* forever from the application's timeline. The Updates chip lists the last 14 days.
4. **"Open in Gmail/Outlook" deep links** need the provider message ID on the client. Is the ID acceptable in `mailMessages` (it isn't a secret), or should the link be resolved by a function?
5. **Review later default:** the snooze presets are shared with Today. Should a snoozed review item still count toward the badge? *Recommendation:* no.
6. **Retention display:** should the review sheet say when the email text will be deleted ("Email text kept until 180 days after this application closes")? It builds trust, but adds a line to an already dense sheet. *Recommendation:* show it in the "Show full email" disclosure only.
