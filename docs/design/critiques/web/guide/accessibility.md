# User guide · Web · accessibility review

- **Skill:** `accessibility-review` (WCAG 2.1 AA), run with critique [r1](r1.md) and re-run for [r2](r2.md).
- **Build:** branch `m6/web-guide`; routes `/guide/` and the 11 topics, served from `dist/` (`astro preview`).
- **Methods:** axe-core 4 via `@axe-core/playwright` (WCAG 2.1 A + AA tags) on all 12 routes at 375, 768 and 1440 px, light and dark (72 runs); Playwright keyboard walk at 1440 on every route; touch-target scan; reflow at 320 and 640 px; token contrast from `@bfhr/ui-tokens`; Lighthouse 13.5.0 on the overview, Getting started, Mail and Keyboard shortcuts, mobile and desktop. Not run: a real screen-reader session (table derived from DOM semantics).

## Accessibility Audit: User guide

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary

**Issues found:** 4 | **Critical:** 0 | **Major:** 2 (fixed) | **Minor:** 2 (accepted)

### Findings

#### Perceivable

| # | Issue | WCAG Criterion | Severity | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | Topic screenshots have alt text naming device, screen and content, and a visible "Device · sample data" caption. | 1.1.1 | — | — |
| 2 | Keycaps are drawn as glyphs (⌘ ⇧ ⌥ ↩ ↑), which screen readers announce inconsistently. Each cell carries a spoken form ("Command Shift D", "Control Enter", "G then T"); the glyphs are `aria-hidden`. In running text the few inline keycaps are plain `<kbd>` with the Windows word next to them. | 1.1.1 / 1.3.1 | — | — |
| 3 | The four-column "Find your way around" table overflowed a 320 px screen. | 1.4.10 Reflow | 🟡 Major | **Fixed:** a list plus one sentence per platform. |
| 4 | The site header overflowed 320 px by 16 px (all pages). | 1.4.10 Reflow | 🟡 Major | **Fixed** in the shared header (wordmark 20 px below 360 px). No horizontal scroll at 320 or 640 px on any guide route, tables included. |

#### Operable

| # | Issue | WCAG Criterion | Severity | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | Keyboard order on a topic at 1440: skip link → header → topic column ("User guide", every topic, the current topic's sections) → breadcrumb → article links → previous / next → Support link → footer. Below 1280 the topic column is not rendered; "On this page" follows the title. 2 px `line.focus` outline on every stop. | 2.1.1 / 2.4.3 / 2.4.7 | — | — |
| 2 | Overview cards: the title link covers the card (`::after`); the card draws the focus ring through `:has(:focus-visible)`, so the ring outlines the whole target. | 2.4.7 | — | — |
| 3 | Topic column, "On this page", breadcrumb, pager and card links are ≥ 44 px tall; links in running text are inline (exempt). | 2.5.5 (project rule) | — | — |
| 4 | The sticky topic column on long topics (Mail, 9 sections) scrolls on its own below the fold. | 2.4.5 (informative) | 🟢 Minor | Accepted: overview, breadcrumb and previous / next are other ways to move between topics. |

#### Understandable

| # | Issue | WCAG Criterion | Severity | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | UI labels match the apps exactly and are bold, so instructions can be matched to the screen. | 3.3.2 (informative) | — | — |
| 2 | "Guide" in the header has `aria-current="true"` on topic pages and `"page"` on the overview. | 2.4.8 | — | — |
| 3 | No search. | 2.4.5 | 🟢 Minor | Accepted: 11 topics, every section listed on the overview, multiple ways already (overview, breadcrumb, pager, header). |

#### Robust

| # | Issue | WCAG Criterion | Severity | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | Landmarks: `nav` "User guide", `nav` "Breadcrumb" (current item `aria-current="page"`), `nav` "On this page" (labelled by its heading), `article`, `nav` "More topics". Shortcut tables: `<th scope="col">` and `<th scope="row">`, each table in a `section` labelled by its `h3`. | 1.3.1 / 4.1.2 | — | — |

### Color Contrast Check

| Element | Foreground | Background | Ratio | Required | Pass? |
| --- | --- | --- | --- | --- | --- |
| Article text (light) | `fg.primary` #161A22 | `surface.canvas` #F6F7F9 | 16.26:1 | 4.5:1 | ✅ |
| Lead, captions (light) | `fg.secondary` #4B5261 | `surface.canvas` #F6F7F9 | 7.31:1 | 4.5:1 | ✅ |
| "User guide" label, "or" / "then" (light) | `fg.tertiary` #5E6573 | `surface.canvas` #F6F7F9 | 5.46:1 | 4.5:1 | ✅ |
| Links, current topic (light) | `fg.link` / `accent.text` #1F635D | `surface.canvas` #F6F7F9 | 6.53:1 | 4.5:1 | ✅ |
| Tip box text and links (light) | `fg.primary` / `fg.link` | `surface.selected` #E1F3F1 | 15.18:1 / 6.10:1 | 4.5:1 | ✅ |
| Keycaps (light) | `fg.primary` #161A22 | `surface.sunken` #EFF1F4 | 15.40:1 | 4.5:1 | ✅ |
| Tip box text and links (dark) | `fg.primary` / `fg.link` | `surface.selected` #0D302D | 12.23:1 / 6.27:1 | 4.5:1 | ✅ |
| Tertiary (dark) | `fg.tertiary` #8F97A4 | `surface.canvas` #0E1014 | 6.47:1 | 4.5:1 | ✅ |

axe: **0 violations** on all 72 runs.

### Keyboard Navigation

| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
| --- | --- | --- | --- | --- |
| Section links | Topic column (≥ 1280) or "On this page" | Jump to the section, below the sticky header | — | — |
| Previous / Next | End of every topic | Open the neighbouring topic | — | — |

### Screen Reader

| Element | Announced As | Issue |
| --- | --- | --- |
| Shortcut cell | "Command Shift D" / "Control Shift D" | — |
| Sequence | "G then T" | — |
| Breadcrumb | "Breadcrumb, navigation, list, User guide link, Mail, current page" | — |

### Lighthouse 13.5.0 (local build)

| Route | Mobile P / A / BP / SEO | Desktop P / A / BP / SEO |
| --- | --- | --- |
| `/guide/` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/guide/getting-started/` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/guide/mail/` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/guide/keyboard-shortcuts/` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |

### Priority Fixes

1. **Reflow at 320 px** — fixed (table and header).
