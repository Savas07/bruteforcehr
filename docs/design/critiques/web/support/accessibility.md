# Support · Web · accessibility review

- **Skill:** `accessibility-review` (WCAG 2.1 AA), run after critique [r2](r2.md).
- **Build:** commit `3b295b5`, route `/support/`.
- **Methods:** Lighthouse 13.5.0 mobile + desktop; Playwright keyboard walk (light and dark, focus outline measured after transitions, including the card-level ring of secondary cards); `<details>` toggling with Enter and Space; skip-link activation; reflow at 320 px and 640 px; reduced-motion computed styles; token contrast computed from hex values. Not run: a real screen reader session — the screen-reader table is derived from DOM semantics.

## Accessibility Audit: Support

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-22

### Summary

**Issues found:** 4 | **Critical:** 0 | **Major:** 1 (fixed) | **Minor:** 3 (1 fixed)

### Findings

#### Perceivable

| #   | Issue                                                                                             | WCAG Criterion | Severity | Recommendation                                                                                          |
| --- | ------------------------------------------------------------------------------------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| 1   | The "Get in touch" `h2` is visually hidden; sighted users get the section from the cards' layout. | 1.3.1          | 🟢 Minor | Acceptable: keeps the heading outline correct (h1 → h2 → h3) without a redundant visible title. Logged. |

#### Operable

| #   | Issue                                                                                                                                               | WCAG Criterion | Severity | Recommendation                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Skip link lost its padding on focus.                                                                                                                | 2.4.1 / 2.4.7  | 🟡 Major | **Fixed** (`a76684d`).                                                                                                                                                                     |
| 2   | Secondary cards are whole-card links (stretched `::after`); the link itself suppresses its outline and the card draws the ring via `:focus-within`. | 2.4.7          | 🟢 Minor | Verified: the card shows the 2 px `line.focus` ring on keyboard focus in both schemes. It also shows after a mouse click (`:focus-within` doesn't distinguish), which is harmless. Logged. |

#### Understandable

| #   | Issue                                                                                                                            | WCAG Criterion              | Severity | Recommendation                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| 1   | The footer's "Report a problem" (on every page) opened a public GitHub issue directly, skipping the "Issues are public" warning. | 3.2.4 / 3.3.2 (informative) | 🟢 Minor | **Fixed** (`3b295b5`): it now links to `/support/#contact`, where the warning sits above the button. |

#### Robust

| #   | Issue                                                                                                                                                                                                                                                                            | WCAG Criterion | Severity | Recommendation |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- | -------------- |
| 1   | None. Questions are native `<details>`/`<summary>` (role, expanded state and keyboard handling from the browser); each FAQ group is a `section` labelled by its `h3`; topic links in a `nav` labelled "Question topics"; external card links append visually hidden "on GitHub". | 4.1.2          | —        | —              |

### Color Contrast Check

| Element                                 | Foreground             | Background         | Ratio         | Required | Pass? |
| --------------------------------------- | ---------------------- | ------------------ | ------------- | -------- | ----- |
| Lead, card text, answers (light)        | `fg.secondary` #4B5261 | `canvas` / `base`  | 7.31 / 7.84:1 | 4.5:1    | ✅    |
| "Issues are public" note (light / dark) | `warning.text`         | `warning.subtle`   | 4.61 / 5.16:1 | 4.5:1    | ✅    |
| Primary button (light / dark)           | `fg.onAccent` #FFFFFF  | `accent.solid`     | 6.51 / 4.58:1 | 4.5:1    | ✅    |
| Card action labels (light / dark)       | `accent.text`          | `surface.base`     | 7.00 / 7.76:1 | 4.5:1    | ✅    |
| Topic chip border (light / dark)        | `line.control`         | `canvas`           | 3.51 / 4.28:1 | 3:1      | ✅    |
| Header current page "Support"           | `accent.text`          | `surface.selected` | 6.10 / 6.27:1 | 4.5:1    | ✅    |
| Focus ring (light / dark)               | `line.focus`           | `canvas`           | 6.07 / 8.40:1 | 3:1      | ✅    |

### Keyboard Navigation

| Element                                        | Tab Order           | Enter/Space                                        | Escape | Arrow Keys |
| ---------------------------------------------- | ------------------- | -------------------------------------------------- | ------ | ---------- |
| Skip to content                                | 1                   | Focus moves to `main` (verified)                   | —      | —          |
| Logo, header "Support" (`aria-current="page"`) | 2–3                 | Follow link                                        | —      | —          |
| Open a GitHub issue                            | 4                   | Opens GitHub's new-issue form (prefilled template) | —      | —          |
| Known issues, Your data and privacy (cards)    | 5–6                 | Follow link                                        | —      | —          |
| Topic chips                                    | 7–10                | Jump to the group                                  | —      | —          |
| Questions (`summary`, 14)                      | 11–24               | Enter and Space toggle open/closed (verified)      | —      | —          |
| Links inside open answers                      | after their summary | Follow link                                        | —      | —          |
| Footer links                                   | last                | Follow link                                        | —      | —          |

All targets ≥ 44 px tall (question rows 60 px). No traps.

### Screen Reader

| Element                          | Announced As                                                                                                                    | Issue                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Primary action                   | link "Open a GitHub issue"                                                                                                      | Leaves the site; the card text says so ("opening an issue on GitHub").               |
| Secondary cards                  | heading level 3, link "Known issues on GitHub" / "Your data and privacy"                                                        | Action label ("Browse issues →") is `aria-hidden` to avoid a duplicate announcement. |
| Questions                        | disclosure (summary), collapsed / expanded, with the question as its name (Chrome exposes `<summary>` as a disclosure triangle) | —                                                                                    |
| Deep link `/support/#iphone-app` | Opens that question on load (script); without JS the page scrolls to the closed question                                        | Acceptable.                                                                          |

### Other checks

- **Reflow:** no horizontal scroll at 320 px or 640 px.
- **Motion:** with reduced motion, the plus/close icon rotation and colour transitions are 0 s; smooth scrolling off.
- **Lighthouse 13.5.0 Accessibility:** 100 (mobile), 100 (desktop).

### Priority Fixes

1. **Skip link focus state** — fixed (`a76684d`).
2. **Footer "Report a problem" through Support** — fixed (`3b295b5`).

**Result: pass** (no open Critical or Major issues).
