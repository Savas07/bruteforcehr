# Tracker — design research (board · table · detail · calendar)

Research date: 2026-10-22 · Source: Mobbin MCP (`task_intent`: "Design a cross-platform job search, CV builder and application tracker app", `output_destination`: `code`) · Judged from result images, not metadata. No images are stored in the repo.

## Scope

Brief §5.3 row **Tracker board / table / detail** and §4.6 (core screen: **Tracker board**).

| Platform | Matrix item | Covered by section |
|---|---|---|
| iOS | pipeline tracking | iOS-1 Pipeline / board, iOS-2 Stage index |
| iOS | kanban board | iOS-1 Pipeline / board, iOS-3 Moving between stages |
| iOS | activity timeline | iOS-4 Activity timeline, iOS-5 Detail header + next step |
| iOS | calendar (§4.6 view) | iOS-7 Calendar |
| iOS | auto status + Undo (§4.6 rules, kickoff trust principle) | iOS-6 Undo feedback, iOS-4 |
| Desktop (`web`) | kanban board | D-1 Board, D-2 Drag between columns |
| Desktop (`web`) | data table with filters | D-3 Table |
| Desktop (`web`) | record detail | D-4 Record detail + timeline |
| Desktop (`web`) | calendar view (§4.6) | D-5 Calendar |
| Desktop (`web`) | auto status + Undo | D-6 Status model, automation and Undo |

Statuses in scope (§4.6, state machine owned by `@bfhr/core`): **Saved → Preparing → Applied → Acknowledged → Screening → Interviewing → Offer → Accepted | Declined**, plus **Rejected / Withdrawn / Ghosted** from any active status. Automation may only move forward or to Rejected; Ghosted is only ever *suggested* (21 silent days); every transition writes an `applicationEvents` doc.

User collections: `list_collections` was checked first (§5.2). The user's saves hold 11 website sections only (0 iOS/web screens or flows), so no saved items apply to the Tracker. Everything below comes from search.

Search log (query → examined / kept):

| # | Platform | Tool | Query | Mode | Examined | Kept |
|---|---|---|---|---|---|---|
| 1 | ios | screens | kanban board | deep | 8 | 4 |
| 2 | ios | screens | pipeline tracking screen with deals grouped by stage | deep | 8 | 3 |
| 3 | ios | screens | list screen with horizontally scrolling stage tabs showing counts | deep | 8 | 4 |
| 4 | ios | flows | moving a card to another column on a board | — | 6 | 4 |
| 5 | ios | screens | activity timeline screen on a record showing status changes and comments | deep | 8 | 3 |
| 6 | ios | screens | issue detail screen with activity history | standard | 8 | 3 |
| 7 | ios | screens | deal detail screen with current stage and next step | deep | 8 | 4 |
| 8 | ios | screens | toast with undo button after an item was moved | deep | 8 | 5 |
| 9 | ios | screens | calendar screen with month view and agenda list of upcoming events | standard | 8 | 4 |
| 10 | web | screens | kanban board | deep | 8 | 4 |
| 11 | web | screens | sales pipeline board with many stage columns and deal cards | deep | 8 | 4 |
| 12 | web | flows | dragging a card to another stage on a board | — | 6 | 4 |
| 13 | web | screens | data table with filters and status column | deep | 8 | 4 |
| 14 | web | screens | record detail page with activity timeline and properties sidebar | deep | 8 | 4 |
| 15 | web | screens | calendar view of tasks with due dates in a month grid | deep | 8 | 4 |
| 16 | web | screens | activity feed entry showing a change made automatically by an automation with its source | deep | 8 | 1 |
| 17 | web | screens | toast with undo after changing an item's status | standard | 8 | 3 |

Total: 132 candidates examined across 17 queries (a few, e.g. Superlist and Deel, surfaced in two queries), 62 kept.

---

## References — iOS

### iOS-1 Pipeline / board (kanban board, pipeline tracking)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Linear Mobile | Project issues grouped by status | https://mobbin.com/screens/26badb99-f19d-4bd2-bd56-a3ce1e28f63b | One vertical list with a section per status (status icon + name + `+`), rows are one line with the status glyph on the left | It shows the whole pipeline in one scroll, so a stage never hides behind a swipe. Sections shrink to their contents, which suits 7 active stages of uneven size. |
| Linear Mobile | Issues with All / Active / Backlog tabs above status sections | https://mobbin.com/screens/0b396f0b-077e-41e9-896b-704c4fab59ee | Scope tabs above the grouped list (our **Active / Closed / All**) | Puts the closed outcomes (Accepted, Declined, Rejected, Withdrawn, Ghosted) one tap away without crowding the active pipeline |
| GitHub | Project shown as collapsible status sections ("Board layout is currently not supported") | https://mobbin.com/screens/6d1c0949-c31d-44e6-a2e0-fc334f0712e0 | Collapsible section headers with a count badge and chevron. Each item shows its status as a property line. | A mature board product turned its board into grouped sections on iPhone. Collapse + count lets the user fold "Saved" or "Closed" away. |
| Jira Cloud | Board: one column per page with a peek of the next, filter chips, count in header, `+ Create` at column end | https://mobbin.com/screens/6a847e41-d3f0-446b-bb98-09faf22c2f8e | Column header pattern (stage label + count), filter-chip row above content, quick add at the end of a stage | The header and filter row carry over to our sections. We reject the column pager (see Decision). |
| Asana | Board column with peek, bottom filter/sort buttons, "New task" primary button | https://mobbin.com/screens/e8502c9c-3cea-422b-8434-0e871f4c4d71 | Filter + sort as small bottom-left controls and one primary add button bottom-right, in thumb reach | Keeps the top area for the stage index and the content |
| Attio | CRM pipeline: "Pipeline ▾" view switcher, stage header with coloured dot + count, sort + filter icons, FAB | https://mobbin.com/screens/a84efb46-b3c6-45c2-a707-edfdf6654ab7 | Stage colour dot + label + count as the stage identity. A titled view switcher ("Pipeline ▾") in the nav bar. | The CRM deal pipeline is the closest analogue to a job pipeline. The dot + label works without relying on colour alone. |
| Notion | Board inside a page: status pill header with count, `+ New page` per column | https://mobbin.com/screens/71f9dba2-130f-406e-b4fe-781f227f51b8 | Status as a soft pill (dot + label) in the header rather than a loud filled bar | Matches the calm tone. Pills keep long DE labels legible. |

### iOS-2 Stage index (many stages on a narrow screen)

| App | Screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Luma | Guest list with scrolling tabs "Going 3 · Checked In 1 · Not Checked In 2" | https://mobbin.com/screens/714cff52-5dbc-4a9b-82da-fb910da4e4dc | Horizontally scrolling text tabs with inline counts | Stays readable with 7+ stages. Unlike Jira's page dots, every stage is named and counted. |
| Babbel | Review items with stage chips; empty stages dimmed | https://mobbin.com/screens/84ceed2b-407a-4f99-a83f-7752a78baa6d | Stage chips where empty stages are visually dimmed but still tappable | Signals where applications sit at a glance without hiding stages |
| Vinted | My orders: Sold/Bought tabs + status chips (All, In progress, Canceled, Completed) | https://mobbin.com/screens/36212419-2797-4489-9180-a242ea351d7e | Two-level filtering: a scope (Active / Closed) plus outcome chips inside Closed (Accepted, Declined, Not selected, Withdrawn, Ghosted) | Keeps the 5 terminal outcomes from adding 5 more top-level stages |
| Shopify | Products: search + sort + filter, status chips, status badge per row | https://mobbin.com/screens/b933ed27-9092-4c6e-9499-82f8b2a2bef0 | Search field + sort + filter on one row, with a status badge on each row in filtered/searched results | When the list is filtered across stages, each row still needs its own status label |

