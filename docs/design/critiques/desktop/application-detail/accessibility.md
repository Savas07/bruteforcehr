# Application detail · desktop · accessibility

## Accessibility Audit: Application detail (full page)
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23 | **Method:** `skill://accessibility-review`: axe-core 4 (WCAG 2.1 A + AA tags) through the capture harness on the full state matrix, plus a throwaway Playwright script on interaction states (menus and dialogs open, editors, permission states), a keyboard probe (open with the key or Enter, Tab, Esc, record focus), a Tab walk and the accessibility tree (`ariaSnapshot`) in WebKit (macOS persona, WKWebView engine) and Chromium (Windows persona, WebView2 engine). Contrast computed from the design tokens.

### axe summaries

Final harness run, `pnpm --filter @bfhr/desktop capture:design application-detail --axe --themes light,dark --engines webkit,chromium --states populated,empty,loading,error,offline` (after the r2 fixes):

```
a11y application-detail-populated-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y application-detail-empty-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 1 needs review
a11y application-detail-loading-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 1 needs review
a11y application-detail-error-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 1 needs review
a11y application-detail-offline-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y application-detail-populated-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y application-detail-empty-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 1 needs review
a11y application-detail-loading-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 1 needs review
a11y application-detail-error-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 1 needs review
a11y application-detail-offline-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y application-detail-populated-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y application-detail-empty-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 0 needs review
a11y application-detail-loading-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 0 needs review
a11y application-detail-error-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 0 needs review
a11y application-detail-offline-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 2 needs review
a11y application-detail-populated-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review
a11y application-detail-empty-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 0 needs review
a11y application-detail-loading-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 0 needs review
a11y application-detail-error-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 0 needs review
a11y application-detail-offline-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 2 needs review
20 axe reports in artifacts/a11y/desktop
```

Interaction states (scratch, `artifacts/a11y/desktop/scratch/*.json`, light + dark × WebKit + Chromium), for example:

```
a11y ad-followup-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 2 needs review (color-contrast×2)
a11y ad-closed-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 4 needs review (color-contrast×4)
a11y ad-prepare-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 14 needs review (aria-hidden-focus×11, color-contrast×3)
a11y ad-documents-dialog-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 12 needs review (aria-hidden-focus×11, color-contrast×1)
a11y ad-contact-dialog-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 14 needs review (aria-hidden-focus×11, color-contrast×3)
a11y ad-delete-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 14 needs review (aria-hidden-focus×11, color-contrast×3)
a11y rem-snooze-menu-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 3 needs review (aria-valid-attr-value×1, color-contrast×2)
a11y ad-bottom-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 2 needs review (color-contrast×2)
```

