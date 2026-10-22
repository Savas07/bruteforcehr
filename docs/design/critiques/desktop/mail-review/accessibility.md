# Mail review (desktop) — accessibility review

Skill: `accessibility-review`. Scope: `/mail` and `/mail/review/$messageId` in the design build, all five states, light and dark, WebKit (≈ macOS WKWebView) and Chromium (≈ Windows WebView2), plus the interaction states the matrix doesn't capture (correction popover, Review later menu, Updates, All job mail, a category filter, the toast after Confirm, the 1920 px details rail, the pushed detail at 900 px).

Evidence:

- `pnpm --filter @bfhr/desktop capture:design mail-review --axe` (WCAG 2.1 A + AA tags): 20 reports in `artifacts/a11y/desktop/mail-review-{populated,empty,loading,error,offline}-{light,dark}-{webkit,chromium}.json`, all **0 critical · 0 serious · 0 moderate · 0 minor**. WebKit lists one "needs review" in every state: the shell's ⌘ keycap in "Jump to…" (axe can't measure contrast of a glyph-only element; not part of this screen).
- A throwaway Playwright script (not committed) ran axe on the interaction states above in both engines and themes, walked the Tab order from the top of the document and pressed every Mail key while logging focus and the route.
- Computed contrast of the screen's text and indicator pairs in both themes (table below).

## Accessibility Audit: Mail review
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-22

### Summary
**Issues found:** 6 | **Critical:** 0 | **Major:** 3 (all fixed) | **Minor:** 3 (2 fixed, 1 shared and logged)

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | The first-use hint bar hid its action names from screen readers (`aria-hidden` on "Confirm", "Change"…), so it read "C, M, N, H". | 1.3.1 Info and Relationships | 🟢 Minor | Fixed: labels are exposed; `Keycaps` adds the spoken key. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 2 | Esc (or Cancel) in the correction popover dropped focus on `<body>`: the popover has no trigger (M, the card's Change… and a row's ✎ all open it). | 2.4.3 Focus Order | 🟡 Major | Fixed: focus returns to whatever opened it, or to the selected row when that is gone after a save. |
| 3 | Pressing 1 / 2 / 3 while a row had focus re-rendered the list and dropped focus on `<body>`. | 2.4.3 Focus Order | 🟡 Major | Fixed: focus follows into the new folder's first row when it was in the list (or nowhere); it never leaves the sidebar when the user clicked a folder there. |
| 4 | Below 980 px, Esc from the pushed reading pane returned focus to `<body>` (the list had unmounted, so the shared return-focus target was gone). | 2.4.3 Focus Order | 🟡 Major | Fixed: `onBack` restores focus to the selected row (`SplitView` contract: "Restore the list selection here"). |
| 5 | Hover ✓ / ✎ icon buttons on rows are pointer-only (`tabIndex=-1`). | 2.1.1 Keyboard | — | Intended: C and M do the same on the selected row and are in tooltips, the hint bar and the shortcuts sheet; Tab reaches the card's Confirm / Change… too. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 6 | In the correction popover, Tab changes which field the (still focused) search box filters, but nothing announced the change. | 3.2.2 On Input / 4.1.3 Status Messages | 🟢 Minor | Fixed: a polite live region names the field ("Application"); the search box is described by "Tab moves to the next field. Enter chooses. ⌘↩ saves." |
| — | Disabled actions say why: Confirm on an unclassified email ("Nothing to confirm yet. Use Change… to sort this email."), Open original offline ("Opening the original needs a connection."), Status without an application ("Choose an application first"). | 3.3.2 Labels or Instructions | ✅ | — |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 7 | With the Review later menu open, axe reports `aria-hidden-focus` on `#root`: the shared Radix `DropdownMenu` (via `SnoozeMenu`) hides the app while the menu is modal, and the app still contains tabbable elements. Focus is trapped in the menu and Tab closes it, so nothing hidden is reachable; the same appears on any Radix modal menu in the app. | 4.1.2 Name, Role, Value | 🟢 Minor | Logged for DesktopFoundation (shared `Menu.tsx`): either `modal={false}` on the menu root or document it as an axe false positive in the `--axe` harness. Not changed here (shared file). |

### Color Contrast Check
Computed from the rendered page (Chromium, 1280×800), alpha blended over the actual surface.