### iOS-3 Moving between stages (drag + non-drag)

| App | Flow / screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Asana | Flow "Reordering task": long-press drag of a row from *To do* into the *Doing* section of a grouped list | https://mobbin.com/flows/3327991e-05e1-46c6-87ed-b7791dece198 | Drag a row across section headers in a grouped list to change its status; the lifted row is outlined | Shows that drag-to-change-status works without columns |
| monday.com | Flow "Moving item to board": long-press → action sheet (Move to group…) → "Choose Group" sheet | https://mobbin.com/flows/1be746f2-d264-42e0-ace0-94d1f8724f99 | A **Move to…** sheet that lists all stages as a fallback to dragging | Needed for VoiceOver/Switch Control, one-handed use and long distances (Saved → Offer) |
| Jira Cloud | Flow "Board": paged columns with page dots; empty column shows "0" + Create | https://mobbin.com/flows/472f89a1-74f8-4b03-9a63-9d8d460efc16 | Empty-stage handling (count 0 + quick add) | Shows the cost of paging: reaching DONE takes several swipes and the dots don't name stages. This informed the rejection of the pager. |
| Asana | Flow "View project as board": "Change view" sheet (Overview, List, Board, Calendar…) | https://mobbin.com/flows/29218d09-bf8e-4e59-a3ee-10a1a686ebf4 | View switching from a sheet opened by the nav-bar title menu | One consistent place to switch Pipeline ↔ Calendar on iPhone |
| Obsidian | Drag-to-move feedback tooltip "Move into 'Itinerary'" | https://mobbin.com/screens/9a0771d2-d259-416f-b986-469d4c626c71 | While dragging, a floating label names the destination ("Move to Screening") | Makes the target explicit before release, so there are fewer accidental moves |

### iOS-4 Activity timeline

| App | Screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Airwallex | Request detail: Comments, Attachments, then a Timeline with an icon per event (submitted ✈, rejected ✕), actor and timestamp | https://mobbin.com/screens/44619c0d-d82b-4218-bd4f-44adb0006335 | Event-type icon on a thin vertical rail + actor + exact timestamp | A compact status history for approval-style records, close to our status changes |
| KOHO | Feature request: Activity Feed with "Sort by Newest first", events by an **"Autopilot"** actor | https://mobbin.com/screens/05cfcc58-b81a-44ec-9081-1f3686a77de6 | Automated events attributed to a named non-human actor with its own avatar. A sort toggle. | Our auto status changes need a visible source (`Mail`, `Rule`) distinct from "You" |
| GitHub | Issue: compact system rows ("added the enhancement label", "self-assigned this") between full comment cards | https://mobbin.com/screens/4b683187-7276-48fe-be2d-71adad8fbd01 | Two visual weights: one-line system events (icon + sentence) and full cards for content (emails, notes) | Keeps status noise small and lets emails and notes carry the weight |
| Fiverr | Order activity: rail with icons, expandable entries ("Order requirements submitted" ⌄), status chip "Pending resolution" in header | https://mobbin.com/screens/ea08a9f0-fb37-496e-8282-711586991fc0 | Expandable timeline entries (email snippet → full message) | Progressive disclosure for long inbound/outbound emails |
| Swarm | Timeline with day header "Today" and icon nodes on a rail | https://mobbin.com/screens/dfd98b64-ff9e-44be-a762-bf2fe201a588 | Day headers (Today, Yesterday, date) grouping events | Lets the user scan "what happened this week" |
| ShopBack | Activity details: past ✓ / current ◉ / future ○ steps with explanation | https://mobbin.com/screens/63d4936a-2b89-4f55-abe5-8ba7768ba295 | Past/current/future step states | Used for the compact stage progress in the detail header (iOS-5), not for the event log |

### iOS-5 Detail header + next step

| App | Screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Vestiaire Collective | Order: rail with done/current/next; current card has "IN PROGRESS" chip, a plain-language explanation, the deadline and the automatic consequence ("we'll automatically cancel…") plus one action | https://mobbin.com/screens/984bf280-8384-4125-8136-360fc80eddf2 | Current-status card with: status chip, one-sentence "what this means", date, **one** next action. Automatic consequences are spelled out in advance. | Matches our trust principle (source + reason) and §4.6's "next action" in the header |
| StubHub | Listing timeline: Listing created ✓, Tickets uploaded ✓, Event happens (current), Get paid (future), each with a short explanation | https://mobbin.com/screens/b3c71fe5-884d-4f57-85a2-8b39192d46d8 | Supportive one-line explanations per step | Calm, informative tone for a stressful wait |
| Wealthfront | "Next Step" card (Dismiss / Continue) above "Here's the plan" checklist | https://mobbin.com/screens/bf81f32c-3f10-4eba-a699-2785fbb8138f | **Suggestion card** with explicit Dismiss + Continue | Used for "Follow up?" (7 days after Applied) and "Mark as ghosted?" (21 days), which are suggestions, never automatic |
| Shopee | Sell details: status "Processing" + numbered steps with *estimated* dates | https://mobbin.com/screens/8fa46fea-04b6-45bc-96ea-ef81ad637a05 | Show expected timing as "Estimated …" in a lighter tone | Useful for "typical response time" hints later (Insights) without false precision |

### iOS-6 Undo feedback

| App | Screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Amie | Top pill "Moved to · House" with circular countdown + Undo | https://mobbin.com/screens/eefcf49d-88ee-4e51-abfd-e37f3a5feb20 | Toast that names the **destination**, with a visible countdown ring and a large Undo button | The user sees exactly what changed and how long Undo stays offered |
| Google Drive | Bottom snackbar: '"IMG_9853.JPG" moved to "Work"' · Undo | https://mobbin.com/screens/db60a3e2-1e3a-414c-926e-2776b2f5dfcd | Item + destination in one sentence | Template for "Acme · moved to Screening" |
| Microsoft Outlook | "Moved" banner with Undo above the bottom edge | https://mobbin.com/screens/eb5e9155-b869-48d2-8b30-b0966764605b | Toast sits above the tab bar, never covering it | Keeps navigation usable during the Undo window |
| My BMW | "Favorite removed." · UNDO above tab bar | https://mobbin.com/screens/7ab2720a-b373-420b-a6a5-354e76153343 | Short past-tense message + single action | Short copy survives TR/DE expansion in one line |

### iOS-7 Calendar

| App | Screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Structured | Week strip with per-day event dots; expandable month sheet with Today button | https://mobbin.com/screens/cd499667-04a3-4471-8e87-28facf1b1acd | Week strip with event dots (interview / deadline / reminder) that expands to a month | Fits iPhone width; month only on demand |
| Joi | Big date + week strip, agenda below; month picker sheet with ‹ Today › | https://mobbin.com/screens/42d0a9d1-00cf-404f-b199-9e7889813a4b | Day agenda under the strip; month picker as a sheet | Agenda is what users act on; month is for orientation |
| Luma | Upcoming / Past segmented + date-grouped event cards | https://mobbin.com/screens/d4822396-cb10-4aa2-b6f5-509889761fed | Upcoming / Past toggle and date-headed cards | "Past" gives quick access to finished interviews to add notes |
| Posh | Agenda list grouped by month headers | https://mobbin.com/screens/e083f1f8-683b-4e4e-b5e3-89f6ed9e7203 | Month section headers in a long agenda | Scales to weeks of interviews without a grid |

## References — Desktop (macOS + Windows, from `web`)

### D-1 Board

