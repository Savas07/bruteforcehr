## Accessibility Audit: Tracker board (desktop)

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-22

Method (`skill://accessibility-review`):

1. **Automated:** `pnpm --filter @bfhr/desktop capture:design tracker-board --axe --sizes 1280x800` (axe-core WCAG 2.1 A/AA tags) on populated, empty, loading, error and offline × light, dark × WebKit, Chromium. Reports: `artifacts/a11y/desktop/tracker-board-<state>-<theme>-<engine>.json`.
2. **Keyboard-only pass** in the design harness (Playwright, WebKit with macOS keys and Chromium with Windows keys): Tab order from the document start, roving focus on the board, `M` menu, Esc, Enter, J/K in the panel, Mod+Shift+→, Mod+Z, Esc, F6.
3. **Screen-reader names** read from the accessibility tree (accessible names, roles, descriptions) in both engines; drag announcements and instructions read from the dnd-kit live region configuration.
4. **Zoom:** 200 % equivalent (640 × 400 CSS px at 2×), board and panel.

### Summary

**Issues found:** 5 | **Critical:** 0 | **Major:** 4 (all fixed) | **Minor:** 1 (logged)

Final axe run: **0 critical · 0 serious · 0 moderate · 0 minor** on all 20 pages. "Needs review": WebKit only, the `⌘` keycap glyph in the shared `Keycaps` (sidebar "Jump to…", first-use "Add application"): axe can't compute contrast for a symbol-only element; the pairing (`fg.secondary` on `surface.sunken`) is in the token contrast tests.

### Findings

#### Perceivable

| #   | Issue                                                                                                                                                                                                         | WCAG Criterion               | Severity | Recommendation |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------- | -------------- |
| 1   | Closed outcomes and statuses rely on text labels; dots are decorative (`aria-hidden`). "Not selected" is grey, never red.                                                                                     | 1.4.1 Use of Color           | ✅       | —              |
| 2   | Column headers are `h2` inside labelled `section`s ("Interviewing, 3 applications"); cards are list items in an `ol`; the panel is an `aside` named "Application details" with `h2` (role) and `h3` sections. | 1.3.1 Info and Relationships | ✅       | —              |

#### Operable

| #   | Issue                                                                                                                                                                                   | WCAG Criterion    | Severity | Recommendation                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | Loading and error boards had a horizontal scroller with nothing focusable inside, so keyboard users couldn't scroll to the hidden columns (axe `scrollable-region-focusable`, serious). | 2.1.1 Keyboard    | 🟡 Major | **Fixed**: the static board's scroller is a focusable `group` named "Application board".                                                                                    |
| 4   | After closing the `M` menu with Esc, focus landed on the card's corner "Move to…" trigger instead of the card, so arrow keys and Mod+Shift+→ did nothing until the user tabbed back.    | 2.4.3 Focus Order | 🟡 Major | **Fixed**: when the menu closes, focus returns to the card button.                                                                                                          |
| 5   | Closing the panel after a move + Undo dropped focus to `body` (the card had re-mounted in its column).                                                                                  | 2.4.3 Focus Order | 🟡 Major | **Fixed**: closing the panel focuses the record's card wherever it now is.                                                                                                  |
| 6   | Drag and drop needs a pointer.                                                                                                                                                          | 2.1.1 Keyboard    | ✅       | Every drag move has a keyboard path: `M` (Move to…, all 12 statuses, refused ones disabled with the reason), Mod+Shift+→ / ← (one stage), and the status pill in the panel. |
| 7   | Collapse buttons on each column header add seven Tab stops between cards.                                                                                                               | 2.4.3 Focus Order | 🟢 Minor | Logged. Cards use roving focus (one Tab stop for the whole board), so the board costs 7 + 2 stops; the collapse controls must stay reachable.                               |

#### Understandable

| #   | Issue                                                                                                                                                                                          | WCAG Criterion             | Severity | Recommendation |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------- | -------------- |
| 8   | Refused moves explain themselves: disabled menu items and dimmed drop zones carry "Accepted and Declined come after an offer."; dropping there springs back with the same sentence in a toast. | 3.3.1 Error Identification | ✅       | —              |
| 9   | Every move announces its result in the polite toast region with Undo (Mod+Z).                                                                                                                  | 3.2.2 On Input             | ✅       | —              |

#### Robust

