# Privacy Policy · Web · accessibility review

- **Skill:** `accessibility-review` (WCAG 2.1 AA), run after critique [r3](r3.md).
- **Build:** commit `3b295b5`, route `/privacy/` (shared `LegalLayout`, site header and footer).
- **Methods:** Lighthouse 13.5.0 (axe-core rules) mobile + desktop; Playwright keyboard walk (first 12 Tab stops, light and dark, computed focus outline after transitions); skip-link activation; reflow at 320 px and 640 px (200 % zoom of a 1280 px window); `prefers-reduced-motion` computed styles; contrast computed from the token hex values. Not run: a real screen reader session (VoiceOver / NVDA) — the screen-reader table below is derived from the DOM semantics.

## Accessibility Audit: Privacy Policy

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-22

### Summary

**Issues found:** 3 | **Critical:** 0 | **Major:** 1 (fixed) | **Minor:** 2

### Findings

#### Perceivable

| #   | Issue                                                                                                                                                                                 | WCAG Criterion | Severity | Recommendation |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- | -------------- |
| 1   | None open. Headings, lists, the retention `<table>` (with `<th>` header row) and the service `<dl>` carry the structure; decorative SVGs (brand mark, check icons) are `aria-hidden`. | 1.3.1          | —        | —              |

#### Operable

| #   | Issue                                                                                                                              | WCAG Criterion              | Severity | Recommendation                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Skip link lost its padding when focused (`sr-only` → `not-sr-only` reset padding to 0): a cramped 28 px pill overlapping the logo. | 2.4.1 Bypass Blocks / 2.4.7 | 🟡 Major | **Fixed** (`a76684d`): dedicated `.skip-link` parked above the viewport, slides in on focus; now 52 px tall, `accent.solid` with a visible focus ring. |
| 2   | The sticky contents at ≥ 1280 px has no "current section" indication.                                                              | 2.4.8 (AAA, informative)    | 🟢 Minor | Optional scroll-spy with `aria-current="location"`; logged for the final stage.                                                                        |

#### Understandable

| #   | Issue                                                                                                                                                    | WCAG Criterion      | Severity | Recommendation                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------- | --------------------------------------------------------------------------------------- |
| 1   | Some links leave for GitHub or Google's policy pages without saying so in the link text (e.g. "open an issue on GitHub" does say it; "Savas07" doesn't). | 3.2.4 (informative) | 🟢 Minor | Link text names the destination in all but the GitHub profile link; acceptable. Logged. |

#### Robust

| #   | Issue                                                                                                                                                                                | WCAG Criterion | Severity | Recommendation |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | -------- | -------------- |
| 1   | None. `lang="en"`, unique `id`s for every heading anchor, landmarks: `header` (banner), `nav "Main"`, `main`, `nav` labelled "On this page", `footer` (contentinfo), `nav "Footer"`. | 4.1.1 / 4.1.2  | —        | —              |

### Color Contrast Check

| Element                                 | Foreground             | Background               | Ratio           | Required | Pass? |
| --------------------------------------- | ---------------------- | ------------------------ | --------------- | -------- | ----- |
| Body text (light)                       | `fg.primary` #161A22   | `surface.canvas` #F6F7F9 | 16.26:1         | 4.5:1    | ✅    |
| Body text (dark)                        | `fg.primary` #ECEEF2   | `surface.canvas` #0E1014 | 16.39:1         | 4.5:1    | ✅    |
| Lead / effective date (light)           | `fg.secondary` #4B5261 | `canvas` / `sunken`      | 7.31 / 6.93:1   | 4.5:1    | ✅    |
| Section numbers, "On this page" (light) | `fg.tertiary` #5E6573  | `canvas` / `base`        | 5.46 / 5.86:1   | 4.5:1    | ✅    |
| "In short" label (light / dark)         | `accent.text`          | `surface.selected`       | 6.10 / 6.27:1   | 4.5:1    | ✅    |
| Inline links (light / dark), underlined | `fg.link`              | `canvas`                 | 6.53 / 8.40:1   | 4.5:1    | ✅    |
| Short-version text                      | `fg.primary`           | `surface.base`           | 17.43 / 15.15:1 | 4.5:1    | ✅    |
| Focus ring (light / dark)               | `line.focus`           | `canvas`                 | 6.07 / 8.40:1   | 3:1      | ✅    |

### Keyboard Navigation

| Element                  | Tab Order        | Enter/Space                                                                   | Escape | Arrow Keys |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------- | ------ | ---------- |
| Skip to content          | 1                | Moves focus to `<main id="main">` (verified)                                  | —      | —          |
| Logo (home)              | 2                | Follows link                                                                  | —      | —          |
| Header "Support"         | 3                | Follows link                                                                  | —      | —          |
| Contents links (14)      | 4–17             | Jump to section; heading lands below the sticky header (`scroll-padding-top`) | —      | —          |
| Inline links in sections | in reading order | Follow link                                                                   | —      | —          |
| Footer links             | last             | Follow link                                                                   | —      | —          |

Every stop shows a 2 px `line.focus` ring with 2 px offset in both schemes (measured after the 120 ms colour transition). No keyboard traps. Contents rows are 48 px tall (76 px when wrapped).

### Screen Reader

| Element          | Announced As                                                                                                                               | Issue |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Page             | "Privacy Policy · BruteForceHR", English                                                                                                   | —     |
| Contents         | navigation "On this page", list 14 items                                                                                                   | —     |
| Section headings | heading level 2 "Who runs BruteForceHR" (the CSS counter "1." is generated content; Chrome and Safari read it, so the number is announced) | —     |
| Service list     | description list, 8 groups: term "Google Cloud", definitions …                                                                             | —     |
| Retention table  | table, 2 columns, column headers "Data", "How long"                                                                                        | —     |
| Effective date   | "Effective 22 October 2026" (`<time datetime="2026-10-22">`)                                                                               | —     |

### Other checks

- **Reflow (1.4.10):** no horizontal scrolling at 320 px or at 640 px (200 % zoom); no element wider than the viewport.
- **Text spacing / resize (1.4.4, 1.4.12):** rem-based sizes, no fixed heights on text containers.
- **Motion:** under `prefers-reduced-motion: reduce` smooth scrolling is off and all transitions are 0 s (token durations); nothing animates on load.
- **Lighthouse 13.5.0 Accessibility:** 100 (mobile), 100 (desktop).

### Priority Fixes

1. **Skip link focus state** — fixed (`a76684d`); affected every keyboard user on every page.
2. **Scroll-spy for the sticky contents** — nice to have, final stage.

**Result: pass** (no open Critical or Major issues).
