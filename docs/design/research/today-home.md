# Today / home: design research

Research date: 2026-10-22. Sources: Mobbin MCP `search_screens` (`task_intent`: "Design a cross-platform job search, CV builder and application tracker app", `output_destination: "code"`). The user's saved Mobbin collections only hold website sections (see kickoff), so none apply to this area. Every reference below was judged from its screenshot. No images are committed; open the `mobbin_url` to view.

## Scope

Brief §5.3 row **Today / home**:

| Platform | Matrix entry | Queries run (mode) | Examined | Kept |
|---|---|---|---|---|
| iOS | home dashboard | "home dashboard screen showing today's tasks and upcoming events" (deep); "home screen of a job search app with application updates and recommended jobs" (standard) | 20 | 7 |
| iOS | task inbox | "task inbox screen listing items that need attention" (deep); "inbox screen of updates with accept and dismiss actions" (deep) | 18 | 7 |
| Desktop (`web`) | dashboard | "home dashboard with today's agenda, upcoming meetings and tasks" (deep) | 10 | 7 |
| Desktop (`web`) | inbox-style home | "inbox home with list of notifications and detail pane" (deep) | 10 | 5 |

Product requirement (§4.1): Today shows what needs attention: **upcoming interviews, mail updates to review, follow-ups due, new top matches, deadlines**. UX principles: calm (no guilt-driven gamification), trust (every automatic action shows source + reason + Undo), speed (keyboard-first desktop, optimistic UI), progressive disclosure.

## References

### iOS: home dashboard

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Asana | Home with stacked section cards | https://mobbin.com/screens/0181c618-16c6-4cfb-808e-fe2ba2207a4d | Each attention type is its own section card with a title, an optional scope menu in the header ("Due soon"), and a full-width "See all" footer. | Scanning stays quick when every section is short and has one way out to the full list. |
| Attio | My tasks grouped by time bucket | https://mobbin.com/screens/73d19614-30e4-4bd6-857a-3c3b3576f923 | Collapsible "Today (3)" / "Upcoming (3)" headers with counts. Each row has a date chip plus a linked-record chip (company logo + name). | The record chip maps directly to our company chip, so a row can say *what* and *which application* in one line. |
| timespent | "Aujourd'hui" day view | https://mobbin.com/screens/457bb4e8-e034-41e2-9494-d67a5a2346fe | Large-title "Today" header and a dismissible tip banner under the title. | A native large title matches the iOS HIG. The dismissible banner suits one-off guidance (e.g. "Connect your mail to see updates here"). |
| Todoist | Upcoming with an overdue section | https://mobbin.com/screens/1ae63b10-6840-42ec-838a-0117cb219e99 | One bulk action in a section header ("Reschedule") for items whose time has passed. | Older follow-ups get one calm way out (snooze all) instead of turning into a growing red pile. |
| Tiimo | Today timeline | https://mobbin.com/screens/2e5e28b9-c537-46b3-89fe-5d46c59fe6a3 | Neutral gap copy ("11h 50m → No plans"), soft cards and plenty of whitespace. | It shows how to present free time without making it feel like failure. That's the tone we want for "nothing due". |
| LinkedIn | Jobs home, "Jobs where you're more likely to hear back" | https://mobbin.com/screens/b148be5d-a56d-44cc-a5d8-8267a85f1cb5 | A match section with a one-line explanation of *why* ("Based on your profile, the job criteria…"), an ✕ dismiss on every job, and status hints such as "Actively reviewing applicants". | This is the closest domain match for "new top matches". Explaining the reason and offering a dismiss supports the trust principle. |
| Fiverr | Home with "My custom offers" | https://mobbin.com/screens/20439271-dae5-4015-af70-160e1cc43811 | The card shows a deadline line ("Offer expires on …") and two actions (secondary "Open in Chat", primary "Review"). | This is the pattern for an offer or assessment deadline: show the deadline as plain text and keep the primary action one tap away. |