| App | Screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| HubSpot | Deals board: 6+ stage columns, per-column **collapse ‹** next to the count, column footer totals, "No activity for 2 days" on cards, Board options | https://mobbin.com/screens/35b26dbf-8d2b-4f6c-a789-738b02d927b1 | Per-column collapse to a narrow rail. A count in the header. A **staleness line** on the card. | Many-stage boards stay usable by collapsing columns the user doesn't need. The staleness line maps to our follow-up suggestion. |
| Pipedrive | Deals pipeline: stage headers with "$ · N deals" summary, sort "Next activity", warning icon on deals without a scheduled activity | https://mobbin.com/screens/2ff3c977-7902-48b5-8361-0c89710e5c2e | Sub-line under each header (count + oldest age). Default sort by **next action**. | The job-search equivalent of "next activity" is the next action/interview |
| Attio | Sales list board: "Pipeline ▾", "Sorted by", per-column `+` and collapse, comments side panel next to the board | https://mobbin.com/screens/b9c21611-63dc-4d32-936b-6a756173b062 | Board + **right side panel** for the selected record without leaving the board | Multi-pane desktop layout (§4.1). Keyboard users can browse cards and read details. |
| Lightfield | Opportunities board scrolled horizontally (first column cut off), "Display" popover: Table/Board toggle + display-property chips | https://mobbin.com/screens/582464c2-f4b2-4ad1-b267-804451ee22d4 | A **Display** popover to choose which fields show on cards. Board/Table toggle in one place. | Lets the user keep cards minimal (company, role, age) or richer (salary, location) |
| Wrike | Board with Table / Board / Gantt tabs, column pills with counts, 5th column peeking off the right edge | https://mobbin.com/screens/33f3bf21-8764-4a10-80d9-6c3474ffb9bd | Peek of the next column as the horizontal-scroll affordance. View tabs above the board. | Shows that peeking beats a scrollbar alone as a cue |
| Programa | Board / List / Timeline segmented control, full-height columns with status icon + count, "Add Task" at column foot | https://mobbin.com/screens/894a77ba-3553-4f11-a721-e274fd07b621 | Full-height column wells so a drop target exists even in short or empty columns | Bigger drop targets, so drag errors are less likely |
| Height | View popover (Spreadsheet / Kanban / Calendar / Gantt) with "Show: sections with tasks", "Show tasks completed: Always" | https://mobbin.com/screens/913e271b-5104-454a-96aa-56b7c255c167 | "Hide empty stages" and "Show closed" as view options | Same need: 12 statuses, of which only a few are populated at once |
| ClickUp | Board with Customize view panel: **Collapse empty columns**, Group: Status | https://mobbin.com/screens/0c287f59-753c-4e28-92ad-9dff95fcde36 | Auto-collapse empty columns into slim rails | Saves width automatically; no manual setup needed |

### D-2 Drag between columns

| App | Flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Jira | "Moving a task": the target column header reads **"CONCEPTING → DESIGN"** during the drag; source slot ghosted | https://mobbin.com/flows/bc08701d-f5f3-4b98-beef-584970abe4dc | Transition label in the drop target ("Applied → Screening"). A ghost placeholder in the source column. | States the exact transition before release; matches the event we'll write |
| HubSpot | "Moving a card": whole target column tints on hover, counts/totals update on drop | https://mobbin.com/flows/96e99766-c7b6-4655-a6bd-c556b49c8b38 | Full-column drop highlight; counts update optimistically | Large, forgiving target; instant feedback (optimistic UI principle) |
| Basecamp | "Moving a card": Triage row on top; **"Not now" and "Done" as collapsed vertical rails** on the right edge | https://mobbin.com/flows/78f53db5-3a21-4b6a-b2f6-f465508cba5f | Terminal outcomes as **slim vertical rails at the board's right edge** that still accept drops | This solves the 5 closed outcomes: they're always reachable as drop targets without 5 full columns |
| Rox | "Moving an opportunity": per-column hide (eye) toggle, "No opportunities" empty state, outlined drop placeholder | https://mobbin.com/flows/7a5485a4-69f0-4330-af7e-0f07f31b1745 | Outlined placeholder at the insertion point; quiet empty-column copy | Calm empty states; precise drop preview |

### D-3 Table

| App | Screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Browserbase | Filter chips "Status is Completed ×", `+` menu (Status, Region, Date), Clear filters, sort "Newest", rows-per-page footer | https://mobbin.com/screens/751c482f-9ff7-4fec-9a57-db1422cfd3a6 | Filter-as-chip sentences (`Status is Interviewing, Offer ×`) with a `+ Filter` menu and Clear | Readable, removable filters without a heavy builder |
| Twingate | Status filter dropdown with checkboxes + Reset; result count; column-visibility icon | https://mobbin.com/screens/627a0610-5379-49b0-88c3-e64eddbf49ec | Multi-select status filter with Reset; visible result count ("24 applications") | Status is the primary filter; the count confirms the filter worked |
| Hex | Bulk selection bar "3 items selected" with Status popover, Categories, Archive, Trash | https://mobbin.com/screens/6aa08e33-4ae8-4468-a85e-ba367cc78dbe | Floating bulk-action bar: **Set status · Add reminder · Export CSV · Delete** | §4.6 requires bulk edit and CSV export |
| Deel | Filter chips with counts; **Customize columns** side panel with checkboxes (6/21 selected), Reset/Save | https://mobbin.com/screens/6acab441-2244-43e6-a6f8-e4215a179b0b | Column chooser as a side sheet | Many optional fields (salary, source, CV variant, location, remote) |
| Tana | Inline status popover inside a table cell (Inbox / In Progress / Completed / Later with icons + ✓) | https://mobbin.com/screens/7169e4f9-157e-405c-bcc8-9b46d30d4530 | Click/Enter on the status cell opens a small status menu with icons and the current status checked | Fast single-record status change without leaving the table |

### D-4 Record detail + timeline

| App | Screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Attio | Record: breadcrumb **"1 of 1 in Stage → Meeting"** with prev/next, tabs with counts (Activity, Emails 73, Notes…), activity grouped by "This week / June", bundled change "changed Stage and 7 other attributes" with **Hide all changes**, Details/Comments pane | https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775 | Prev/next within the current stage (J/K). Date-grouped activity. **Bundled field changes** with expand/collapse. Right properties pane. | The best fit for a timeline-centred detail. Bundling keeps imports and edits from flooding the timeline. |
| Lightfield | Account: activity rows **"Lightfield set…", "Lightfield updated 9 fields"** (automation as actor), inbound email rendered inline, right Account details with See all sections | https://mobbin.com/screens/edb25210-fb3c-4cd4-8736-85569882b93e | Automation named as the actor in the sentence. Inbound email body inline in the timeline. Right column of sections (Contacts, Meetings, Tasks, Notes) with "See all". | Exactly our mix: status events + emails with snippets + side sections (documents, contacts, interviews, reminders) |
| Pipedrive | Organization: **Focus** block (overdue/upcoming activity) above **History** with filter tabs All / Activities / Notes / Emails / Files / Changelog on a rail | https://mobbin.com/screens/6178b5a8-b478-4aed-99bc-d74b07a68383 | "Up next" block pinned above the history. Timeline type filter tabs. | Separates what needs action now from what happened |
| Calendly | Contact: day-headed timeline ("Today · Friday, July 31"), entry labels "You sent an email / You created a note / You had a meeting" with cards, right Upcoming meetings + Details, toast "Contact updated" | https://mobbin.com/screens/8158ffb0-f197-4691-8149-271f7a1ab997 | Plain-language entry labels with "You" as actor. Upcoming interviews at the top of the right pane. | Clear, calm voice that works well in translation |