| Element | Foreground | Background | Ratio light / dark | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Sender, classification (selected row) | fg-primary | surface-selected | 15.18 / 12.23 | 4.5:1 | ✅ |
| Subject, time (selected row) | fg-tertiary | surface-selected | 5.10 / 4.83 | 4.5:1 | ✅ |
| Subject, time (other rows) | fg-tertiary | surface-base | 5.86 / 5.98 | 4.5:1 | ✅ |
| Sidebar folder | fg-secondary | chrome | 7.31 / 8.63 | 4.5:1 | ✅ |
| Amber health dot (non-text) | warning-solid | chrome | 3.30 / 4.23 | 3:1 | ✅ (plus text: "Needs reconnecting") |
| Confirm label | fg-on-accent | accent-solid | 6.51 / 4.58 | 4.5:1 | ✅ |
| Not job mail (text button) | accent-text | surface-base | 7.00 / 7.76 | 4.5:1 | ✅ |
| Re-auth title | warning-text | warning-subtle | 4.61 / 5.16 | 4.5:1 | ✅ |
| Re-auth body | fg-secondary | warning-subtle | 6.85 / 6.90 | 4.5:1 | ✅ |
| Hint bar labels | fg-secondary | surface-sunken | 6.93 / 8.87 | 4.5:1 | ✅ |

axe's `color-contrast` rule also passed on every captured state in both engines and themes, including the popover, menu and toast states. Status pills ("Not selected" grey, never red) and the classification badge are never the only carrier of meaning: the row writes the class or the change out.

### Keyboard Navigation
Tab order (Chromium; WebKit skips the destination links because Safari/WKWebView only tab to buttons and fields by default):
Jump to… → Today … Mail → To review (3) → Updates → All job mail → Categories → Keyboard shortcuts → Reconnect → the selected email row (one tab stop, roving) → list splitter → Review later → Open in Gmail → Confirm → Change… → Not job mail → Open in Tracker → Hide these tips.

| Element | Tab Order | Enter/Space | Escape | Arrow Keys / letters |
|---------|-----------|-------------|--------|------------|
| Sidebar folders, Categories | 2–5 (WebKit) / 7–10 | Opens the folder / toggles the category group (`aria-expanded`) | — | 1 / 2 / 3 switch folders from anywhere outside text fields |
| Email list | one stop (selected row) | Opens the reading pane (pushed below 980 px; focus moves into it) | Back to the list, focus on the row | J / K and ↓ / ↑ move and select; C confirm, M change, N not job mail, H review later, O open original |
| Splitter | after the list | — | — | ← / → resize 8 px, Home / End to 360 / 440 |
| Review card | after the toolbar | Confirm / Change… / Not job mail | — | — |
| Correction popover (M) | focus in the search box | Enter chooses and moves to the next field; on Status it saves | Closes, focus back to the opener | Tab / Shift+Tab cycle Category → Application → Status; ↑ / ↓ options; type to filter; ⌘↩ / Ctrl+Enter saves |
| Review later (H) | menu | chooses a preset; "Pick a date…" opens a date field with Review then / Cancel | Closes, focus on "Review later" | 1–4 presets |
| Toast | F6 | Undo | — | ⌘Z / Ctrl+Z undoes the last decision even after the toast is gone |

Logged with the throwaway script (both engines): J → next row selected and focused; K → back; M → popover with focus in the search box; Esc → focus on the row that opened it; H → menu focused on "Later today"; Esc → "Review later"; C → next row focused, URL `messageId` follows; ⌘Z → restored; 2 / 3 / 1 → folder changes with focus on its first row; N → next row focused.

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| Screen title | heading level 1 "Mail" (focus target after ⌘5 / G M) | — |
| Mail folders | list "Mail folders"; button "To review 3", current page | — |
| Health dot | image "Needs reconnecting" next to the address | — |
| Re-auth callout | status "iCloud needs you to sign in again. We paused checking … on 21 Oct. Reconnect …", button "Reconnect" | Polite, never dismissible while broken |
| Email row | list item (current), name from its text: "Hannah Brooks 5 hours ago Looks like a recruiter message about Sail Analytics Product Engineer at Sail — open to a chat? To deniz.aksoy@example.com" | Inbox read as "To {address}", visible as the provider name |
| Waiting to sync | image "Waiting to sync" | — |
| Review card | region named by its headline; Confirm button with tooltip "Confirm: move to Screening" and shortcut; Not job mail described by "We'll forget this email." | Shared `ReviewDetailPane` |
| Correction popover | dialog "Correct this email"; tabs Category / Application / Status; combobox labelled by the field, described by the Tab / Enter / ⌘↩ hint; live "Application" on Tab | Fixed (#6) |
| Toast | polite status "Confirmed: Sail Analytics · Recruiter" with an Undo action and its spoken shortcut | Shared `Toast` (announcement wording not verified with a real screen reader) |
| Pushed detail (< 980 px) | region "Email" receives focus; "Back to emails" button | — |

### Priority Fixes
1. **Focus after closing the correction popover** — affected every keyboard user correcting an email; fixed.
2. **Focus after switching folders with 1–3 and after leaving the pushed detail** — keyboard users lost their place; fixed.
3. **`aria-hidden-focus` while a Radix menu is open** — a harness false positive in shared `Menu.tsx`; logged for DesktopFoundation.

Not covered here: real VoiceOver / NVDA runs in the Tauri app (the harness approximates the webviews), and 200 % zoom (the list and reading pane reflow at the 980 px and 640 px breakpoints; the pushed and rail-less layouts were captured at 900 px).