### iOS: task inbox

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Todoist | Inbox | https://mobbin.com/screens/c028007f-f435-4658-97ba-305bf6b67179 | Large-title list. Each row has a title, a secondary note, and a metadata line with a time-range chip and a relative deadline chip ("In 5 days"). | Relative deadlines ("in 5 days") are easier to act on than raw dates. The three-line row also fits interviews (title / company / time). |
| Attio | My tasks with a Completed section | https://mobbin.com/screens/c45cd1e7-9589-42fd-8408-b8a6fe179a4b | Today / Upcoming / Completed sections. Completed items stay visible (checked) in a collapsed group at the bottom. | Handled items move out of the way without disappearing, which supports Undo and gives a quiet sense of progress without a score. |
| Amie | Work list | https://mobbin.com/screens/8651d9b8-539c-4a87-af9a-53a2f492dc3a | Compact rows with a right-aligned date pill and "Hide 1 done" to collapse finished items. | Dense but calm. Done items collapse behind one control. |
| Google Photos | Updates, "For your review" and its decision sheet | https://mobbin.com/screens/5dc5a013-0d04-4490-ba45-fd4a310e492f | A "For your review" section label. Tapping an item opens a sheet that explains the context (who, what changes) with Decline / Accept. | This maps to mail updates waiting for confirmation: the sheet shows source and reason before the user confirms (trust). |
| Swarm | Notifications with a pinned request | https://mobbin.com/screens/efa44766-3426-4bdc-a84a-c70403a705ba | Items that need a decision are pinned above the time-grouped feed and have inline primary/secondary buttons. Informational rows sit below with an unread dot. | It separates "needs you" from "FYI", which is our core split between review items and auto-applied updates. |
| Savee | Notifications with an Invitations card | https://mobbin.com/screens/4fa2fe38-8938-4fc2-a4d7-ce8842f63e67 | The actionable invitation gets a card with full-width Decline / Accept, followed by "Today" / "Older" history. | Full-width paired buttons work as 44 pt targets and leave room for longer TR/DE labels. |
| Nike Run Club | Inbox with inline ✕ / ✓ | https://mobbin.com/screens/f62ce5c8-172b-4e9b-8edf-b9d530e5cb77 | Compact icon-only ✕ / ✓ on a single actionable row inside an otherwise passive feed. | This is the compact variant for the "new top matches" rows (Dismiss / Save) where text buttons would crowd the row. |

### Desktop (`web`): dashboard

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Workable | Home with an Events card and a To-dos card | https://mobbin.com/screens/a8b809e2-2c8d-4a51-980a-d35a79b8bfef | An agenda card with a date stepper (‹ date ›) that lists interviews by time range and type label. Next to it, a To-dos card with "Review …" items and their age ("19 m"). | This is the hiring side of our domain: interviews are laid out as an agenda and review items as a to-do list, side by side. |
| Rox | Home, "Here's your focus for today" | https://mobbin.com/screens/8546b8f5-d6cb-4268-af86-872d540751f2 | A focus heading, "Recommended actions (4)" with Filters, a Today meetings card and Tasks card that each have their own empty state ("No meetings found", "All tasks completed"), and a "Task marked as complete — Undo" toast. | Per-card empty states keep the page useful when some feeds are empty. The Undo toast is the trust pattern we require. |
| Charma | Home with Action Items + Today's Schedule | https://mobbin.com/screens/4eacbfa1-0d16-437a-bffc-ddfbf04bc2b4 | A two-column split: action items grouped "Due Today" / "Upcoming" on the left, a compact "Today's Schedule" rail on the right. | This is the layout skeleton for desktop Today: a main attention list plus an agenda rail. |
| Tana | Home, centered "Next Up" | https://mobbin.com/screens/4297e674-95c8-4646-afe9-96cc77cd4635 | A centered single column with a "Next Up" card for the next meeting (attachments as sub-cards), followed by Past and Pinned. | The next interview deserves a hero card that holds its prep material (job, CV used, notes). |
| Superlist | Today | https://mobbin.com/screens/f3c55a25-0602-4a5c-bd59-f69c38d76a1d | A large "Today" title, a dismissible hint ("See what's due today and review…"), collapsible groups, and a visible keyboard hint ("New task ^N"). | Keyboard hints in context support our keyboard-first desktop. The hint can be dismissed for good. |
| Jobber | Home, To do + Today's appointments + right-hand performance rail | https://mobbin.com/screens/4180c32c-84d6-4126-876a-d4f2894bd47d | Setup items labeled with time estimates ("2 minutes"). The day's appointments are listed as rows with time ranges. | Time estimates suit the first-run setup ("Connect mail — 2 min") and make onboarding feel small. |
| Fireflies | Home with assistant cards | https://mobbin.com/screens/276f8391-0174-4501-9c3c-37ad3688710e | "Meeting Prep" card with a quiet status ("No upcoming meetings") and a daily digest card. | Interview prep can be a small card with a calm status line instead of an alarm. |

