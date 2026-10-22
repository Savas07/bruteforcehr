# Terms of Use · Web · accessibility review

- **Skill:** `accessibility-review` (WCAG 2.1 AA), run after critique [r3](r3.md).
- **Build:** commit `3b295b5`, route `/terms/` (same `LegalLayout`, header and footer as the Privacy Policy).
- **Methods:** Lighthouse 13.5.0 mobile + desktop; Playwright keyboard walk (light and dark), skip-link activation, reflow at 320 px and 640 px, reduced-motion computed styles; token contrast computed from hex values. Not run: a real screen reader session — the screen-reader table is derived from DOM semantics.

## Accessibility Audit: Terms of Use

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-22

### Summary

**Issues found:** 2 | **Critical:** 0 | **Major:** 1 (fixed) | **Minor:** 1

### Findings

#### Perceivable

| #   | Issue                                                                                        | WCAG Criterion | Severity | Recommendation |
| --- | -------------------------------------------------------------------------------------------- | -------------- | -------- | -------------- |
| 1   | None open. Numbered `h2` sections, bulleted rules as `<ul>`, decorative icons `aria-hidden`. | 1.3.1          | —        | —              |

#### Operable

| #   | Issue                                                                 | WCAG Criterion           | Severity | Recommendation                                          |
| --- | --------------------------------------------------------------------- | ------------------------ | -------- | ------------------------------------------------------- |
| 1   | Skip link lost its padding on focus (shared layout).                  | 2.4.1 / 2.4.7            | 🟡 Major | **Fixed** (`a76684d`), 52 px tall pill with focus ring. |
| 2   | No current-section indication in the sticky contents (shared layout). | 2.4.8 (AAA, informative) | 🟢 Minor | Logged for the final stage.                             |

#### Understandable

| #   | Issue                                                                                                                        | WCAG Criterion | Severity | Recommendation |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- | -------------- |
| 1   | None. Plain language, consistent Settings paths, links name their destination ("Privacy Policy", "open an issue on GitHub"). | 3.1 / 3.2.4    | —        | —              |

#### Robust

| #   | Issue                                                                      | WCAG Criterion | Severity | Recommendation |
| --- | -------------------------------------------------------------------------- | -------------- | -------- | -------------- |
| 1   | None. `lang="en"`, unique heading ids, landmarks as on the Privacy Policy. | 4.1.2          | —        | —              |

### Color Contrast Check

| Element                             | Foreground     | Background          | Ratio           | Required | Pass? |
| ----------------------------------- | -------------- | ------------------- | --------------- | -------- | ----- |
| Body text (light / dark)            | `fg.primary`   | `surface.canvas`    | 16.26 / 16.39:1 | 4.5:1    | ✅    |
| Description, effective date (light) | `fg.secondary` | `canvas` / `sunken` | 7.31 / 6.93:1   | 4.5:1    | ✅    |
| Section numbers (light / dark)      | `fg.tertiary`  | `canvas`            | 5.46 / 6.47:1   | 4.5:1    | ✅    |
| "In short" label (light / dark)     | `accent.text`  | `surface.selected`  | 6.10 / 6.27:1   | 4.5:1    | ✅    |
| Links, underlined (light / dark)    | `fg.link`      | `canvas`            | 6.53 / 8.40:1   | 4.5:1    | ✅    |
| Focus ring (light / dark)           | `line.focus`   | `canvas`            | 6.07 / 8.40:1   | 3:1      | ✅    |

### Keyboard Navigation

| Element                | Tab Order     | Enter/Space                             | Escape | Arrow Keys |
| ---------------------- | ------------- | --------------------------------------- | ------ | ---------- |
| Skip to content        | 1             | Focus moves to `main` (verified)        | —      | —          |
| Logo, header "Support" | 2–3           | Follow link                             | —      | —          |
| Contents links (12)    | 4–15          | Jump to section below the sticky header | —      | —          |
| Inline links           | reading order | Follow link                             | —      | —          |
| Footer links           | last          | Follow link                             | —      | —          |

2 px `line.focus` ring on every stop, both schemes; no traps; contents rows ≥ 48 px.

### Screen Reader

| Element       | Announced As                                                          | Issue |
| ------------- | --------------------------------------------------------------------- | ----- |
| Page          | "Terms of Use · BruteForceHR", English                                | —     |
| Short version | region heading level 2 "The short version", list 4 items              | —     |
| Contents      | navigation "On this page", list 12 items                              | —     |
| Sections      | heading level 2 with generated number ("6. Jobs from other websites") | —     |

### Other checks

- **Reflow:** no horizontal scroll at 320 px or 640 px.
- **Motion:** reduced motion turns off smooth scrolling and transitions.
- **Lighthouse 13.5.0 Accessibility:** 100 (mobile), 100 (desktop).

### Priority Fixes

1. **Skip link focus state** — fixed (`a76684d`).

**Result: pass** (no open Critical or Major issues).