### D-5 Calendar

| App | Screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Todoist | Upcoming: month grid + right **Plan** panel ("All-day (next 7 days)", "Time-blocked (next 7 days)"), drag tasks onto the calendar | https://mobbin.com/screens/00fa2808-750c-499a-8bc7-b9d2c4e758cc | Month grid with a right-hand **Next 7 days** agenda split into timed (interviews) and all-day (deadlines, follow-ups) | The agenda answers "what's next"; the grid answers "when" |
| Asana | Week calendar: multi-day bars, timed items, `+ Add task` per day, **"No date (8)"**, Weeks toggle, ‹ Today › | https://mobbin.com/screens/c3a2ce0b-22ad-4bcf-b13e-9bfd5a87e821 | Week view with timed blocks. A "No date" counter for items missing a date. | Interviews are timed; a counter for "interview without a time" prompts completion |
| Height | Calendar view options: Start date / End date mapping, **Show weekends** toggle, footer tray "Tasks without a date" | https://mobbin.com/screens/15f1c205-1475-4335-9418-a3b24a8b697b | Weekend toggle. Undated tray at the bottom. | Job search is weekday-centred; hiding weekends gives interview slots more room |
| Adobe Express | Personal calendar with **Filter by** popover (post types with coloured dots + labels, toggles for suggestions), Week / Month | https://mobbin.com/screens/f90999e7-48e7-4ef5-ad34-c028e0d6c551 | Type filter: Interviews · Deadlines · Follow-ups · Prep reminders, each with dot + label. Toggle for **suggested** reminders. | Separates the user's own events from suggestions, in line with the trust principle |

### D-6 Status model, automation and Undo

| App | Screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Plane | Project states grouped into **Backlog / Unstarted / Started / Completed / Cancelled**, each holding sub-states | https://mobbin.com/screens/5f8e4dfe-71d1-4677-88be-110662209db3 | **Phase groups** over fine statuses: *Shortlist* (Saved, Preparing) · *In progress* (Applied → Offer) · *Closed* (Accepted, Declined, Rejected, Withdrawn, Ghosted) | Gives the board, iPhone sections, filters and Insights one shared grouping without losing the 12 statuses |
| Klaviyo | "Update status" panel: current status ("Live · Current status") on a rail, scheduled change below, confirmation toast | https://mobbin.com/screens/7e468229-0914-4474-9c94-f4fd4ba2c362 | Status history as a mini rail in the status menu | Lets the user see the last transition before changing status again |
| Google Ads | Change history table with **Tool** column (source of change) and per-row note **"Changes can't be undone"** | https://mobbin.com/screens/9d1a56f8-9548-434d-a7c0-4ed5b2ab4a6b | Every change records its **source**. Rows say explicitly whether they can still be undone. | Our timeline rows show source and an Undo button only while reversal is valid; otherwise a quiet explanation |

---

## Examined but rejected

### iOS

| App | mobbin_url | Reason |
|---|---|---|
| Perplexity | https://mobbin.com/screens/88b62263-05ac-4d34-83b0-7678070ad12b | Research-progress log, not a board; unrelated |
| monday.com (empty Kanban column) | https://mobbin.com/screens/8baa25ec-d6f7-4931-bc64-4d24de988dad | A full-screen empty column with no guidance or count; wastes the viewport |
| ClickUp | https://mobbin.com/screens/88fe2f6d-d009-4105-8bae-addf4c6a266f | Empty list with "Add column" chrome; the user-defined-column model doesn't fit fixed statuses |
| Superlist | https://mobbin.com/screens/1170ef8a-898f-4bc7-9520-692397dc056c | Checklist-in-a-document with emoji headers and strike-through; reads as a to-do list, not a pipeline |
| monday.com (deal card) | https://mobbin.com/screens/991ca978-afc2-4835-9792-144369e6e502 | One card fills the screen with form-like fields (Next action, Stage, Deal size…); far too dense for scanning |
| Squarespace | https://mobbin.com/screens/fc6e23fa-132b-442d-9ef7-38c313fdc918 | Purchase funnel chart; belongs to Insights research, not the tracker |
| Asana (portfolio) | https://mobbin.com/screens/2352b9d0-f6cc-4d66-a100-cd3d911cc0bf | Truncated table on iPhone (columns cut off); progress % doesn't apply |
| Deel | https://mobbin.com/screens/416f38cd-f8a4-47a1-a59b-84059aeca847 | Static explainer of hiring steps, not tracking state |
| Insight Timer | https://mobbin.com/screens/53d30bee-4247-413a-ab28-013ea9f3b466 | Time-period tabs over a stats list; no stage concept |
| Revolut | https://mobbin.com/screens/92faa5f2-d0d4-486e-98b1-644862392cfb | Category tabs over promo tiles; decorative, dark |
| bless. | https://mobbin.com/screens/f5747597-d42d-4a00-9b6c-10d9336eab8d | Segmented "want / got / didn't get" with countdown art; playful framing of outcomes clashes with our calm rejection tone |
| Jira Cloud (list) | https://mobbin.com/screens/ea9c75ca-e8fb-4f11-899d-b29c1fd55b30 | Spreadsheet on iPhone truncates status and title; illegible with DE labels |
| monday.com flow "Adding a column" | https://mobbin.com/flows/2d2b255c-93a8-4408-9bd0-8cb321bee8bf | Column builder; our statuses are fixed by the state machine |
| monday.com flow "Searching a column" | https://mobbin.com/flows/08661e5f-d0af-482e-9bd2-a435d6ce9f08 | Column-type catalogue search; irrelevant |
| Meetup | https://mobbin.com/screens/22455735-3298-4be3-8a41-24bfe39990d2 | Threaded social comments; no status events |
| Orb Social | https://mobbin.com/screens/ebdd0883-9922-494a-beab-11935fec27b4 | Social reply feed with reactions; noisy |
| MasterClass | https://mobbin.com/screens/3f997cfa-8542-4c40-9290-abe6c67fe0bb | Community post feed; no timeline semantics |
| Medium (responses) | https://mobbin.com/screens/2d828775-3381-40fe-8ada-eb8040a6464f | Nested comments; not an activity history |
| Citizen | https://mobbin.com/screens/2aff6b6a-4b59-472a-a353-f4982af24c4a | Minimal dot timeline over video; all events look the same, with no type or actor |
| Shopify (store activity log) | https://mobbin.com/screens/85185fd5-b4c9-482a-b2d0-64f1adb982eb | Flat log with no icons, grouping or hierarchy; unscannable |
| Grab | https://mobbin.com/screens/58b89cef-a8e4-4eae-899e-1df26f9fbeb6 | Transaction history with red "Cancelled"; the alarming colour for a negative outcome is what we avoid |
| Starbucks | https://mobbin.com/screens/f1fd2bf7-81a4-4616-b370-f82bbd4ad997 | Single-row order history; too thin to learn from |
| Strava | https://mobbin.com/screens/dd0b1c45-6045-44d5-92f7-9315681fbad8 | Weekly activity dots; a streak-like pattern we avoid (no guilt gamification) |
| KOHO (post top) | https://mobbin.com/screens/d0059572-65f1-4ac7-9671-c48354ec6050 | Duplicate of the kept KOHO activity screen |
| Fiverr (milestones offer) | https://mobbin.com/screens/f806734f-f432-4cd7-8441-560c19e665f8 | Checkout milestones; not record state |
| Opendoor | https://mobbin.com/screens/efcd40bb-716d-4909-8392-1b93429a46bd | Onboarding stepper for a purchase; future-only steps, no history |
| Hers | https://mobbin.com/screens/d82e230b-03ca-471a-87e5-8feeea619210 | Questionnaire progress ("Last stop…"); wizard, not tracking |
| Medium (removed toast) | https://mobbin.com/screens/ed637f28-2d0d-40a6-bb79-b7fe7d8505e8 | Top toast overlaps the nav bar and back button |
| Kitchen Stories | https://mobbin.com/screens/2c766245-5fbd-47db-aaf7-df4a8d37afed | Verbose two-line "successfully removed…" copy; breaks in DE |
| X | https://mobbin.com/screens/ed4a0353-637c-44de-89b8-4b7f681ac94d | Undo as a full-width second row; heavy for a frequent action |
| Rodeo | https://mobbin.com/screens/5d637da3-d14e-41d5-a9d2-06cdf745ffaa | Photo thumbnails inside month cells; decorative |
| Garmin Connect | https://mobbin.com/screens/117b517e-bffb-4b17-b19d-b5b84aeaf6e4 | Full month grid with unlabeled bars on iPhone; no titles, so events are unreadable |
| Givingli | https://mobbin.com/screens/2751fda4-230a-4f42-b3ab-cc2aacc647c8 | Occasion reminder cards with promo banner; not an agenda |
| Mesh | https://mobbin.com/screens/cd90ba9a-a483-4f91-af85-1a61afcc3df1 | Repeated rows showing person + time but no event title |

