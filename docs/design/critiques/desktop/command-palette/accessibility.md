## Accessibility Audit: Command palette (desktop)

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

Method:

1. Automated scan: `pnpm --filter @bfhr/desktop capture:design chrome --axe` (+ `--locale tr`, `--locale de`): axe-core WCAG 2.1 A/AA on `palette`, `palette-filtered` and `palette-empty` × WebKit (≈ WKWebView, macOS) + Chromium (≈ WebView2, Windows) × light + dark, per language: 36 reports, `artifacts/a11y/desktop/{,tr/,de/}chrome-palette*-<theme>-<engine>.json`.
2. Keyboard-only probe in both engines (Playwright, no pointer), 1280 × 800 and 600 × 800: open with ⌘K / Ctrl+K from a focused control, Tab / Shift+Tab inside, ↑ ↓, type + ↵, Esc, and Settings commands. See [keyboard-pass.md](../keyboard-pass.md).
3. Real apps (WKWebView, WebView2): the E2E suite opens the palette with the shortcut, checks the combobox has focus, filters, navigates and checks focus on the section title, then (new) checks focus returns to the opener after Esc. Runs: see [r2.md](r2.md).
4. Names and roles from the accessibility tree. No live VoiceOver / NVDA session in this round.

### Summary

**Issues found:** 3 | **Critical:** 1 (fixed) | **Major:** 2 (fixed) | **Minor:** 0

Final axe result: **0 critical · 0 serious · 0 moderate · 0 minor** in all 36 reports (EN, TR, DE). "Needs review": `aria-hidden-focus` (Radix hides the app behind the modal; the probe confirms focus can't leave the palette) and `color-contrast` on glyph-only keycaps (⌘, ↑, ↵) and on text behind the scrim.

### Findings

#### Perceivable

| #   | Issue                                                                                                                                                                  | WCAG Criterion | Severity | Recommendation |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- | -------------- |
| —   | Group headings, labels and keycaps use `fg-secondary` / `fg-primary` on `surface-elevated`; the selected row is a fill, not colour alone (it is also `aria-selected`). | 1.4.3 / 1.4.1  | —        | Pass.          |

#### Operable

| #   | Issue                                                                                                | WCAG Criterion         | Severity | Recommendation                                                                      |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------- | -------- | ----------------------------------------------------------------------------------- |
| 1   | Esc / outside click returned focus to `<body>` (no Radix trigger).                                   | 2.4.3 Focus Order      | 🟡 Major | Fixed: focus returns to the control that had it when the palette opened.            |
| 2   | Settings commands (palette rows, ⌘, / Ctrl+,) navigated without moving focus; it stayed on `<body>`. | 2.4.3 Focus Order      | 🟡 Major | Fixed: focus moves to the pane's title (`#route-title`), like the section commands. |
| —   | Tab and Shift+Tab stay on the input (the dialog traps focus; options are reached with ↑ ↓, `loop`).  | 2.1.2 No Keyboard Trap | —        | Pass: Esc always closes.                                                            |

#### Understandable

| #   | Issue                                                                        | WCAG Criterion         | Severity | Recommendation |
| --- | ---------------------------------------------------------------------------- | ---------------------- | -------- | -------------- |
| —   | The empty message says what to try next ("Try a section name, like “Jobs”"). | 3.3.3 Error Suggestion | —        | Pass.          |

#### Robust

| #   | Issue                                                                                                                                                                | WCAG Criterion          | Severity    | Recommendation                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | With no match the listbox had no options: axe `aria-required-children` (impact critical) in every empty-state report of the first run (EN, both engines and themes). | 4.1.2 Name, Role, Value | 🔴 Critical | Fixed: the list is `hidden` while nothing matches, and the message is in an `aria-live="polite"` region, so it's announced as you type. |

### Color Contrast Check

| Element                                    | Foreground     | Background                              | Ratio                 | Pass? |
| ------------------------------------------ | -------------- | --------------------------------------- | --------------------- | ----- |
| Labels, input text                         | `fg-primary`   | `surface-elevated` / `surface-selected` | axe pass, both themes | ✅    |
| Group headings, placeholder, empty message | `fg-secondary` | `surface-elevated`                      | axe pass, both themes | ✅    |

### Keyboard Navigation

| Element                                | Tab Order                | Enter/Space                                      | Escape                           | Arrow Keys          |
| -------------------------------------- | ------------------------ | ------------------------------------------------ | -------------------------------- | ------------------- |
| Input (combobox)                       | Only stop; focus on open | Runs the selected command                        | Closes, focus back to the opener | ↑ ↓ move (wrapping) |
| Go to rows                             | —                        | Navigates, focus on the section title            | —                                | —                   |
| Settings rows                          | —                        | Opens the pane, focus on its title               | —                                | —                   |
| Keyboard shortcuts / Check for updates | —                        | Opens the sheet / check dialog (they take focus) | —                                | —                   |

### Screen Reader

| Element  | Announced As                                                                     | Issue                                                       |
| -------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Palette  | dialog "Command palette"                                                         | —                                                           |
| Input    | combobox "Command palette", expanded, controls the listbox                       | —                                                           |
| Rows     | option "<label>", selected state; groups announced by their headings             | —                                                           |
| No match | polite announcement "Nothing matches that yet. Try a section name, like “Jobs”." | Announcement wording not verified with a live screen reader |

### Priority Fixes

All findings are fixed. Logged: a live VoiceOver / NVDA pass over the palette with the next release.
