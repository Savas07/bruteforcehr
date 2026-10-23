# Tracker reminders · desktop · accessibility

## Accessibility Audit: Tracker reminders (suggestion card, your reminder, prep notifications switch)
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23 | **Method:** `skill://accessibility-review`: axe-core 4 (WCAG 2.1 A + AA tags) on 20 states × light/dark × WebKit (macOS persona) / Chromium (Windows persona), driven by a throwaway Playwright script against the design build (deleted afterwards; the permission states use a stub of the Tauri shell so `useInterviewReminderSetting` runs its real paths); keyboard and focus probes; accessibility tree (`ariaSnapshot`); contrast from the design tokens. Critique rounds: `r1.md`, `r2.md`.

### axe summaries

Before the fixes, the only failing state was the open snooze menu:

```
a11y rem-snooze-menu-light-webkit: 0 critical · 9 serious · 0 moderate · 0 minor · 4 needs review (aria-hidden-focus×2, color-contrast×2) VIOLATIONS aria-hidden-focus(serious)×9
```

After the fixes (all 80 reports, `artifacts/a11y/desktop/scratch/rem-*.json`):

```
a11y rem-followup-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 2 needs review
a11y rem-followup-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 1 needs review
a11y rem-noresponse-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 2 needs review
a11y rem-noresponse-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 1 needs review
a11y rem-snooze-menu-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y rem-snooze-menu-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 2 needs review
a11y rem-snoozed-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y rem-snoozed-noresponse-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 1 needs review
a11y rem-pick-date-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 13 needs review
a11y rem-pick-date-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 12 needs review
a11y rem-keep-waiting-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 4 needs review
a11y rem-none-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 2 needs review
a11y rem-reminder-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y rem-editor-new-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 2 needs review
a11y rem-editor-change-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y rem-editor-empty-text-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y rem-editor-date-picked-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 1 needs review
a11y rem-overdue-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 4 needs review
a11y rem-removed-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y rem-toggle-unsupported-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y rem-toggle-default-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y rem-toggle-accept-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y rem-toggle-granted-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y rem-toggle-denied-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y rem-toggle-denied-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
```

The other 55 reports read the same: 0 critical · 0 serious · 0 moderate · 0 minor, 1–13 needs review.