All 112 scratch reports plus the re-runs after the r2 fixes: 0 critical, 0 serious. Before the fixes, an open menu gave `0 critical · 9 serious … VIOLATIONS aria-hidden-focus(serious)×9` (now 0, see Robust #1).

Needs review, checked by hand:
- `color-contrast` on the shared `Keycaps` `<kbd>` chips (⌘, ↩, "esc") and the `→` between status pills: symbol-only content axe can't rate; `fg-secondary` on `surface-sunken` is 6.93:1 (light) / 8.87:1 (dark).
- `aria-hidden-focus` (×11) while a dialog is open: axe's `focusable-modal-open` check on Radix's focus guards and the app behind the modal; focus is trapped in the dialog, nothing hidden is reachable.
- `aria-valid-attr-value` on the open snooze trigger: `aria-controls` points at the menu, which lives in a portal axe resolves late; the menu exists while the trigger says `aria-expanded="true"`.

### Summary
**Issues found:** 6 | **Critical:** 0 | **Major:** 0 open (3 fixed) | **Minor:** 3 logged

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Documents used nested `<dt>`/`<dd>` inside an extra `<div>` with the icon (r1 axe: definition-list ×1, dlitem ×4, serious). | 1.3.1 Info and Relationships | 🟡 Major | **Fixed in r1** (icon inside `<dt>`, one `<div>` per group); 0 serious in all 20 reports. |
| 2 | The stage strip's state is visual (tick, filled dot). | 1.3.1 / 1.4.1 | — | Pass: `list "Stages"` with "Saved, done" … "Interviewing, current", plus the paragraph "Stage 6 of 7: Interviewing" (closed: "Closed as Not selected after Screening"). |
| 3 | Reminder due / overdue: "Was due 20 Oct, 17:00" never turns red. | 1.4.1 Use of Color | — | Pass: the words carry the state. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Focus fell to `<body>` after closing Add/Edit round, Add/Edit contact, Change CV, Delete and the inline reminder editor. | 2.4.3 Focus Order | 🟡 Major | **Fixed (r2):** `FormDialog` returns focus to its opener; Delete returns to More actions; the reminder editor returns to Change / Set a reminder. Re-probed in both engines (table below). |
| 2 | Every shortcut is a single key or Mod combination, active only on this page, listed in the shortcuts sheet, and ignored while typing in a field (Mod+Enter has `inTextFields: false`). | 2.1.4 Character Key Shortcuts | — | Pass. |
| 3 | Small icon buttons in cards (24 px: Add to calendar, Edit, Delete round; Copy email, Edit, Unlink contact). | 2.5.5 Target Size (AAA) | 🟢 Minor | Log: desktop pointer targets; 24 px meets WCAG 2.2 2.5.8 (AA) and the desktop system minimum. |
| 4 | Two "View source" buttons in the timeline share one name; the "Undo" buttons too. | 2.4.6 Headings and Labels | 🟢 Minor | Log for the shared `TimelineRow`: names are unique within their list item (VoiceOver reads the row first); a contextual name ("View source of Moved to Interviewing") would help the rotor. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Forms say what is wrong: "Choose the start time.", "Paste the full link, starting with https://", "Write what to do first."; disabled Save buttons stay focusable (`aria-disabled`) and carry the reason in their accessible name ("Add note Write the note first."). | 3.3.1 / 3.3.2 | — | Pass. |
| 2 | Native date/time fields render in the OS locale (WebKit shows 10/28/2026 in an en-GB page). | 3.1.2 | 🟢 Minor | Log: the webview follows the user's system setting. |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | With a menu open (Move to… `M`, More actions, Later `H`), Radix's modal menu marked the app `aria-hidden` while it held tabbable controls (axe `aria-hidden-focus`, serious ×9). | 4.1.2 Name, Role, Value | 🟡 Major | **Fixed (r2):** `modal={false}` on `SnoozeMenu`, `InteractiveStatusPill` and the More menu (APG menu button: Tab stays inside the Radix menu, Esc / outside click close it, focus returns to the trigger). 0 serious with menus open. |
| 2 | The status pill announces its role and action: `button "Status: Interviewing, changes status"`; the switch is `switch "Interview prep reminders on this computer"` with the rule as its description. | 4.1.2 | — | Pass. |

### Color Contrast Check
Token values (`packages/ui-tokens/dist/tokens.css`), ratios computed per WCAG relative luminance.

| Element | Foreground | Background | Ratio (light / dark) | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Title, body, section titles | `fg-primary` #161A22 / #ECEEF2 | `surface-base` #FFFFFF / #16191F | 17.43 / 15.15 | 4.5:1 | ✅ |
| "2 days in Interviewing", meta lines, field labels | `fg-secondary` #4B5261 / #A8AFBB | `surface-base` | 7.84 / 7.98 | 4.5:1 | ✅ |
| "Not recorded", "Not yet", unsupported note | `fg-tertiary` #5E6573 / #8F97A4 | `surface-base` | 5.86 / 5.98 | 4.5:1 | ✅ |
| Links and plain buttons ("Open meeting link", "View source", "Change") | `accent-text` #1F635D / #43BEB4 | `surface-base` | 7.00 / 7.76 | 4.5:1 | ✅ |
| "Change" / "Remove" on the reminder line | `accent-text` | `surface-sunken` #EFF1F4 / #0A0C0F | 6.18 / 8.64 | 4.5:1 | ✅ |
| "Due Wednesday, 17:00" on the reminder line | `fg-secondary` | `surface-sunken` | 6.93 / 8.87 | 4.5:1 | ✅ |
| Primary button label | `fg-on-accent` #FFFFFF | `accent-solid` #216863 / #2B827B | 6.51 / 4.58 | 4.5:1 | ✅ |
| Dialog text | `fg-primary` / `fg-secondary` | `surface-elevated` #FFFFFF / #1E2229 | 17.43 / 13.74 · 7.84 / 7.23 | 4.5:1 | ✅ |
| Field borders, switch track (off) | `line-control` #7D8492 / #707887 | `surface-base` | 3.76 / 3.96 | 3:1 (1.4.11) | ✅ |
| Switch track (on) | `accent-solid` | `surface-base` | 6.51 / 3.84 | 3:1 | ✅ |
| Denied alert text | `warning-text` #9C5D00 / #C18C4C | `warning-subtle` #FFEDD7 / #34220B | 4.61 / 5.16 | 4.5:1 | ✅ |

### Keyboard Navigation

Page keys (group "Application" in the shortcuts sheet; tooltips show them):

| Key | Action |
|-----|--------|
| Esc | Back to Tracker (closes the open menu / dialog / editor first) |
| M | Move to… (status menu) |
| H | Later: snooze menu on the suggestion (only while a suggestion is due) |
| D | Not needed / Keep waiting (only while a suggestion is due) |
| N | Focus the note composer |
| ⌘↩ / Ctrl+Enter | The next action (Prepare for … → round editor with focus in Prep notes; Add interview round; Set / Change reminder) |
| ⌘S / Ctrl+S | Save notes |
| 1–4 (menu open) | Later today · Tomorrow · Next week · Pick a date… |

| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|------------|
| Back to Tracker | 1 | Navigates | Same as Esc | — |
| Status pill | 2 | Opens Move to… (focus on first item) | Closes, focus back on the pill | Move through statuses (Accepted / Declined disabled with reason) |
| Open posting · next action · More actions | 3–5 | Act / open the menu | Menu closes onto its trigger | Menu items |
| Suggestion card: primary, decline, Later | after the header | Answer / open snooze menu | Menu closes onto "Snooze" | Menu items; 1–4 pick |
| Note composer, Add note | then | Add note | — | — |
| Timeline Undo / View source | in event order | Undo / open source | — | — |
| Interview rounds: Export all, Add round, per round Add to calendar · Edit · Delete · Open meeting link | side column, top | Open dialog / save file | Dialog closes onto the button that opened it | Native selects |
| Reminders: Change · Remove (or Set a reminder), prep switch | then | Inline editor (focus in "What to do") / toggle | Editor closes onto Change / Set a reminder | — |
| Documents: CV link, Change CV | then | Open in CVs / dialog | Dialog closes onto Change CV | — |
| Contacts: Link existing, Add contact, per contact Copy · link · Edit · Unlink | then | Popover / dialog / copy | Closes onto the trigger | Combobox list |
| Notes field | last | — | — | — |

Measured Tab walk, Chromium, Brightwave: Back to Tracker → Status → Open posting → Prepare for Hiring manager interview → More actions → Add a note → Add note → Undo → View source → View source → Export all rounds → Add round → Add to calendar (.ics) → Edit Hiring manager interview → Delete Hiring manager interview → Open meeting link → Change → Remove → Base CV — English → Link existing → Add contact → Copy marcus@brightwave.io → Blog (opens in your browser) → Edit Marcus Reid → Unlink Marcus Reid → Notes about this application → sidebar. WebKit (Quill Docs, suggestion due): … More actions → I followed up → Not needed → Snooze → Add a note → … (WebKit skips links by default, as Safari does without "Press Tab to highlight each item"). The order follows the reading order: main column, then side column.

Focus return, measured after the r2 fixes (WebKit; Chromium identical):

| Opened with | Focus inside | After Esc |
|---|---|---|
| `M` | menuitemradio "Saved" | button "Status: Interviewing, changes status" |
| `H` | menuitem "Later today" | button "Snooze" |
| `H` → `4` (Pick a date…) | input (date) | button "Snooze" |
| Add round | select "Round" | button "Add round" |
| Edit Hiring manager interview | select "Round" | same button |
| ⌘↩ Prepare | textarea "Prep notes" | page (nothing was focused before) |
| Add contact / Edit Marcus Reid | input "Name" | same button |
| Link existing (popover) | combobox "Search your contacts" | button "Link existing" |
| Change CV | select "CV" | button "Change CV" |
| More actions → Delete application… | button "Cancel" | button "More actions" |
| Reminder Change (inline) | input "What to do" | button "Change" (also after Save) |

### Screen Reader
From the accessibility tree (`artifacts/a11y/desktop/scratch/*.aria.yml`).

| Element | Announced As | Issue |
|---------|-------------|-------|
| Page title | heading level 1 "Frontend Engineer, Editor", then "Brightwave · Remote" | — |
| Status pill | button "Status: Interviewing, changes status" | — |
| Stage strip | "Stage 6 of 7: Interviewing", list "Stages": "Saved, done" … "Interviewing, current", "Offer" | — |
| Sections | region + heading level 2: "Up next", "Timeline", "Interview rounds", "Reminders", "Documents used", "Contacts", "Notes", "Application" | — |
| Suggestion card | article "Applied 9 days ago · no reply yet" (heading level 3) with buttons "I followed up", "Not needed", "Snooze" | — |
| Snoozed line | "Follow-up suggestion snoozed until Tomorrow, 09:00", button "Show now" | — |
| Timeline row | "Moved to Interviewing", "Automatic · Mail", time "2 days ago", "Status: Screening to Status: Interviewing", buttons "Undo", "View source" | Same names across rows (Minor, shared) |
| Round card | listitem "Hiring manager interview", buttons "Add to calendar (.ics)", "Edit Hiring manager interview", "Delete Hiring manager interview", time "Wed 28 Oct · 17:00–17:45" | — |
| Reminder | heading "Your reminder", "Hiring manager interview", time "Due Wednesday, 17:00", buttons "Change", "Remove" | — |
| Prep switch | switch "Interview prep reminders on this computer", described by the rule (and by the denied / unsupported line when shown) | — |
| Documents | term "CV" → button "Base CV — English", "Version of 2 Sept"; term "Cover letter" → "No cover letter" | — |
| Contact | "Marcus Reid", buttons "Copy marcus@brightwave.io", "Blog (opens in your browser)", "Edit Marcus Reid", "Unlink Marcus Reid" | — |
| Disabled Add note | button "Add note", description "Write the note first.", disabled | — |
| Loading | `SkeletonRegion` busy, label "Loading the application" | — |
| Toasts | region "Notifications (F6)" (live) | — |

### Priority Fixes
1. **Focus return after dialogs and the inline editor** — fixed; affected every keyboard user after every edit.
2. **Non-modal menus** — fixed; screen-reader users no longer get an app marked hidden while a menu is open.
3. **Contextual names for repeated timeline buttons** — Minor, shared `TimelineRow` (logged for DesktopFoundation).

Not covered: real VoiceOver / NVDA in the Tauri app (the harness approximates both webviews) and 200 % zoom. [INFERENCE] At 200 % the side column should stack under the main column, since the two-column grid only applies from the `@4xl` container width; not captured.
