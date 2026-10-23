# Tracker reminders · desktop · Mobbin research

- **Scope:** the reminder surfaces of the application detail (and its side panel): the follow-up / no-response suggestion card (D15, D19), the user's own reminder (`nextAction` + `nextActionAt`, listed on Today › Deadlines) and the device toggle "Interview prep reminders on this computer" (evening before 18:00, an hour before, quiet 22:00–08:00).
- **Method:** Mobbin MCP `search_screens`, platform `web`, `mode: "deep"`, `task_intent` "Design a cross-platform job search, CV builder and application tracker app", `output_destination` "code". Judged from the images. 11 candidates examined, 6 kept.

## Query 1 — "suggestion card with snooze and dismiss actions on a record page"

| App | mobbin_url | Verdict | What we take / why not |
|---|---|---|---|
| Workable · Candidate | https://mobbin.com/screens/32e629a6-5300-49a5-b02f-adbabff3f70b | **Kept** | Snooze popover on the record with preset durations and "Choose a specific date"; a "Next up" card in the right rail. → Our "Later" = shared `SnoozeMenu` (Later today · Tomorrow · Next week · Pick a date…) on the card, and the "Up next" heading. |
| Charma · Snooze until specific date | https://mobbin.com/screens/f1fb51d5-cc39-4ee8-8ac2-88bca5d9b661 | **Kept** | Small modal: one sentence on what happens ("It will reappear on the date you specify"), one date field, Cancel / Save. → Our "Pick a date…" dialog body: "The suggestion for {company} comes back on this date." |
| Plane · Intake snooze | https://mobbin.com/screens/7bb8e601-b621-44db-82e7-a31b0f84b5d1 | **Kept** | Accept / Decline on the item plus a date picker modal for snooze. → The two-answer card (primary + decline verb) with snooze as a third, quieter way out. |
| Hers · Snooze next refill | https://mobbin.com/screens/6844807c-e7b6-4763-a0e7-acdf53cdfff1 | Rejected | Confirmation modal for a snooze: one step too many; our snooze applies at once with Undo. |
| mymind · Serendipity | https://mobbin.com/screens/0361886a-4368-4f6b-9a75-104fee349d49 | Rejected | Forget / Keep game over a full-screen card: playful tone, not for a stressed job seeker. |
| Craft · Reminders | https://mobbin.com/screens/e561d971-2223-4782-9010-b1852bae42f2 | Rejected | Red "Overdue since…" lines: urgency by colour conflicts with our calm rule (time never turns red). Kept the row menu idea (Mark as resolved / Reschedule / Remove) as "Change / Remove". |

## Query 2 — "reminder settings with notification permission toggle and explanation"

| App | mobbin_url | Verdict | What we take / why not |
|---|---|---|---|
| Todoist · Reminders settings | https://mobbin.com/screens/faf03daf-a266-45f7-a034-99c6287491e1 | **Kept** | Plain sentence of what reminders do + **"Reminders not working?"** with OS steps (device settings, Do Not Disturb). → Our toggle's rule sentence and the denied state naming the exact OS path. |
| PayPal · Auto reminders | https://mobbin.com/screens/85b7843d-5e6a-45e9-8989-761ae7e8659d | **Kept** | Toggle row with the rule spelled out under the title ("We'll email … 2 day(s) before the due date"). → Title + one-line rule under it, switch on the right. |
| Deel · Notifications | https://mobbin.com/screens/f31abe66-b620-4f8b-89ae-9d7395320dc7 | **Kept** | Disabled channel row explains the prerequisite ("you need to install the Deel app on your device and ensure that notifications are enabled"). → Our unsupported / denied lines instead of a silently dead switch. |
| Salesforce · Activity reminders | https://mobbin.com/screens/aee5294b-d252-4f08-bd4b-5b583c69fb25 | Rejected | Checkbox list with numeric selects and Save: settings-page density for a single on/off. |
| Uxcel · Reminders | https://mobbin.com/screens/f21933ec-5d3f-469d-8c3a-4ffc101c2a9e | Rejected | Channel icon matrix and streak updates: gamified, too many channels. |

## Decisions carried into the build

1. The suggestion card stays the shared `NudgeCard` (one primary answer, the decline verb with `D`, snooze with `H`); on the application's own page it drops the repeated company line (`hideApplication`).
2. A snoozed suggestion leaves a dashed one-liner "Follow-up suggestion snoozed until {date}" with **Show now**, so the user can see that it exists and bring it back (Workable "Next up").
3. The user's reminder is one line with Change / Remove and an inline editor (what · date · time), Undo on every change.
4. The device toggle reads like PayPal/Todoist: title, the rule in one sentence, then the OS hint when blocked (Todoist "Reminders not working?", Deel).