### Desktop (`web`): inbox-style home

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Workable | Inbox with an expandable row | https://mobbin.com/screens/7b975936-c6ee-4718-a116-64fe2e0f7ffa | Left filter list (Inbox 6 / Important / To-dos 3). Each row has a type icon, the person, the role context and a relative time. The selected row expands inline to show date/time/attendees, and right-aligned accept / tentative / decline icon actions appear on hover. | This is the closest domain match: an interview-scheduled item expands in place, so the user can act without leaving Today. |
| Plane | Inbox list + detail pane | https://mobbin.com/screens/849ec3f0-a1f0-4699-85eb-f895f7330036 | A narrow list with All / Mentions tabs and an unread badge. The selected item opens in a wide detail pane with properties. | This is the master-detail layout for the desktop Today list at ≥ 1200 px wide. |
| Lemni | Three-pane inbox with a Details panel | https://mobbin.com/screens/d06db11d-fdee-4810-84c4-94817e47dc8e | A right-hand Details panel with Status, Dates, Contact and a thread *Summary* line. | A review item needs its evidence (status, dates, contact, summary of the email) beside the decision. |
| Intercom | Composer "Send and snooze" menu | https://mobbin.com/screens/60778106-fa33-4231-95a2-ce3362d8ff06 | Snooze presets (Later today / Tomorrow / Monday / One week / Custom) with keyboard shortcuts shown inline. | This is the snooze menu we use for follow-ups and deadlines, with the shortcuts visible. |
| Front | Inbox with Open / Later / Done folders | https://mobbin.com/screens/a25fd5f3-a74a-4abc-b5f5-11b38cb684fa | A three-state model for items: Open, Later (snoozed), Done. | It gives every Today item a clear life cycle so the list can actually be cleared. |

## Examined but rejected