| #   | Issue                                                                                                                                                                                                                                                                                                  | WCAG Criterion              | Severity | Recommendation                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | The Closed rail and collapsed column rails used `aria-label` sentences that didn't contain their visible words in order (axe `label-content-name-mismatch`, serious; affects voice control).                                                                                                           | 2.5.3 Label in Name / 4.1.2 | 🟡 Major | **Fixed**: the buttons are named by a visually hidden sentence in their content ("Closed, 7 applications: Accepted 1, …"; "Show Offer, 0 applications"), the visible vertical text is `aria-hidden`. |
| 11  | Cards: button with `aria-roledescription="movable card"`, described by "Press Enter for details, M to move to another stage, …"; the age line is spoken as "12 days in Interviewing"; the automatic-move envelope is spoken "Moved automatically from an email"; the selected card has `aria-current`. | 4.1.2 Name, Role, Value     | ✅       | —                                                                                                                                                                                                    |

### Color Contrast Check

| Element                               | Foreground                    | Background                            | Ratio                          | Required | Pass? |
| ------------------------------------- | ----------------------------- | ------------------------------------- | ------------------------------ | -------- | ----- |
| Card role, company, meta              | `fg.primary` / `fg.secondary` | `surface.base`                        | axe: pass (light, dark)        | 4.5:1    | ✅    |
| Column header, "oldest 9 d"           | `fg.primary` / `fg.secondary` | `surface.sunken`                      | axe: pass (light, dark)        | 4.5:1    | ✅    |
| Drag transition "Applied → Screening" | `accent.text`                 | `surface.sunken` / `surface.selected` | token pairing (contrast tests) | 4.5:1    | ✅    |
| Status pills in the panel             | `status.*.text`               | `status.*.subtle`                     | axe: pass                      | 4.5:1    | ✅    |
| Focus ring                            | `line.focus`, 2 px            | card / well                           | visible in all captures        | 3:1      | ✅    |

### Keyboard Navigation

| Element       | Tab Order                                                    | Enter/Space                            | Escape                         | Arrow Keys                                                                                            |
| ------------- | ------------------------------------------------------------ | -------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Sidebar       | Jump to…, Keyboard shortcuts (shell)                         | native                                 | —                              | —                                                                                                     |
| Column header | Collapse button per expanded column                          | collapse                               | —                              | —                                                                                                     |
| Board cards   | one stop (roving); corner "Move to…" follows the active card | Enter toggles the detail panel         | —                              | ← / → column, ↑ / ↓ and J / K card; `M` menu; Mod+Shift+→ / ← move                                    |
| Move to… menu | opens on `M` or the corner button                            | picks a status (refused ones disabled) | closes, focus back on the card | ↑ / ↓ through statuses                                                                                |
| Closed rail   | last stop                                                    | shows / hides the outcome columns      | —                              | —                                                                                                     |
| Detail panel  | focus moves into it on open                                  | buttons                                | closes, focus back on the card | J / K previous / next in the column; `M` opens the status pill menu; Mod+Shift+→ / ← moves the record |
| Toast         | F6                                                           | Undo                                   | dismiss                        | —                                                                                                     |

Verified sequence (both engines): Sail (Saved) → → Northstar → → Quill → ↓ Tannenbaum → J Halden → K Tannenbaum → ← Polder; `M` opens "Move to…" on Saved (current Preparing checked); Esc → Polder card; Enter → panel; Mod+Shift+→ → Polder to Applied with toast; Mod+Z → "Restored"; Esc → Polder card; F6 → toast region.

### Screen Reader

| Element                | Announced As                                                                                                                                 | Issue |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Column                 | "Interviewing, 3 applications", heading "Interviewing", "Oldest: 12 days in this stage"                                                      | —     |
| Card                   | "Kervan Teknoloji Product Engineer (Frontend) On-site interview · Today, 15:00, movable card", description with the key instructions         | —     |
| Card corner button     | "Move to…" (tooltip shows `M`)                                                                                                               | —     |
| Closed rail            | "Closed, 7 applications: Accepted 1, Declined 1, Not selected 3, Withdrawn 1, No response 1", expanded/collapsed                             | —     |
| Collapsed column       | "Show Offer, 0 applications", collapsed                                                                                                      | —     |
| Loading                | status "Loading applications"; region `aria-busy`; counts "Count not loaded yet"                                                             | —     |
| Drag (pointer)         | "Picked up Quill Docs, in Applied." → "Applied → Not selected" → "Dropped on Not selected." / "Move cancelled. Quill Docs stays in Applied." | —     |
| Timeline automatic row | "Moved to Offer", "Automatic · Mail", reason, "Undo" (hint "Move back to Interviewing"), "View source"                                       | —     |

### Zoom

At 200 % (640 × 400 CSS px) one column plus a peek and the Closed rail fit; card text wraps, no labels truncate in view. The detail panel covers the board below 980 px (shared `DetailSidePanel`), with Esc and the close button.

### Priority Fixes

All Major findings are fixed (`0 serious` in the final axe run). Remaining Minor: the seven collapse stops (#7), logged.
