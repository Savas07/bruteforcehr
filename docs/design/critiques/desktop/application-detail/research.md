# Application detail · desktop · Mobbin research

- **Screen:** full-page application detail (`/tracker/applications/$applicationId`) and the side panel that shares its model (BRIEF §4.6, research/tracker.md "Record detail").
- **Method:** Mobbin MCP `search_screens`, platform `web`, `mode: "deep"`, `task_intent` "Design a cross-platform job search, CV builder and application tracker app", `output_destination` "code". Judged from the returned images. 12 candidates examined, 7 kept. The tracker research (research/tracker.md D-4) already holds Attio, Lightfield, Pipedrive and Calendly for the record layout; this round re-checked them and added the interview-scheduling editor.

## Query 1 — "record detail page with activity timeline, contacts and upcoming meetings side column"

| App | mobbin_url | Verdict | What we take / why not |
|---|---|---|---|
| Calendly · Contact | https://mobbin.com/screens/8158ffb0-f197-4691-8149-271f7a1ab997 | **Kept** | Day-headed timeline with plain "You sent an email / You created a note" labels in the main column; right column with **Upcoming meetings** on top and **Details** below; "← Contacts" back link above the name. → Our back link, interview rounds at the top of the right column, plain-language timeline rows. |
| Lightfield · Account | https://mobbin.com/screens/edb25210-fb3c-4cd4-8736-85569882b93e | **Kept** | Automation named as the actor ("Lightfield updated 9 fields"), right column of sections (Contacts, Meetings, Tasks, Notes) with "See all" and quiet "No contacts" empties. → Our side column of sections with one-line calm empty states; "Automatic · Mail" actor tag. |
| Pipedrive · Organization | https://mobbin.com/screens/6178b5a8-b478-4aed-99bc-d74b07a68383 | **Kept** | **Focus** block (what needs action) pinned above **History**; inline note composer. → Our "Up next" (suggestion card) above the timeline, composer at the top of the timeline. |
| Salesforce · Contact | https://mobbin.com/screens/f233d9b9-bfcc-41f0-a498-a367cf5160b7 | Rejected | Three dense columns, coloured activity-type icons and filter chips: too much chrome for one application. Kept only the idea "Upcoming & Overdue" above the history (already from Pipedrive). |
| Zoho CRM · Contact timeline | https://mobbin.com/screens/e1a5b857-6011-49b4-87a8-5e8f0ae53cf2 | Rejected | Related-list rail + tabbed timeline hides most content behind tabs; empty timeline wastes the page. |
| HubSpot · Contact | https://mobbin.com/screens/344a79cd-4663-471c-b710-dd920abd0718 | Rejected | Activity tabs + logged-call form + AI summary column: three competing focal points; the left "About" rail duplicates fields. |

## Query 2 — "schedule meeting form with date, time, duration and time zone picker"

| App | mobbin_url | Verdict | What we take / why not |
|---|---|---|---|
| Zoom · Schedule meeting | https://mobbin.com/screens/803f494a-c215-4772-bac0-102cc444c067 | **Kept** | One form: topic, when (date + time), duration, **Time zone** select, attendees. → Our round editor field order: kind/title, date + start + duration on one row, time zone below, then people. |
| Microsoft Teams · New meeting | https://mobbin.com/screens/30fee836-a300-491a-b003-1aa65414322c | **Kept** | Time zone stated at the top of the editor ("Time zone: (UTC-08:00) Pacific Time"), location field, free-text body. → Our hint under the zone ("The date and time are in this zone. Use the one from the invitation.") and the prep-notes area. |
| Upwork · Schedule a meeting | https://mobbin.com/screens/6e11bc43-c1d6-4688-9c0c-b2f747abbf40 | **Kept** | Organiser's zone shown next to the other party's ("2:16 PM GMT+8 (2 h ahead)"). → Our two-zone line on each round: the user's time first, "10:00–10:45 New York time" under it when they differ. |
| Dialpad · Schedule a meeting | https://mobbin.com/screens/a9dbeaf9-ba6c-4be7-b465-1fda45136f1a | Rejected | Icon-only field labels over a photo background: unlabeled inputs fail 3.3.2. |
| Riverside · New session | https://mobbin.com/screens/726cb21e-7e55-41c5-9a23-48abbd49518a | Rejected | Placeholder-as-label and a long GMT-offset dropdown; good start–end pair but no explicit duration. |
| Bonsai · Booking page | https://mobbin.com/screens/cf7017df-f48d-4014-83d3-9537733997a2 | Rejected | Invitee-side slot picker (calendar + slots): the user here records a time the employer already set, so free-text date/time fields beat slot grids. |

## Decisions carried into the build

1. Layout (Calendly + Lightfield + Pipedrive): header with back link, status, one next action and the stage strip; main column **Up next → Timeline**; side column **Interview rounds → Reminders → Documents used → Contacts → Notes → Application**.
2. Interview rounds (Zoom + Teams + Upwork): dialog editor; date, start, duration in one row; searchable IANA zone defaulting to the user's; the organiser's time under the user's when they differ; `.ics` per round and for all rounds.
3. Every automatic row names its actor and reason and keeps Undo (D11), as in Lightfield.