| App | `mobbin_url` | Reason |
|---|---|---|
| ClickUp (iOS dashboard) | https://mobbin.com/screens/ef147022-3977-4617-b0c0-481cd8af8f6e | A desktop table squeezed onto a phone (columns cut off) and a red "Overdue" header. Both conflict with the calm principle. |
| Notion (iOS to-do) | https://mobbin.com/screens/7be7fafb-3dfb-42e9-855a-832a431a053b | A month calendar grid dominates the screen. Calendar belongs to Tracker → Calendar, not Today. |
| Jira Cloud (iOS work items) | https://mobbin.com/screens/7ccfb103-e54d-45aa-9f8f-40552da41b67 | Developer-oriented density (keys, priority glyphs). Status pills add noise without a next action. |
| Structured (iOS timeline) | https://mobbin.com/screens/26fae4e6-2163-4d93-8c47-5bd9839cb369 | A full-day time grid with an "Energy level" gauge. Too schedule-centric: most Today items aren't timed events. |
| Saturn Calendar (iOS) | https://mobbin.com/screens/7c5b739f-895d-4796-8eb4-7457f544646f | Confetti overlay and a social invite row. Celebratory noise doesn't fit a stressful task. |
| ClickUp (iOS list) | https://mobbin.com/screens/ddac25f9-fb5a-4c6c-9890-7ffaf91d3f6c | "URGENT" red flags and an empty column scaffold. Urgency framing is the guilt pattern we avoid. |
| Tiimo (iOS to-do, "0 / 7" counter) | https://mobbin.com/screens/99dab3c1-f5f5-4cb2-88b9-fea41d8c3e8d | Priority buckets plus a completion counter pill. Counting finished vs. remaining invites scorekeeping. |
| Jira Cloud (iOS all work) | https://mobbin.com/screens/4a793cc6-c40e-46ae-a569-21bdd4c53c2d | A row of five filter dropdowns before any content. Too heavy for a home screen. |
| Fabric (iOS tasks) | https://mobbin.com/screens/fffef448-729f-4035-981d-f7e988b3b64e | A sparse single-card list. It offers no pattern beyond what Todoist and Attio already cover. |
| Asana (iOS project table) | https://mobbin.com/screens/04f565e9-e2d7-4dc0-bbda-35d6d8fb8200 | Spreadsheet columns with colored priority chips on a phone. Hard to scan. |
| Numo (iOS "3603 Tasks") | https://mobbin.com/screens/eb2045d7-8be3-454f-bb5c-ebdef199ed62 | A huge task count and a level badge. Explicit gamification. |
| Evernote (iOS tasks) | https://mobbin.com/screens/8ea47cc0-6fb4-41ab-8112-10e25295eef4 | Notebook grouping and red flags. The grouping axis (notebook) has no equivalent for us. |
| Bond (iOS inbox) | https://mobbin.com/screens/4898ed42-db35-4380-9f6e-1674d09cf58e | Repeated identical "Accept" rows and a long tail of low-value suggestions: notification spam. |
| Stardust (iOS notifications) | https://mobbin.com/screens/a00b9d8d-ecb3-49e7-8d1c-fb583ec3486f | Decorative gradient buttons with low contrast on a starfield background. |
| Pangea (iOS notifications) | https://mobbin.com/screens/70a1f9bf-832e-466b-a0b5-ea65fcad108b | The inline accept pattern is fine, but Swarm and Savee show it more clearly. The red badge on the Feed tab counts everything. |
| Insight Timer (iOS friends) | https://mobbin.com/screens/0da4ee0b-c3bb-415f-b346-28a1771b9111 | Requests / Updates tabs split one small list into two screens. |
| Insight Timer (iOS home) | https://mobbin.com/screens/c6b8f844-3ea9-4a88-8544-6ecb5b96247c | A content-discovery carousel of live sessions. Our Today is about tasks, not a media feed. |
| Rakuten (iOS home) | https://mobbin.com/screens/f3d5799a-85ed-459d-af94-e08099aa2a04 | A persistent "3/5 Finish Account Setup" pill. Nagging progress UI. |
| Mesh (iOS home) | https://mobbin.com/screens/d5d3fed0-2ee8-4228-a0e4-03d8a2dfc96a | "Reflect on your relationship…" prompts mixed with welcome cards. The mix doesn't say what to do next. |
| GitHub (iOS home) | https://mobbin.com/screens/1997e399-9174-4639-a5df-1a39caddb715 | A navigation menu ("My Work" list of destinations) rather than attention items. It duplicates the tab bar. |
| Quizlet (iOS home) | https://mobbin.com/screens/121d0e7e-b020-4aa1-81b6-589ea2a1f49e | A personalization prompt card above the content. Discovery-first. |
| Notion (iOS home) | https://mobbin.com/screens/c119cf0c-6553-47b2-aead-63d060159283 | "Recently edited" pages list. Recency isn't attention. |
| Mindvalley (iOS today) | https://mobbin.com/screens/022093ab-4507-4880-917a-35f7dc23b9fa | "1 DAY STREAK" banner. Streaks are explicitly banned (§5.4 calm). |
| Whatnot (iOS home) | https://mobbin.com/screens/88de456a-36ab-4456-b294-c14cf94ccc56 | Live-commerce carousel with loud badges. |
| Fresha (web dashboard) | https://mobbin.com/screens/d154c2ec-d0e0-45df-b2e4-307d0f2b661b | Four equal-weight revenue/appointment tables with no priority order, and red "CANCELLED" labels. |
| Amie (web) | https://mobbin.com/screens/4611b248-aa94-4ad1-aa17-98d58ca6cbba | A full week calendar takes up most of the home screen. That belongs to Tracker → Calendar. |
| Trello (web planner) | https://mobbin.com/screens/93eebe2d-c1da-4b40-891d-65aa47e0f8e9 | Board + planner with a photo background and a "Premium" upsell. Busy and unrelated. |
| Charma (web), greeting banner detail | https://mobbin.com/screens/4eacbfa1-0d16-437a-bffc-ddfbf04bc2b4 | Layout kept (see above). The "Hey Jane, you're awesome" praise banner is rejected because unearned praise feels hollow in a job search. |
| Givingli (web inbox) | https://mobbin.com/screens/17d1e6c9-66db-464a-bb1f-19b076c63b76 | A decorative full-bleed envelope detail. No information density. |
| Whop (web support chats) | https://mobbin.com/screens/c2680a3f-e3b2-44ad-bc44-b4654f483dbc | A chat client, not an attention list. Its only useful idea (notification preferences menu) belongs to Settings. |
| Superlist (web messages) | https://mobbin.com/screens/31d73cf2-7653-497d-b3a9-a059cdd6bdba | A mentions feed. It adds nothing beyond Plane. |
| Notion Mail (web) | https://mobbin.com/screens/786accc1-462f-4428-a534-fccef775c354 | A full email client with 99+ counters. Raw mail belongs to the Mail area; Today only shows classified job updates. |
| HubSpot (web inbox) | https://mobbin.com/screens/56cf36dd-2345-49d2-8284-df2965a29945 | CRM density, a trial banner and many zero-count folders. |