Needs review, checked by hand:
- `color-contrast` on `Keycaps` `<kbd>` chips (⌘ / Ctrl, Z, the menu's 1–4) and the `→` between status pills: symbol-only content; `fg-secondary` on `surface-sunken` is 6.93:1 / 8.87:1.
- `aria-hidden-focus` ×11 with the date dialog open: axe's `focusable-modal-open` check on Radix's focus guards and the app behind the modal; focus is in the dialog (probe: `focus=INPUT date inDialog=true`).
- `aria-valid-attr-value` on the open snooze trigger: `aria-controls` names the portalled menu; the menu exists while `aria-expanded="true"`.

### Summary
**Issues found:** 7 | **Critical:** 0 open (1 fixed) | **Major:** 0 open (4 fixed) | **Minor:** 2 logged

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Overdue reminder is grey "Was due 20 Oct, 17:00", never red. | 1.4.1 Use of Color | — | Pass: the words carry the state. |
| 2 | The switch's on/off is colour + thumb position. | 1.4.1 / 1.4.11 | — | Pass: `role="switch"` with `aria-checked`; off track `line-control` 3.76:1 / 3.96:1, on track `accent-solid` 6.51:1 / 3.84:1 against the page. |
| 3 | WebKit paints an empty time field with the current time in grey, next to "Without a time, it's 09:00." | 1.3.1 / 3.3.2 | 🟡 Major | **Fixed:** picking a day fills an empty Time with 09:00. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | WebKit: "Pick a date…" opened the dialog with focus left on the Snooze button behind the scrim; Esc didn't close it. | 2.1.1 Keyboard / 2.4.3 Focus Order | 🔴 Critical | **Fixed:** shared `SnoozeMenu` opens the date dialog after the menu has returned focus; `SnoozeDateDialog` returns focus to its opener. Both engines: focus in the date field, Esc → "Snooze". |
| 2 | Answers, snooze, Show now and `D` dropped focus to `<body>` (14/14 probes). | 2.4.3 Focus Order | 🟡 Major | **Fixed:** focus goes to Show now / the card's first answer / the page title (side panel: the panel). |
| 3 | The inline editor (Save, Cancel, Esc) and Remove dropped focus to `<body>`. | 2.4.3 Focus Order | 🟡 Major | **Fixed:** focus returns to Change / Set a reminder. |
| 4 | Denied: the alert asked to "switch this on again" while the switch was disabled. | 2.1.1 Keyboard / 3.3.2 | 🟡 Major | **Fixed:** the switch stays enabled when denied and asks again. |
| 5 | After an answer the page title takes focus without a visible ring (`tabIndex=-1`). | 2.4.7 Focus Visible | 🟢 Minor | Log: same as Today; the title isn't an interactive control, the next Tab continues from it. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Save reminder is disabled with a reason: the button stays focusable (`aria-disabled`) and its accessible name carries the reason ("Save reminder Write what to do first."), shown as a tooltip on hover/focus; a bad date shows "Choose a valid date." under the field as its description. | 3.3.1 / 3.3.2 | — | Pass. |
| 2 | The denied alert names the OS path per platform; unsupported says "Notifications need the BruteForceHR desktop app." Both describe the switch. | 3.3.2 | — | Pass. |
| 3 | "Pick a date…" body doesn't say the time (09:00) the suggestion returns. | 3.3.2 | 🟢 Minor | Log (copy). |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | With the snooze menu open, Radix's modal menu set `aria-hidden` on the app while it held tabbable controls (axe serious ×9). | 4.1.2 Name, Role, Value | 🟡 Major | **Fixed:** `modal={false}` on the shared `SnoozeMenu`. |

### Color Contrast Check
Token values from `packages/ui-tokens/dist/tokens.css` (light / dark).

| Element | Foreground | Background | Ratio (light / dark) | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Card question, reminder text | `fg-primary` #161A22 / #ECEEF2 | `surface-base` #FFFFFF / #16191F | 17.43 / 15.15 | 4.5:1 | ✅ |
| Snoozed line, prep rule, "Your reminder" | `fg-secondary` #4B5261 / #A8AFBB | `surface-base` | 7.84 / 7.98 | 4.5:1 | ✅ |
| "Not needed", "Keep waiting", "Show now", "Change", "Remove" | `accent-text` #1F635D / #43BEB4 | `surface-base` / `surface-sunken` | 7.00 / 7.76 · 6.18 / 8.64 | 4.5:1 | ✅ |
| "Due Wednesday, 17:00" / "Was due …" | `fg-secondary` | `surface-sunken` #EFF1F4 / #0A0C0F | 6.93 / 8.87 | 4.5:1 | ✅ |
| "Notifications need the BruteForceHR desktop app." | `fg-tertiary` #5E6573 / #8F97A4 | `surface-base` | 5.86 / 5.98 | 4.5:1 | ✅ |
| Denied alert title and body | `warning-text` #9C5D00 / #C18C4C | `warning-subtle` #FFEDD7 / #34220B | 4.61 / 5.16 | 4.5:1 | ✅ |
| Date dialog text | `fg-primary` / `fg-secondary` | `surface-elevated` #FFFFFF / #1E2229 | 17.43 / 13.74 · 7.84 / 7.23 | 4.5:1 | ✅ |
| Save reminder / Snooze (primary) label | `fg-on-accent` #FFFFFF | `accent-solid` #216863 / #2B827B | 6.51 / 4.58 | 4.5:1 | ✅ |
| Switch track off, field borders | `line-control` #7D8492 / #707887 | `surface-base` | 3.76 / 3.96 | 3:1 | ✅ |
| Switch track on | `accent-solid` | `surface-base` | 6.51 / 3.84 | 3:1 | ✅ |

### Keyboard Navigation

| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|------------|
| Card: primary answer (I followed up / Mark as no response) | first in Up next | Answers; focus → page title | — | — |
| Card: decline (Not needed / Keep waiting), also `D` | next | Answers; focus → page title | — | — |
| Card: Snooze (clock), also `H` | next | Opens Later today · Tomorrow · Next week · Pick a date… (focus on Later today; `1`–`4` pick) | Closes the menu, focus → Snooze | Up/Down through the presets; Tab stays in the menu |
| Snoozed line: Show now | replaces the card | Brings the card back; focus → I followed up | — | — |
| Date dialog (Pick a date…) | Date → Cancel → Snooze | Snooze (disabled with reason until a day ≥ tomorrow) | Closes, focus → Snooze | Native date field |
| Reminder line: Change, Remove (or Set a reminder) | in Reminders | Opens the inline editor (focus in What to do) / removes (focus → Set a reminder) | — | — |
| Inline editor: What to do → Date → Time → Cancel → Save reminder | in the editor | Save (Enter in a field submits) | Cancels, focus → Change / Set a reminder; the page stays | Native date/time fields |
| Prep switch | after the reminder | Toggles (asks the OS the first time; when denied, asks again) | — | — |

Measured after the fixes (WebKit and Chromium identical): `H` → menu focus "Later today", Tab → still "Later today", Esc → "Snooze"; `H` `4` → focus in the date field, Esc → "Snooze"; `H` `2` → "Show now"; Enter on Show now → "I followed up"; `D` → title; Save → "Change"; Remove → "Set a reminder"; Esc in the editor → "Set a reminder", URL unchanged.

### Screen Reader
From the accessibility tree (`artifacts/a11y/desktop/scratch/rem-*.aria.yml`).

| Element | Announced As | Issue |
|---------|-------------|-------|
| Follow-up card | region "Up next" › article "Applied 9 days ago · no reply yet" (heading level 3), buttons "I followed up", "Not needed", "Snooze" | — |
| No-response card | article "No reply in 26 days. Mark as no response?", buttons "Mark as no response", "Keep waiting", "Snooze" | — |
| Snooze menu | menu "Snooze until": "Later today", "Tomorrow", "Next week", "Pick a date…" | — |
| Snoozed | "Follow-up suggestion snoozed until Tomorrow, 09:00", button "Show now"; no-response: "No-response suggestion snoozed until Monday, 09:00" | — |
| Date dialog | dialog "Snooze until…", description "The suggestion for Quill Docs comes back on this date.", field "Date" | — |
| None | heading "Your reminder", "No reminder for this application. Set one to see it on Today under Deadlines.", button "Set a reminder" | — |
| Reminder | "Hiring manager interview", time "Due Wednesday, 17:00" (overdue: "Was due 20 Oct, 17:00"), buttons "Change", "Remove" | — |
| Editor | form "Edit reminder": textbox "What to do", textbox "Date (optional)", textbox "Time (optional)" (described by "Without a time, it's 09:00."), buttons "Cancel", "Save reminder" | — |
| Switch | switch "Interview prep reminders on this computer", described by the rule; checked when on; disabled only when unsupported (described by "Notifications need the BruteForceHR desktop app."); when denied, enabled and followed by status "Notifications are turned off for BruteForceHR …" | — |
| Toasts | "Snoozed until tomorrow · Quill Docs", "Still waiting · Kiez Health", "Reminder set · Halden Freight", "Reminder removed · Brightwave", each with Undo, in region "Notifications (F6)" | — |

### Priority Fixes
1. **Pick a date… in WebKit** — fixed; it blocked keyboard users of the macOS app.
2. **Focus after every card / reminder action** — fixed.
3. **Usable denied switch, visible 09:00, non-modal snooze menu** — fixed.

Not covered: real VoiceOver / NVDA in the Tauri app, and real OS permission prompts (the states come from a stub of the notification plugin; the denied-after-restart behaviour is noted in `r1.md`).
