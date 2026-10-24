# Features · Web · accessibility review

- **Skill:** `accessibility-review` (WCAG 2.1 AA), run with critique [r1](r1.md) and re-run for [r2](r2.md).
- **Build:** branch `m6/web-guide`, route `/features/`, served from `dist/` (`astro preview`).
- **Methods:** axe-core 4 via `@axe-core/playwright` (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) at 375, 768 and 1440 px in light and dark; Playwright keyboard walk at 1440 (focus outline read per stop); touch-target scan of every visible link and button outside running text; reflow at 320 px and 640 px (200 % of 1280); token contrast from `@bfhr/ui-tokens` `contrastRatio`; Lighthouse 13.5.0 mobile and desktop. Not run: a real screen-reader session; the screen-reader table is derived from DOM semantics.

## Accessibility Audit: Features

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary

**Issues found:** 3 | **Critical:** 0 | **Major:** 1 (fixed) | **Minor:** 2 (1 fixed, 1 accepted)

### Findings

#### Perceivable

| # | Issue | WCAG Criterion | Severity | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | Every visible screenshot has alt text naming the device, the screen and what it shows; dark mode swaps to the dark capture through `<picture>`, so the alt stays true. The cards behind the CV stack are decorative duplicates: `alt=""`, `aria-hidden`, hidden below 768 px. | 1.1.1 | — | — |
| 2 | Keyed job sources were marked only by an icon; the icon has an sr-only "(needs an access key)" and the legend explains it in text. | 1.1.1 / 1.4.1 | — | — |
| 3 | Desktop screenshots at 375 px are too small to read. | 1.4.4 (informative) | 🟢 Minor | Accepted, as on Home: alt text and captions carry the content. |

#### Operable

| # | Issue | WCAG Criterion | Severity | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | The site header overflowed a 320 px viewport by 16 px (logo + Menu), on every page. | 1.4.10 Reflow | 🟡 Major | **Fixed:** the header wordmark is 20 px tall below 360 px; no horizontal scroll at 320 or 640 px on any page. |
| 2 | Keyboard order: skip link → logo → Features (current) → Guide → Download → Changelog → Support → the six jump chips → each spotlight's "How … works" → quality "Learn more" links → closing CTA → footer. 2 px `line.focus` outline on every stop. | 2.1.1 / 2.4.3 / 2.4.7 | — | — |
| 3 | Targets: jump chips, guide links and "Learn more" are 44 px tall; source chips aren't interactive. | 2.5.5 (project rule: 44 px) | — | — |
| 4 | No motion beyond colour transitions; the stacked cards are static. | 2.3.3 | — | — |

#### Understandable

| # | Issue | WCAG Criterion | Severity | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | "How Jobs works" links carry ", in the User guide" for screen readers; the visible text starts the accessible name. | 2.4.4 / 2.5.3 | — | — |
| 2 | The closing button changes label by OS but always does what it says (downloads or opens the Download page). | 3.2.4 | 🟢 Minor | Shared `DownloadCta`, accepted on Home. |

#### Robust

| # | Issue | WCAG Criterion | Severity | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | Landmarks: header, `nav` "Main", `nav` "Features on this page", `main`, `section`s labelled by their `h2`, footer. One `h1`; `h2` per spotlight, `h3` per quality and source group. | 1.3.1 / 4.1.2 | — | — |

### Color Contrast Check

| Element | Foreground | Background | Ratio | Required | Pass? |
| --- | --- | --- | --- | --- | --- |
| Bold leads, titles (light) | `fg.primary` #161A22 | `surface.canvas` #F6F7F9 | 16.26:1 | 4.5:1 | ✅ |
| Body, captions (light) | `fg.secondary` #4B5261 | `surface.canvas` #F6F7F9 | 7.31:1 | 4.5:1 | ✅ |
| "Screens show sample data" (light) | `fg.tertiary` #5E6573 | `surface.canvas` #F6F7F9 | 5.46:1 | 4.5:1 | ✅ |
| Eyebrows, links (light) | `accent.text` / `fg.link` #1F635D | `surface.canvas` #F6F7F9 | 6.53:1 | 4.5:1 | ✅ |
| Body, captions (dark) | `fg.secondary` #A8AFBB | `surface.canvas` #0E1014 | 8.63:1 | 4.5:1 | ✅ |
| Tertiary (dark) | `fg.tertiary` #8F97A4 | `surface.canvas` #0E1014 | 6.47:1 | 4.5:1 | ✅ |
| Eyebrows, links (dark) | `accent.text` #43BEB4 | `surface.canvas` #0E1014 | 8.40:1 | 4.5:1 | ✅ |
| Primary button (dark) | `fg.on-accent` #FFFFFF | `accent.solid` #2B827B | 4.58:1 | 4.5:1 | ✅ |

axe: **0 violations** at every width and scheme.

### Keyboard Navigation

| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
| --- | --- | --- | --- | --- |
| Jump chips | After the header | Enter jumps to the spotlight; the heading lands below the sticky header (`scroll-padding-top`) | — | — |
| Header Menu (< 768 px) | After the logo | Opens the native popover | Closes, focus back on Menu | — |

### Screen Reader

| Element | Announced As | Issue |
| --- | --- | --- |
| Spotlight | "Jobs that fit, from everywhere, region" | — |
| Keyed source chip | "Adzuna (needs an access key)" | — |
| Screenshot | "Jobs on Mac: filters for work mode, … image" | — |

### Lighthouse 13.5.0 (local build)

| Form factor | Performance | Accessibility | Best Practices | SEO |
| --- | --- | --- | --- | --- |
| Mobile | 100 | 100 | 100 | 100 |
| Desktop | 100 | 100 | 100 | 100 |

### Priority Fixes

1. **Reflow at 320 px** — fixed in the shared header (every page benefits).