## Decision — iOS

**Screen:** `Today` tab (first tab), native stack with a **large title "Today"** and a date subtitle (locale-formatted, e.g. "Wednesday, 22 October"). The avatar button (top right) opens Profile/Settings per §4.1. Native `List` in inset-grouped style, pull to refresh, Dynamic Type throughout.

**Section order** (fixed, most time-sensitive first; empty sections are hidden, never shown with "0"):

1. **Next up**: one hero card for the next interview within 48 h (Tana "Next Up" + Fireflies prep). It shows company chip, role, round name, local time *and* interviewer time zone when they differ, meeting link button ("Join" appears 10 min before), and a "Prep" disclosure (CV used, job, notes). If there's no interview, the section is hidden.
2. **To review**: mail updates (Swarm/Savee pinned-decision pattern, Google Photos "For your review" sheet). Two row kinds:
   - *Needs confirmation* (review queue, confidence < 0.9): row with company chip + a one-line classification ("Looks like an interview invite"). Tapping it opens a **form sheet with medium/large detents** that shows source (account, sender, received time), reason (matched thread / ATS sender), the extracted fields, and **Confirm** / **Change…** buttons.
   - *Applied automatically* (≥ 0.9): an FYI row ("Moved to Interviewing — from interviews@acme.com") with an **Undo** trailing action. It stays until it's acknowledged by swipe or tap.
3. **Follow-ups**: suggested follow-ups (7 days after Applied, configurable). Row: company chip, role, "Applied 8 days ago · no reply yet". Actions: **Draft follow-up** (primary, opens Apply/compose), Snooze, Not needed. Suggestions older than 14 days collapse into "Older suggestions (n)" with a single "Snooze all" header action (Todoist "Reschedule"). They never pile up as red overdue items.
4. **Deadlines**: assessments, offer response dates, job closing dates for saved jobs. Rows use relative chips ("In 2 days", "Tomorrow, 17:00") as in Todoist. The deadline is plain text, and the primary action is one tap away (Fiverr).
5. **New matches**: up to 3 top matches since the last visit. Each row gives the reason in one line (LinkedIn: "Matches your Senior React + Remote EU search") plus icon-only Save / Dismiss (Nike compact ✕/✓). Footer "See all in Jobs".

**Interactions:** leading swipe = primary positive action (Confirm / Done / Save). Trailing swipe = Snooze (menu: Later today, Tomorrow, Next week, Pick date…) and Dismiss. Every row has a context menu with the same actions plus "Open application". Haptics: light on Confirm, none on Dismiss. Every mutation is optimistic, with a bottom toast "… · Undo" (Rox).

**Handled items** go to a collapsed "Done today (n)" group at the bottom (Attio, Amie), kept until midnight local time. There's no counter, ring or streak.

**Badges:** the Today tab shows **no badge**. The review-queue count badge lives only on the **Mail** tab, where the queue itself is (agreed with `docs/design/research/mail-review.md`, Open question 1). Inside Today, the count appears as plain section-header text ("To review · 3"). Follow-ups and matches never badge anywhere (calm).

**Empty / first-run:** with no mail account, a dismissible card "Connect your email to see interview invites and replies here" (timespent banner, Jobber time estimate "about 2 min"). Once everything is handled: "You're all caught up. New updates will show up here." (Tiimo-style neutral tone). No praise, no confetti.

## Decision — Desktop (macOS + Windows)

**Screen:** sidebar item `Today` (first), shortcut ⌘1 / Ctrl+1. Inbox-style master–detail:

- **Center column** (min 420 px, max 720 px): the same five sections and order as iOS, as compact rows (one-line title + one-line context). This keeps parity with iOS so the mental model transfers between devices.
- **Right detail pane** (≥ 1200 px window width, Plane/Lemni): the selected item's evidence and actions. A review item shows a Details block (status before → after, dates, contact, email summary, link to the original message) with Confirm / Change. An interview shows prep material and the Join link. A follow-up shows the draft preview. Below 1200 px the detail opens as an inline expansion of the row (Workable inbox), so it still works in Snap layouts / half-screen.
- **Agenda rail** (≥ 1440 px only, Charma/Workable Events): the next 7 days of interviews and deadlines with a ‹ week › stepper. It's read-only; clicking an entry selects the item.

**Keyboard (shown in tooltips, the native menu bar and the shortcuts sheet; Superlist-style inline hints):** `J/K` or ↑/↓ move, `Enter` open detail, `E` done/acknowledge, `C` confirm review item, `H` snooze (opens the Intercom-style preset menu with the presets numbered 1–5), `#` dismiss, `⌘Z / Ctrl+Z` undo, `G then T` go to Today. Every action is also available on right-click.

**Item life cycle:** Open → Later (snoozed until a date) → Done (Front). A filter control in the header switches between Open (default) and Later. Done items collapse at the bottom as on iOS.

**Platform chrome:** macOS hidden-inset title bar with traffic lights over the sidebar. Windows title-bar overlay with native caption buttons and the Segoe UI Variable font. The Today header holds only the title + date + the Open/Later filter. There's no greeting banner.

**No charts on Today.** Metrics live in Insights. At most, the footer of the center column links to "This week in Insights".

## Components needed

| Component | Platforms | Notes |
|---|---|---|
| `TodaySection` (header: title, optional count, header action e.g. "Snooze all", footer "See all") | iOS, desktop | Hidden when empty. The count is plain text, never a red badge. |
| `AttentionRow` (kind icon, title, company chip, context line, meta chips, actions) | iOS, desktop | One component, six kinds: interview, review, autoUpdate, followUp, deadline, match. iOS adds swipe + context menu; desktop adds hover actions + keyboard focus ring. |
| `CompanyChip` (logo/monogram + name) | both | Shared with Tracker / Jobs. |
| `RelativeTimeChip` ("In 2 days", "Tomorrow, 17:00", "Applied 8 days ago") | both | Uses `Intl.RelativeTimeFormat` and locale time formats (24 h for TR/DE). Neutral color only; never red. |
| `NextUpCard` (interview hero with Join, time-zone line, Prep disclosure) | both | "Join" appears 10 min before the start time. |
| `ReviewSheet` (iOS form sheet with detents) / `ReviewDetailPane` (desktop) | iOS / desktop | Source + reason + extracted fields + Confirm / Change. Shared with the Mail review queue. |
| `AutoChangeRow` with Undo | both | Trust principle. Undo writes a reverse `applicationEvent`. |
| `SnoozeMenu` (Later today, Tomorrow, Next week, Pick date) | both | Desktop shows shortcut numbers. iOS uses a native menu. |
| `MatchRow` (reason line, Save/Dismiss icon buttons) | both | Shared with the Jobs feed. |
| `DoneGroup` (collapsed handled items) | both | Clears at local midnight. |
| `EmptyState` (all caught up, connect-mail card) | both | Dismissible setup card with a time estimate. |
| `UndoToast` | both | Shared app-wide. |
| `AgendaRail` (7-day list with week stepper) | desktop | Only ≥ 1440 px. |
| `KeyboardHint` (inline shortcut glyphs, ⌘ vs Ctrl per OS) | desktop | Reused in menus and tooltips. |