### Desktop

| App | mobbin_url | Reason |
|---|---|---|
| Bonsai | https://mobbin.com/screens/05bbeb0f-81c3-4695-a3e3-9fa6229a2c29 | 3-column toy board; teaches nothing about many stages |
| Trello (board) | https://mobbin.com/screens/b019519b-d4c1-4184-a1dc-71422b1f4719 | Photo background lowers contrast; short columns give small drop targets |
| Slack Lists | https://mobbin.com/screens/50a69d82-266a-4785-8cfe-7bc829b1c3b2 | Fully tinted column backgrounds per status; too loud for 7+ columns and fails the calm tone |
| Productboard | https://mobbin.com/screens/7e3decaa-0365-40c5-a501-03b97b0b63e4 | Feature/insight-specific card anatomy; cluttered nested items |
| Apollo (board) | https://mobbin.com/screens/e6e1045a-9c10-4578-9bcf-ea3b6c72b0c7 | Cards repeat the stage name and pipeline inside each card; ~8 labelled rows per card, so only 2–3 fit per column |
| Zoho CRM | https://mobbin.com/screens/fb3596aa-f981-487b-996b-b30230e8b771 | Permanent filter sidebar + red/green full-width terminal columns; dense, and red "Closed Lost" is harsh |
| Zendesk Sell | https://mobbin.com/screens/719c5483-f836-4cef-b6cd-da66c60ced13 | Same pattern as HubSpot with weaker hierarchy; filter panel covers the board |
| folk | https://mobbin.com/screens/7f28c06b-8f7c-4ffc-91f8-025d6023aee6 | Marketing hero page, not product UI |
| Obvious flow | https://mobbin.com/flows/2e1e0ac6-857f-455b-b472-bc685f074a25 | Generic drag with no target labelling or count feedback |
| Twenty flow "Reordering items" | https://mobbin.com/flows/4c56a984-2b55-4950-af9c-c9a5c93c6ccb | Very tall cards with 7 empty property rows; the drag preview hides neighbours |
| Wix CMS | https://mobbin.com/screens/32332cb4-9ddd-4466-b74f-c366371b3615 | Spreadsheet gridlines and a CMS frame; too heavy for a personal tracker |
| Airtable (filter builder) | https://mobbin.com/screens/3de03dd6-b397-49fb-9fee-f194f1456e6a | Boolean condition builder; power-user tool, and chips cover our filters |
| Fresha | https://mobbin.com/screens/3b1a8630-7e3d-4e22-aa49-f38180943f60 | Plain table, no filtering or bulk; red "Not completed" pills |
| Confluence (database) | https://mobbin.com/screens/11f896a7-49a7-450c-a31c-cfec4ae6e545 | Rainbow tag colours per column; the visual noise competes with status |
| Twenty (record) | https://mobbin.com/screens/c1b8ca68-1790-4df2-a715-1dea20b4b063 | Left-heavy field panel with a near-empty timeline; Attio covers the field-diff idea better |
| Salesforce | https://mobbin.com/screens/fe7e0ef9-62e6-43d7-8bb6-679f301119c4 | Three crowded columns with a Slack embed; too many competing panes |
| Apollo (deal) | https://mobbin.com/screens/591c4be5-9288-4c2c-a053-c69e213dd25c | Upcoming/Main split repeats Pipedrive's Focus with more chrome; 9 activity tabs |
| Plane (work item) | https://mobbin.com/screens/daa3c99b-2a4c-401e-b804-ab045e23ec37 | Every event (description edits, relations, state) has equal weight; state changes drown |
| Trello (calendar) | https://mobbin.com/screens/c65ff518-5b0e-4e65-8290-dc2b94f30643 | Dark grid with multi-week bars; low density of meaning |
| Airtable (calendar) | https://mobbin.com/screens/3b7d56ed-3ae6-4bb3-8a14-c9aa75b61754 | Titles truncated to ~12 chars by "DUE DATE" chips |
| Amie (calendar) | https://mobbin.com/screens/0f996ad5-82d7-4393-8542-71bed35b234f | 10 calendars of colour-coded noise; we show a few event types only |
| Assembly | https://mobbin.com/screens/da50f7c0-b040-4120-96b2-d7c5393a1424 | Social-post scheduler with platform icons; unrelated semantics |
| Jira (automation audit log) | https://mobbin.com/screens/db56592a-dce5-43c4-a878-79a6cbee918a | Admin audit table (rule IDs, durations); the user needs per-application context, not a global log |
| Cursor | https://mobbin.com/screens/3e49c061-8dc4-4c1e-bb8e-3e4d3162e9fd | Automation run history; developer-facing |
| ClickUp (automation activity) | https://mobbin.com/screens/bf20c520-4b18-4121-8ce2-c7e7f56108f8 | Global run log; same reason as Jira |
| Tailscale | https://mobbin.com/screens/bca90567-a6a8-4e64-8a25-f88ba544639b | Config log table; no undo or record context |
| Confluence (audit legend) | https://mobbin.com/screens/cc682da6-c0ab-4bfc-bbc6-9fbb17f4a01b | 11 machine statuses with a legend; the opposite of plain language |
| Aboard | https://mobbin.com/screens/8c5f9bca-6ac8-4fab-b216-6b058c3a7d21 | Raw attribute-level audit rows (`profile.update`); not user-facing |
| Discord | https://mobbin.com/screens/335d4d28-4d0f-48b8-bdda-43386205bfb0 | Moderator audit list; dark admin context |
| Voicenotes | https://mobbin.com/screens/f026f487-4a95-4625-ba94-84855897032a | Progress modal, not a status toast |
| Square | https://mobbin.com/screens/572692ea-5520-4316-8d46-1a9abdb92b13 | Blocking confirmation modal before a reversible change; we use Undo instead |
| v0 | https://mobbin.com/screens/8cba8a7f-a98b-4824-b603-84d93dba7713 | Error toast only; no Undo pattern |
| Cofounder | https://mobbin.com/screens/4aa868e0-047f-4bd1-9ee2-24ff7ad74bec | "Task restored" toast offers no Undo for a reversible action |
| Framer | https://mobbin.com/screens/33201f3e-6d40-4db8-9553-e686794aa717 | Confirm popover for a status change; adds friction where Undo suffices |

