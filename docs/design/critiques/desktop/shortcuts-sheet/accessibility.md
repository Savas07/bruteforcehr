## Accessibility Audit: Keyboard shortcuts sheet (desktop)

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

Method: axe-core WCAG 2.1 A/AA via `pnpm --filter @bfhr/desktop capture:design chrome --axe` (+ `--locale tr|de`) on `shortcuts` and `shortcuts-panel` × WebKit + Chromium × light + dark × EN/TR/DE (24 reports, `artifacts/a11y/desktop/{,tr/,de/}chrome-shortcuts*.json`); keyboard-only probe at 1280 and 600 px in both engines ([keyboard-pass.md](../keyboard-pass.md)); real-app E2E (`app.e2e.ts`: sheet contents, Esc closes, focus back to the opener). No live screen reader session.

### Summary

**Issues found:** 4 | **Critical:** 0 | **Major:** 3 (fixed) | **Minor:** 1 (fixed)

Final axe result: **0 violations** in all 24 reports. "Needs review": `aria-hidden-focus` (Radix hides the app behind the modal) and `color-contrast` on glyph-only keycaps.

### Findings

| #   | Issue                                                                                                                         | WCAG Criterion    | Severity | Recommendation                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The scrolling list wasn't focusable: axe `scrollable-region-focusable` (serious) in every run; arrow keys couldn't scroll it. | 2.1.1 Keyboard    | 🟡 Major | Fixed: while it scrolls, the list is a `region` named by the title with `tabIndex=0`, and gets focus on open. At 1280 × 800 it no longer scrolls (two columns); at 600 px Tab cycles ✕ ↔ list. |
| 2   | Closing returned focus to `<body>`.                                                                                           | 2.4.3 Focus Order | 🟡 Major | Fixed: back to the opener.                                                                                                                                                                     |
| 3   | With focus on a non-tabbable element, Tab stayed put (first fix attempt measured the list before the portal mounted).         | 2.1.2             | 🟡 Major | Fixed: measured from a callback ref; verified at 600 px in both engines.                                                                                                                       |
| 4   | Group ids came from group names (`shortcuts-CV editor`): `aria-labelledby` read two broken IDREFs.                            | 4.1.2 / 1.3.1     | 🟢 Minor | Fixed: `useId`-based ids.                                                                                                                                                                      |

### Keyboard Navigation

| Element         | Tab Order                    | Enter/Space | Escape                  | Arrow Keys             |
| --------------- | ---------------------------- | ----------- | ----------------------- | ---------------------- |
| Sheet (fits)    | Dialog focused → ✕ (trapped) | ✕ closes    | Closes, focus to opener | —                      |
| Sheet (scrolls) | List focused → ✕ → list      | —           | Closes                  | ↑ ↓ / Page keys scroll |

### Screen Reader

| Element | Announced As                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------- |
| Sheet   | dialog "Keyboard shortcuts", description "Move around without the mouse…"                      |
| Groups  | section labelled by its h3; rows are `dt` label + `dd` keycaps with spoken names ("Command K") |