Data mapping (no new collections; computed on the client from existing paths in kickoff's Firestore layout): `interviews` (next up, agenda), `mailMessages` review fields (to review), `applications` + `applicationEvents` (follow-up suggestions, auto-applied changes), `interviews`/`applications`/`jobs` deadline fields (deadlines), `jobMatches` (new matches). Snooze/dismiss state for suggestions must persist per user. Where it lives is an open question below.

## Copy notes

Tone: calm, specific, no urgency words ("overdue", "urgent", "late", "don't miss"), no praise, no streaks. Use the company's name, not "Employer". For rejections, use neutral wording, and allow muting them.

| Key | EN | TR | DE | Note |
|---|---|---|---|---|
| Screen title | Today | Bugün | Heute | |
| Section: next up | Next up | Sıradaki | Als Nächstes | |
| Section: to review | To review | Gözden geçir | Zu prüfen | |
| Section: follow-ups | Follow-ups | Takip | Nachfassen | |
| Section: deadlines | Deadlines | Son tarihler | Fristen | |
| Section: new matches | New matches | Yeni eşleşmeler | Neue Treffer | |
| Follow-up row context | Applied 8 days ago · no reply yet | 8 gün önce başvuruldu · henüz yanıt yok | Vor 8 Tagen beworben · noch keine Antwort | Main length risk: DE ~+35 %, TR ~+30 %. Row must wrap to 2 lines, never truncate the count. |
| Follow-up primary action | Draft follow-up | Takip e-postası yaz | Nachfass-E-Mail entwerfen | DE is about 2× EN. iOS swipe labels use the short form "Follow up" / "Takip et" / "Nachfassen". |
| Not needed | Not needed | Gerek yok | Nicht nötig | Replaces "Dismiss" for suggestions (less dismissive in tone). |
| Auto-applied update | Moved to Interviewing — from an email by Acme. Undo | Mülakat aşamasına taşındı. Kaynak: Acme e-postası. Geri al | Zu „Vorstellungsgespräch" verschoben — laut E-Mail von Acme. Rückgängig | Always names the source. Status names come from the shared status dictionary. TR avoids attaching suffixes to the company placeholder (vowel harmony breaks: "Acme'den" vs "Google'dan"). See `states.md` Open question 5. |
| Review prompt | Looks like an interview invite from Acme | Mülakat daveti gibi görünüyor · Gönderen: Acme | Sieht nach einer Einladung zum Gespräch von Acme aus | Hedged wording because confidence is < 0.9. TR uses a "Gönderen:" label instead of a suffix on the name. |
| Rejection update | Acme has decided not to move forward. We've updated the application. | Acme süreci ilerletmemeye karar verdi. Başvuruyu güncelledik. | Acme hat sich gegen eine weitere Runde entschieden. Wir haben die Bewerbung aktualisiert. | Neutral, no "unfortunately". Mutable in Settings. |
| All caught up | You're all caught up. New updates will show up here. | Hepsi tamam. Yeni gelişmeler burada görünecek. | Alles erledigt. Neue Updates erscheinen hier. | |
| Connect mail card | Connect your email to see interview invites and replies here. About 2 minutes. | Mülakat davetlerini ve yanıtları burada görmek için e-postanı bağla. Yaklaşık 2 dakika. | Verbinde dein E-Mail-Konto, um Einladungen und Antworten hier zu sehen. Etwa 2 Minuten. | TR uses informal "sen" and DE informal "du" (app is personal). See open question. |
| Snooze presets | Later today · Tomorrow · Next week · Pick a date… | Bugün daha sonra · Yarın · Gelecek hafta · Tarih seç… | Später heute · Morgen · Nächste Woche · Datum wählen… | |

Layout rules from length expansion: no fixed-width buttons; section headers allow 2 lines on iOS at accessibility sizes; time strings come from `Intl.DateTimeFormat` (TR/DE 24 h, week starts Monday).

## Open questions

1. **Persistence of snooze/dismiss for computed items** (follow-up suggestions, matches): store on the source document (`applications/{id}.followUpSnoozedUntil`, `jobMatches/{id}.dismissedAt`) or in a dedicated `users/{uid}/todayState/{itemKey}` collection? The latter would add a path to the kickoff Firestore layout and needs an ADR. *Recommendation:* fields on the source documents, so no new collection is needed.
2. **"Next up" window**: 48 h is proposed. Should it be configurable alongside interview prep reminders (§4.6)?
3. **Formality in TR/DE**: informal "sen"/"du" is proposed for a personal tool. This must be confirmed with the ux-copy pass so all areas agree.
4. **"Done today" reset**: local midnight vs. a rolling 24 h. Local midnight is proposed; it matters for users travelling across time zones.
5. **iOS widget / Live Activity for the next interview**: useful but not in the §4 scope for v1. Should it stay out of M0–M2?
6. **Greeting line**: none is proposed (title + date only). If the user wants a greeting, it must be time-of-day only ("Good morning"), with no praise.