**Pattern-level rejections**

- **Paged single-column board on iPhone** (Jira, Asana): 7 active stages means up to 6 swipes to reach Offer. Page dots don't name stages, and cross-page drag needs edge-hover auto-paging, which is slow and error-prone.
- **Chevron/arrow stage headers** (Pipedrive): the arrow shape implies strictly linear progress, which our backward moves and terminal exits contradict. It also squeezes long DE labels.
- **Red for rejection** (Grab, Zoho, Fresha): conflicts with the gentle-rejection principle. Closed outcomes use neutral tones; only the label carries meaning.
- **Confirmation dialogs for status moves** (Square, Framer): every status move is reversible through an append-only compensating event, so Undo replaces confirmation.

---

## Decision — iOS

**IA.** Tracker tab → nav bar title menu **"Pipeline ▾"** (Attio, Asana view sheet) switches **Pipeline** ↔ **Calendar**. Table is desktop-only; on iPhone, filtering + search on the Pipeline list covers its job. Filter and sort sit bottom-left, a primary **Add** button bottom-right (Asana).

**Pipeline = grouped list, not a column pager.** Linear's and GitHub's iPhone choice: one vertical list with **sticky, collapsible stage sections** (status dot + label + count + chevron). Above it:

1. **Scope tabs:** `Active · Closed · All` (Linear, Vinted). Active = Saved…Offer, grouped by phase (Plane): *Shortlist* (Saved, Preparing) and *In progress* (Applied → Offer). Closed shows outcome chips: Accepted · Declined · Not selected · Withdrawn · Ghosted.
2. **Stage index strip:** horizontally scrolling text tabs with counts (Luma). Tapping one scrolls to its section; empty stages are dimmed (Babbel) but still tappable. The strip also becomes the **drop target row** while dragging (below).

