## Accessibility Audit: Today (desktop)
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-22

Method:
1. Automated scan: `pnpm --filter @bfhr/desktop capture:design today --axe` (axe-core, WCAG 2.1 A/AA; WebKit ≈ WKWebView and Chromium ≈ WebView2; populated / empty / loading / error / offline × light / dark). Reports: `artifacts/a11y/desktop/today-<state>-<theme>-<engine>.json`.
2. Keyboard-only pass in the design harness (Playwright, no pointer): 1280 px (list + detail), 1100 px (inline expansion), 1920 px (agenda rail), 640 px (≈ 1280 px at 200 % zoom).
3. Screen-reader names from the accessibility tree (Playwright `ariaSnapshot`, Chromium). No live VoiceOver / NVDA session in this round.

### Summary
**Issues found:** 6 | **Critical:** 0 | **Major:** 3 (all fixed) | **Minor:** 3 (1 fixed, 2 logged)

Final axe result (after fixes, `a6b2282` and `57e5597`): **0 critical · 0 serious · 0 moderate · 0 minor** in all 20 runs. WebKit runs list one "needs review" item: `color-contrast` on the shell's ⌘ keycap in "Jump to…" ("Element content contains only non-text characters"); it's shell chrome, not Today, and the glyph is decorative next to its spoken label.

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Detail pane for automatic changes and follow-ups jumped from h1 to the shared card's h3. | 1.3.1 Info and Relationships | 🟡 Major | Fixed: h2 kicker ("Updated automatically", "Suggested follow-up") above the card in the pane. |
| 2 | Proposed statuses on review rows were shown as status pills, i.e. the same as applied ones (visual meaning not matching state). | 1.3.1 | 🟡 Major | Fixed in critique round 1: review rows show the received time; the proposal sentence in the pane carries the move. |
| 3 | Auto-change glyph on the company tile is a 10 px bolt. | 1.4.11 Non-text Contrast | 🟢 Minor | Not the only cue: the "Updated automatically · you can undo these" sub-heading (h3, list name) and the row text ("— from an email by …") carry it. Logged. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 4 | After an action from a menu or the date dialog (snooze, pick a date, Esc), focus fell to `<body>` or stayed on a button of the removed item. | 2.4.3 Focus Order | 🟡 Major | Fixed: focus moves to the neighbouring row after the overlay has closed (next frame); to the title when the list is empty; back to the row when the date dialog is cancelled. |
| 5 | Inline mode: the first Esc inside the expanded detail closes an open tooltip, the second collapses it. | 2.1.1 Keyboard | 🟢 Minor | Shared `Hint` (Radix Tooltip) behaviour; works, logged. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| — | Date dialog field is labelled ("Date"), Snooze is disabled with a reason ("Choose a date first."), the earliest date is tomorrow (`min`). | 3.3.2 Labels or Instructions | — | Pass. |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 6 | Row names first read the company and time ("Sail Analytics 5 hours ago Looks like…"). An `aria-labelledby` reorder then failed axe `label-content-name-mismatch` (2.5.3 Label in Name). | 4.1.2 / 2.5.3 | 🟢 Minor | Fixed: DOM order is title → context → company → time, and CSS `order-first` keeps the company line on top visually. The name is the visible text, title first. |

### Color Contrast Check
All text uses `fg-primary` / `fg-secondary` / `fg-tertiary` / `accent-text` tokens on `surface-*` tokens; `@bfhr/ui-tokens` contrast tests cover the pairs. axe `color-contrast` passes on every Today element in light and dark, both engines.

| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Row title | fg-primary | surface-canvas / surface-selected | per axe | 4.5:1 | ✅ |
| Row company / context / time | fg-secondary | surface-canvas / surface-selected | per axe | 4.5:1 | ✅ |
| "· 3" count, auto sub-heading | fg-tertiary / fg-secondary | surface-canvas | per axe | 4.5:1 | ✅ |
| Status pills, match pills | status / band text tokens | their subtle fills | per axe | 4.5:1 | ✅ |
| Plain buttons (See all in Jobs, Open in Mail) | accent-text | surface-canvas / surface-base | per axe | 4.5:1 | ✅ |

### Keyboard Navigation
| Element | Tab Order | Enter/Space | Escape | Arrow Keys / letters |
|---------|-----------|-------------|--------|------------|
| Sidebar → "Show" Open/Later radio group | 1 (after shell) | selects | — | ← / → between segments |
| List (roving tabindex, one stop) | 2 | Enter: focus the detail pane (≥ 1200) or expand inline (< 1200) | Esc: back to the row / collapse | J / K, ↓ / ↑ move; selection follows focus |
| "See all in Jobs" | 3 | navigates | — | — |
| Splitter "Resize Today" | 4 | — | — | ← / → resize, Home / End |
| Detail pane actions | 5+ | activate | Esc returns to the row | C confirm · M change · N not job mail · E done / seen · H snooze (menu, 1–4) · D not needed / not for me · S save · O open source |
| Agenda rail entries (≥ 1440) | after detail | select the item | — | — |
| Snooze menu | opened by H or the button | Enter picks | closes, focus to trigger | ↑ / ↓, 1–4 pick directly |
| Date dialog | trapped | Enter submits | closes, focus back to the row | native date segments |
| Row context menu | Shift+F10 / Menu key / right-click | — | closes | ↑ / ↓; items show their letters |
| Toast | F6 | Undo | dismiss | Mod+Z undoes from anywhere |

Visible focus: rows and buttons show the 2 px `line-focus` ring (seen in captures in both themes). 640 px (≈ 200 % zoom): content reflows to one column with inline expansion; no horizontal scrolling; inline detail indent drops to 12 px.

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| Title | heading level 1 "Today" (focused after ⌘1 / palette) | — |
| Section | region "To review · 3", heading level 2 | — |
| Automatic changes | heading level 3 + list "Updated automatically · you can undo these" | — |
| Review row | button "Looks like a recruiter message about Sail Analytics Product Engineer at Sail — open to a chat? Sail Analytics 5 hours ago", current item when selected | — |
| Auto-change row | button "Changed automatically Moved to Offer — from an email by Lumenpay … Lumenpay Status: Offer" | — |
| Match row | button "Design Systems Engineer … Pixelpost Strong match, 88 of 100" | — |
| Inline detail | region named by the row title | — |
| Pending row | "Waiting to sync" image in the row | — |
| Loading | status "Loading Today", `aria-busy` region; rail "Loading the next 7 days" | — |
| Toasts | polite live region "Confirmed · Sail Analytics, Undo, Command Z" | — |

### Priority Fixes
1. **Focus after actions** (fixed) — keyboard users kept their place through every action path.
2. **Heading structure in the pane** (fixed) — h1 → h2 → h3 everywhere.
3. **Name order** (fixed) — the title is heard first and the name matches the visible label.

Open: a live VoiceOver (macOS app build) and NVDA (Windows CI) pass on the real-app captures, which this round couldn't run.
