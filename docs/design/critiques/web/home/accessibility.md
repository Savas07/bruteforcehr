# Home · Web · accessibility review

- **Skill:** `accessibility-review` (WCAG 2.1 AA), run after critique [r2](r2.md).
- **Build:** branch `m1/web-release` (r2 build), route `/`, both release states (real build without releases; GitHub API stub with releases, see [r1](r1.md)).
- **Methods:** Lighthouse 13.5.0 mobile + desktop (stub build, served by `astro preview`); Playwright keyboard walk at 1440 (focus outline style/width read per stop); OS detection with Windows, Mac, iPhone and Linux user agents; reflow at 320 px and 640 px (≈ 200 % zoom of 1280); touch-target scan at 375; token contrast computed from hex values with `@bfhr/ui-tokens` `contrastRatio`. Not run: a real screen reader session — the screen-reader table is derived from DOM semantics and Chrome's accessibility tree (CDP).

## Accessibility Audit: Home

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23

### Summary

**Issues found:** 3 | **Critical:** 0 | **Major:** 1 (fixed) | **Minor:** 2 (1 fixed)

### Findings

#### Perceivable

| #   | Issue                                                                                                                                                                                                                               | WCAG Criterion      | Severity | Recommendation                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------- | --------------------------------------------------------------------------------------------- |
| 1   | Screenshots are informative images: each has alt text naming device, screen and content; dark mode swaps to the dark captures through `<picture>` sources, so the alt text stays true. "Screens show sample data." is visible text. | 1.1.1               | —        | —                                                                                             |
| 2   | Desktop screenshots at 375 are too small to read.                                                                                                                                                                                   | 1.4.4 (informative) | 🟢 Minor | Accepted: the alt text carries the content; nothing on the page depends on reading the image. |

#### Operable

| #   | Issue                                                                                                                                                                               | WCAG Criterion              | Severity | Recommendation                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------- | ------------------------------------------------ |
| 1   | "All changes" link was 26 px tall.                                                                                                                                                  | 2.5.5 (project rule: 44 px) | 🟡 Major | **Fixed** (`3601acc`).                           |
| 2   | Header Menu (below 768) is a native popover: Enter opens it, Tab moves into the links, Esc closes it and returns focus to Menu; Chrome exposes `expanded=false/true` on the button. | 2.1.1 / 2.4.3 / 4.1.2       | —        | Verified in Playwright + CDP accessibility tree. |
| 3   | Motion: none beyond colour transitions; smooth scrolling only under `prefers-reduced-motion: no-preference`.                                                                        | 2.3.3                       | —        | —                                                |

#### Understandable

| #   | Issue                                                                                                                                                  | WCAG Criterion      | Severity | Recommendation         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | -------- | ---------------------- |
| 1   | The hero button changes label by OS ("Download for Mac / Windows", "Get it on iPhone", generic) but always does what it says; it never auto-downloads. | 3.2.1 / 3.2.4       | —        | —                      |
| 2   | Hero meta line at 375 holds two links and wraps to three lines.                                                                                        | 3.3.2 (informative) | 🟢 Minor | Logged in critique r1. |

#### Robust

| #   | Issue                                                                                                                                                                | WCAG Criterion | Severity | Recommendation |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- | -------------- |
| 1   | None. Each section is labelled by its `h2`; lists are `ul`/`ol`; steps include a visually hidden "Step N:" prefix because the "01/02/03" numerals are `aria-hidden`. | 4.1.2          | —        | —              |

### Color Contrast Check

| Element                            | Foreground                       | Background                       | Ratio           | Required | Pass? |
| ---------------------------------- | -------------------------------- | -------------------------------- | --------------- | -------- | ----- |
| Lead / body (light)                | `fg.secondary` #4B5261           | `surface.canvas` #F6F7F9         | 7.31:1          | 4.5:1    | ✅    |
| Lead / body (dark)                 | #A8AFBB                          | #0E1014                          | 8.63:1          | 4.5:1    | ✅    |
| Sample-data caption (light / dark) | `fg.tertiary` #5E6573 / #8F97A4  | canvas                           | 5.46:1 / 6.47:1 | 4.5:1    | ✅    |
| Eyebrows (light / dark)            | `accent.text` #1F635D / #43BEB4  | canvas                           | 6.53:1 / 8.40:1 | 4.5:1    | ✅    |
| Primary button (light / dark)      | white                            | `accent.solid` #216863 / #2B827B | 6.51:1 / 4.58:1 | 4.5:1    | ✅    |
| Beta badge (light / dark)          | `info.text` #2870A5 / #689ECB    | `info.subtle` #DDF3FF / #12283B  | 4.64:1 / 5.27:1 | 4.5:1    | ✅    |
| Control borders (light / dark)     | `line.control` #7D8492 / #707887 | canvas                           | 3.51:1 / 4.28:1 | 3:1      | ✅    |
| Focus ring (light / dark)          | `line.focus`                     | canvas                           | 6.07:1 / 8.40:1 | 3:1      | ✅    |

### Keyboard Navigation

| Element                                                         | Tab Order | Enter/Space        | Escape                          | Arrow Keys |
| --------------------------------------------------------------- | --------- | ------------------ | ------------------------------- | ---------- |
| Skip link                                                       | 1         | jumps to `main`    | —                               | —          |
| Header links / Menu                                             | 2–5       | follow / open menu | closes menu, focus back to Menu | —          |
| Hero chip link, download, first-launch and other-platform links | 6–9       | follow             | —                               | —          |
| Privacy Policy, All changes, what's-new rows                    | next      | follow             | —                               | —          |
| Closing CTA, footer                                             | last      | follow             | —                               | —          |

Every stop shows the 2 px solid `line.focus` outline (read from computed styles).

### Screen Reader

| Element         | Announced As                                                    | Issue |
| --------------- | --------------------------------------------------------------- | ----- |
| Device tiles    | figure "iPhone" / "Mac" / "Windows", image with descriptive alt | —     |
| Steps           | list of 3; heading "Step 1: Add your CV" …                      | —     |
| Promises        | list of 6 headed items                                          | —     |
| What's new rows | link "2 November 2026 Version 0.2.0-beta.1 Beta"                | —     |

### Lighthouse (13.5.0)

| Run     | Performance | Accessibility | Best Practices | SEO |
| ------- | ----------- | ------------- | -------------- | --- |
| Mobile  | 100         | 100           | 100            | 100 |
| Desktop | 100         | 100           | 100            | 100 |

LCP 1.66 s mobile / 0.31 s desktop, CLS 0 (OS variant chosen before first paint). The deployed site is re-checked in [STATUS](../../../../STATUS.md).

### Priority Fixes

1. None open. Keep the two Minors for the final-stage review.