Saved starts collapsed when it has more than 5 items (it's the backlog). Sections with 0 items collapse to a single header line.

**Row anatomy** (one row per application, ≥ 44 pt): company logo/monogram · role (1 line, truncates) · company · trailing meta: days in stage ("12 d") or next date ("Thu 14:00"). A second line appears only when relevant: next action ("Interview Thu 14:00") or a calm staleness hint ("No reply in 9 days"). A small **source glyph** (envelope) marks applications whose last move was automatic. In search/filtered results across stages, rows also show a status pill (Shopify).

**Moving between stages:** three equivalent paths. All are optimistic, and all write an event through `@bfhr/core`.

- **Long-press → context menu → "Move to…" sheet** (monday): all valid stages listed, current stage checked, invalid ones disabled with a reason ("Offer comes before Accepted"). This is the primary path and the accessibility path (VoiceOver custom action "Move to…").
- **Swipe actions:** leading swipe = **"Advance to {next stage}"**. Trailing = **Close…**, which opens an outcome sheet: Not selected / Withdrawn / Ghosted, plus Accepted/Declined only from Offer.
- **Drag:** ~~long-press-lift then drag across section headers (Asana reordering). While lifted, the stage strip pins to the top as drop chips, and a floating label names the destination ("Move to Screening", Obsidian), so long moves don't need scrolling. Haptic tick on target change.~~ Not on iPhone in M0 (decisions.md D32); Move to… and swipe actions remain.

**Undo:** bottom toast above the tab bar (Outlook, My BMW) naming item + destination: **"Acme · moved to Screening · Undo"**, with a countdown ring (Amie). It stays 6 s, extended while VoiceOver focus is on it. Undo writes a compensating event; it never deletes one.

**Automatic changes:** when mail intelligence moves an application while the app is open, the same toast appears with the source: **"Acme · moved to Interviewing from an email · Undo · View"**. It's also listed in the detail timeline (below). Rejection toasts use calm copy (Copy notes).

**Detail (push from row):** header card (Vestiaire, StubHub) with logo, role, company, **status pill (tap = Move to…)**, a one-line "what this means" and **one next action**. Under it, a compact stage progress strip shows past ✓ / current ◉ / future ○ (ShopBack); when exiting to a closed outcome, the strip ends with that outcome. **Suggestion cards** (Wealthfront) appear when due: "No reply in 7 days — send a follow-up?" [Draft follow-up] [Not now]; "No reply in 21 days — mark as ghosted?" [Mark as ghosted] [Keep waiting]. Never automatic. Then: **Timeline** (below), Documents used, Contacts, Interview rounds, Reminders as collapsible sections.

**Timeline (iOS):** day headers (Swarm), a thin rail with type icons (Airwallex), and two weights (GitHub). *System rows* are one line: icon + sentence + time, e.g. "Moved to Screening · You · 10:24". *Content cards* hold inbound/outbound emails (subject + 2-line snippet, tap to expand; Fiverr) and notes. **Automatic rows** name the actor (KOHO "Autopilot" → our **"Mail"** / **"Reminder rule"** actor chip). They show the reason ("Email from recruiter@acme.com: 'Interview invitation'") with a **Source** link to the message and an **Undo** button while this is the latest transition and the reverse move is allowed. Otherwise a quiet line explains why it can't be undone (Google Ads). Sort Newest first by default (KOHO); filter chips All · Status · Emails · Notes.

**Calendar (iOS):** week strip with per-day dots by type, expandable to a month sheet with Today (Structured, Joi). Below it, an agenda grouped by day/month (Joi, Posh) with **Upcoming / Past** (Luma). Event types: Interview (timed), Deadline (all-day), Follow-up and Prep reminders. Each has icon + label, never colour alone. Tap opens the application detail; "Add to Calendar (.ics)" sits on interview rows.

**Rejected for iOS:** paged columns (see Pattern-level rejections); spreadsheet table on iPhone (Jira list).

## Decision — Desktop (macOS + Windows)

**IA and chrome.** Sidebar → Tracker. Toolbar: view segmented control **Board · Table · Calendar** (Programa, Wrike), keys `1`/`2`/`3`. Then the search field (`/`), filter chips + `+ Filter` (Browserbase), sort ("Next action" default; Pipedrive), and **Display** popover (Lightfield/Height: card fields, Hide empty stages, Show closed, Show weekends for Calendar). Filters and display options persist per view on the device.

**Board.**

- **Columns:** the 7 active stages left → right with full-height wells (Programa). Header: dot + label + count, sub-line with oldest age ("oldest 18 d"; Pipedrive). Fixed column width 272 px. At the common 1280–1440 px windows (sidebar 240 px) about 3.5–4.5 columns fit, so the board scrolls **horizontally** with the next column peeking (Wrike). Supported inputs: Shift+wheel, trackpad, and keyboard focus that auto-scrolls the focused column into view.
- **Collapsing:** empty columns auto-collapse to 40 px vertical rails (ClickUp); any column can be collapsed manually from its header (HubSpot ‹). With Saved collapsed and no Offers yet, the typical working set (Preparing → Interviewing) fits without scrolling.
- **Closed rail:** a slim vertical rail at the right edge labelled **Closed** with per-outcome counts (Basecamp "Not now/Done"). Clicking it expands into the five outcome columns; "Show closed" in Display keeps them open. During a drag, the rail expands into five labelled drop zones.
- **Card:** logo · role (2 lines max) · company · one meta line: next action/date, else "12 d in stage". Optional fields come from Display (location/remote, salary, source, CV variant). Calm staleness line ("No reply in 9 days"; HubSpot) and an envelope glyph when the last move was automatic.
- **Selection:** opens the **right detail panel** (Attio side panel) without leaving the board. `Enter` toggles the panel, `⌘/Ctrl+Enter` opens the full page.

**Drag between columns.**

- **While dragging:** the source slot keeps a ghost (Jira). The target column tints across its full height (HubSpot), an outlined placeholder marks the insertion point (Rox), and the target header shows the transition **"Applied → Screening"** (Jira).
- **Invalid targets:** greyed out, with a tooltip reason from `@bfhr/core` (e.g. Accepted/Declined only from Offer).
- **Drop:** counts update optimistically. A bottom-left toast reads **"Acme · moved to Screening · Undo (⌘Z / Ctrl+Z)"**. Dropping onto Closed → outcome opens no dialog; Undo covers mistakes.
- **Keyboard parity:** arrow keys/J-K move focus between cards, H-L between columns. `M` opens "Move to…" (command-palette style list of valid stages). `⌘/Ctrl+Shift+→/←` moves the card one stage forward/back. `⌘/Ctrl+Z` undoes the last move. Screen readers get "Move to…" as the primary affordance, and live-region announcements on move.

**Table.**

- **Columns:** Company, Role, Status (inline status menu with icons, current checked; Tana), Applied on, Last activity, Next action, Source, CV used, Location. Optional columns come from a **Customize columns** side sheet (Deel). Header click sorts; sticky header and first column.
- **Filters:** chip sentences ("Status is Screening, Interviewing ×") with multi-select checkboxes + Reset (Twingate) and a result count ("24 applications"). Presets: Active / Closed / All, matching iOS.
- **Bulk:** row checkboxes (`X` toggles, Shift-click ranges) raise a floating **bulk bar** (Hex) with *Set status · Add reminder · Export CSV · Delete*. Bulk status changes write one event per application and offer a single Undo for the batch. CSV import entry point lives in the toolbar overflow (§4.6).

**Record detail** (right panel and full page share one component; full page adds width). Attio + Lightfield layout:

- **Top bar:** "3 of 12 in Interviewing" with ‹ › (J/K) to walk the current column/filter (Attio).
- **Header:** logo, role, company, **status pill** (opens the status menu with a mini history of the last transitions; Klaviyo), **next action** button (e.g. "Prepare for interview Thu 14:00", "Draft follow-up").
- **Main column:**
  - **Up next** block: next interview, due reminders, suggestion cards (Follow up? / Mark as ghosted?) (Pipedrive Focus, Wealthfront).
  - **Timeline** with filter tabs **All · Status · Emails · Notes · Files** (Pipedrive), grouped by day ("Today · Friday, 23 Oct"; Calendly) or period ("This week"; Attio). Two weights: one-line system rows and cards for emails (subject, snippet, expand inline; Lightfield) and notes. Multiple field edits from one action are **bundled** ("You updated salary and 3 other fields", expandable; Attio). Inline **note composer** at the top of the timeline.
- **Right column:** sections with "See all" (Lightfield): Details (source, applied on, location, salary, link to job), Documents used (CV variant, cover letter), Contacts, Interview rounds, Reminders.

**Automatic status change row** (desktop and iOS share the same content):

> ✉ **Moved to Interviewing** · *Automatic* · 09:12
> From an email by recruiter@acme.com — "Interview invitation for Product Designer"  ·  **View email**  ·  **Undo**

- The actor chip ("Automatic · Mail") is visually distinct from "You" (KOHO, Lightfield).
- **Undo** shows while this event is the application's latest status transition. It writes a compensating event "You undid an automatic change" and marks the mail-intel classification as corrected (feeds the review queue).
- Once superseded, the row shows "Can't undo — status changed since" in muted text (Google Ads).
- Automation-driven **Rejected** uses the same row with calm copy and Undo, because mail classification can be wrong.

**Calendar.**

- **Grid:** Month and Week (Asana, Adobe Express), ‹ Today ›, Show weekends toggle (Height).
- **Agenda panel:** right panel **Next 7 days** split into *Timed* (interviews) and *All-day* (deadlines, follow-ups, prep reminders) (Todoist).
- **Type filter:** popover with dot + label per type and a toggle for **suggested reminders** (Adobe Express).
- **Undated tray:** footer "Interviews without a time (2)" (Height, Asana "No date").
- **Actions:** clicking an event opens the record detail panel. Reminders can be dragged to reschedule; interviews can't, since their times come from the employer and two-way sync is out of scope (§4.11). Interviews get "Export .ics" (single) and "Export all upcoming (.ics)" (§4.6).

**Status colours** (to tokens later): one hue per phase, not per status. *Shortlist* neutral blue-grey, *In progress* brand accent with increasing saturation from Applied to Offer, *Closed* neutral grey for Not selected/Withdrawn/Ghosted, gentle green for Accepted, neutral for Declined. Always dot + text label; contrast ≥ 4.5:1 for labels.

---

## Components needed

| Component | iOS | Desktop | Notes |
|---|---|---|---|
| `StatusPill` (dot + label, interactive variant opens status menu) | ✓ | ✓ | Labels from i18n; phase colour tokens |
| `StatusMenu` / "Move to…" (valid targets from `@bfhr/core`, disabled reasons, mini history) | sheet | popover + palette | One source of transition rules |
| `OutcomeSheet` (Not selected / Withdrawn / Ghosted / Accepted / Declined) | ✓ | drop-zone variant | Accepted/Declined only from Offer |
| `StageIndexStrip` (scrolling tabs with counts, dimmed empty, drop-chip mode) | ✓ | — | |
| `ScopeTabs` (Active / Closed / All) | ✓ | filter preset | |
| `PipelineSection` (sticky collapsible header: dot, label, count, chevron) | ✓ | — | |
| `ApplicationRow` (logo, role, company, meta, optional 2nd line, auto glyph, swipe actions, drag lift) | ✓ | — | |
| `BoardColumn` (header with count + oldest age, collapse to rail, full-height well, drop highlight, transition label) | — | ✓ | |
| `ClosedRail` (vertical, per-outcome counts, expands to drop zones) | — | ✓ | |
| `ApplicationCard` (configurable fields via Display, staleness line, auto glyph, focus ring) | — | ✓ | |
| `DisplayPopover` (card fields, hide empty stages, show closed, show weekends) | — | ✓ | |
| `FilterChips` + `AddFilterMenu` + multi-select checklist + result count | sheet | ✓ | |
| `DataTable` (sticky header/first column, sortable, inline status cell, row selection) | — | ✓ | |
| `ColumnChooserSheet` | — | ✓ | |
| `BulkActionBar` (set status, add reminder, export CSV, delete; batch Undo) | — | ✓ | |
| `RecordHeader` (logo, role, company, status pill, one next action, prev/next "n of N") | ✓ | ✓ | |
| `StageProgressStrip` (past/current/future + closed outcome end) | ✓ | ✓ (header) | |
| `SuggestionCard` (follow-up, ghosted; primary + dismiss) | ✓ | ✓ | Never auto-applies |
| `Timeline` (day groups, rail, type icons, filter tabs, sort) | ✓ | ✓ | |
| `TimelineSystemRow` (one-line, actor chip You/Automatic, bundled changes expand) | ✓ | ✓ | |
| `TimelineAutoRow` (source, reason, View source, Undo / "can't undo" state) | ✓ | ✓ | Writes compensating event |
| `TimelineEmailCard` (direction, subject, snippet, expand) / `TimelineNoteCard` / `NoteComposer` | ✓ | ✓ | |
| `UndoToast` (item + destination, countdown ring, Undo, optional View; a11y live region) | bottom, above tab bar | bottom-left | ⌘Z / Ctrl+Z on desktop |
| `DetailSidePanel` (resizable, Enter toggles) | — | ✓ | Shares content with full page |
| `WeekStrip` + `MonthSheet` + `AgendaList` (Upcoming/Past) | ✓ | — | |
| `CalendarGrid` (month/week, timed + all-day, weekend toggle) + `AgendaPanel` + `UndatedTray` + `EventTypeFilter` | — | ✓ | |
| `IcsExportAction` | ✓ | ✓ | |
| Empty states per stage / per view | ✓ | ✓ | Copy below |

## Copy notes

Tone: calm, specific, no exclamation marks, no streaks or scores. Name what changed and where it came from. Rejection copy acknowledges without dramatising.

**Status labels.** These are proposed display strings; TR/DE need native review. Domain keys stay as in `@bfhr/core`.

| Key | EN | TR | DE | Longest (chars) |
|---|---|---|---|---|
| saved | Saved | Kaydedildi | Gemerkt | 10 |
| preparing | Preparing | Hazırlanıyor | In Vorbereitung | 15 |
| applied | Applied | Başvuruldu | Beworben | 10 |
| acknowledged | Acknowledged | Alındı | Eingang bestätigt | 17 |
| screening | Screening | Ön görüşme | Vorauswahl | 10 |
| interviewing | Interviewing | Mülakat | Vorstellungsgespräch | 20 |
| offer | Offer | Teklif | Angebot | 7 |
| accepted | Accepted | Kabul edildi | Angenommen | 12 |
| declined | Declined | Ben reddettim | Abgelehnt (von mir) | 19 |
| rejected | Not selected | Olumsuz sonuç | Absage | 13 |
| withdrawn | Withdrawn | Geri çekildi | Zurückgezogen | 13 |
| ghosted | No response | Yanıt yok | Keine Rückmeldung | 17 |

Layout implications: DE "Vorstellungsgespräch" (20) must fit a 272 px column header with count, and an iPhone strip tab without truncation. Tabs size to content; headers wrap to 2 lines before truncating. Declined vs Rejected must stay distinguishable in every language ("I declined" vs "they said no").

**Microcopy:**

- **Move toast:** "Acme · moved to Screening" · **Undo**. TR: "Acme · Ön görüşme aşamasına taşındı" · **Geri al**. DE: "Acme · nach Vorauswahl verschoben" · **Rückgängig**.
- **Automatic move toast:** "Acme · moved to Interviewing from an email" · **Undo** · **View**.
- **Auto row reason:** "From an email by {sender}: “{subject}”". **Can't undo:** "Can't undo — the status changed since."
- **Outcome to Not selected (user or automatic):** "Marked as not selected. Your notes and documents stay here." No "Sorry!" and no red.
- **Follow-up suggestion:** "No reply in 7 days. Send a short follow-up?" [Draft follow-up] [Not now].
- **Ghosted suggestion:** "No reply in 21 days. Mark as no response?" [Mark as no response] [Keep waiting]. The user can change the number of days in Settings.
- **Empty pipeline:** "Nothing tracked yet. Save a job or add an application you've already sent." [Add application] [Import CSV].
- **Empty stage (desktop well / iOS section):** blank with count 0; no filler text inside columns (Rox's quiet "No opportunities" is the upper limit → "None yet").
- **Empty Closed:** "Closed applications will appear here."
- **Invalid move tooltip:** "Accepted is available after an offer."
- **Drag label:** "Move to {stage}"; target header "{from} → {to}".
- **Bulk:** "3 selected" · Set status · Add reminder · Export CSV · Delete. Batch toast: "3 applications moved to Applied · Undo".

## Open questions

1. **Display label for `rejected`:** recommend "Not selected" / "Olumsuz sonuç" / "Absage" over "Rejected". Needs user sign-off and native TR/DE review of the full table.
2. **Saved on the Tracker vs Jobs:** should *Saved* applications appear on the Tracker by default, or only once the user starts *Preparing*, with Saved living in Jobs → Saved? This affects default collapse and counts. Coordinate with Jobs research.
3. **Undo window for automatic changes:** proposal is that Undo is available while the automatic event is the latest transition, with no time limit; toast 6 s. Needs confirmation with `@bfhr/core` transition rules (is the reverse of an automatic forward move a user "backward" move? It should be allowed, since only the user triggers it).
4. **Allowed user transitions:** can a user move Saved → Rejected directly, and Accepted/Declined only from Offer? The disabled-target reasons in the UI depend on the final state machine (CoreDomain).
5. **iPhone drag distance:** ~~is the drop-chip strip enough, or should drag be dropped entirely on iPhone in favour of Move to… + swipe?~~ **Resolved (D32):** no drag on iPhone for now; Move to… + swipe. Revisit with real usage in M3.
6. **Calendar on iPhone:** a view inside Tracker (decided here), or should upcoming interviews also surface on Today? Coordinate with Today research to avoid two calendars.
7. **Column width and DE:** confirm 272 px with DE strings in the exploration prototype at 1280 px windows on Windows (125 % scaling).

## M3 additions — iOS (2026-10-23)

Same protocol (Mobbin MCP, `platform: ios`, `mode: deep`, judged from images). Calendar and detail references above (iOS-4, iOS-5, iOS-7) still apply.

### iOS-8 Log an application (add-record form sheet)

Query: "add new record form sheet with company, role, status and date fields" — 8 examined, 4 kept.

| App | Screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Fi | Edit Details: Cancel / Save in the nav bar, grouped fields with labels inside | https://mobbin.com/screens/109a7879-53ee-4e40-a7e9-a560d8cd3da0 | Native sheet with Cancel / Add, grouped form | Familiar, keyboard-friendly, nothing custom to learn |
| Flighty | Add Missing Flight: required fields named in the subtitle, sections with captions, Notes last | https://mobbin.com/screens/55d50e10-56ff-4923-9d33-c06ca2c432e5 | Say what's required in plain text; notes at the end | The disabled Add never needs explaining |
| Public | Employment status chips + employer / job title fields | https://mobbin.com/screens/de69730e-8054-4aa6-9efc-03ed407622e1 | Company and role as the first two fields | They identify the application everywhere else |
| Bevel | "Started on" date row under the choice | https://mobbin.com/screens/eded1c90-3e8b-478c-a188-adab0c388d44 | One date row whose label follows the stage ("Applied on" / "Since") | Suggestions count from it |

Rejected: Jomo (type menu over a half-filled sheet), Life Reset (two add buttons with different meanings), Fuse and Family (single-field contact popups; too small for this form).

### iOS-9 Notification permission explainer

Query: "notification permission explainer screen shown before the system prompt" — 8 examined, 3 kept.

| App | Screen | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Tempo | "Want a reminder when your live classes are about to start?" with the exact timing and a sample notification | https://mobbin.com/screens/28a98c51-2efc-4489-8d14-2f31cd4db383 | Say exactly when we notify; preview the notification | Trust: nothing beyond what the user set |
| Atoms | Sheet with a sample notification card, Allow Notifications / Maybe later | https://mobbin.com/screens/10e80f9a-ea1d-4c26-9f5a-54e5e48fac34 | Sheet over the context, primary + calm secondary | Asked in context, not at launch |
| Babbel | "You can always turn them off in Settings", Remind me / Maybe later | https://mobbin.com/screens/6822290a-66cc-4897-a4cf-c265bab0f9d2 | The way back is stated | Calm, no pressure |

Rejected: Ladder, Gymshark (marketing all-caps), BeReal (fake system prompt), Chick-fil-A (red), Particle (digest promo over content).

**Decision (iOS, M3):** Log an application is a native form sheet (company, role, location; stage, date, applied via; notes) with visible labels above the fields; the explainer is a medium sheet shown once, the first time a reminder is set, previewing that reminder (decisions.md D33). Calendar is the dated agenda (D34).
