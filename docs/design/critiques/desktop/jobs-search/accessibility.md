# Jobs search and filters (desktop) — accessibility review

Method: `pnpm --filter @bfhr/desktop capture:design job-detail jobs-search --states populated,empty,loading,error,offline --themes light,dark --sizes 1280x800,1920x1080 --axe` (axe-core, WCAG 2.1 A/AA, WebKit ≈ WKWebView and Chromium ≈ WebView2; 20 `jobs-search-*` reports in `artifacts/a11y/desktop/`), ad-hoc Playwright runs of the popovers and the live search on the same design build, and happy-dom tests (`Screen.test.tsx`: `?q` sync, `?filters` popover open / Esc close, sort, chip removal). Screen-reader rows come from roles and names in the DOM, not a VoiceOver / NVDA session. Critiques: `r1.md`, `r2.md`.

## Accessibility Audit: Jobs — search, filter popovers, live search
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary
**Issues found:** 3 | **Critical:** 1 (fixed) | **Major:** 1 (fixed) | **Minor:** 1 (fixed)

axe after the fixes: 0 critical · 0 serious · 0 moderate · 0 minor in all 20 runs. "Needs review": with the Work mode popover open, `aria-valid-attr-value` on the open pill (its `aria-controls` points into the portalled popover) and `color-contrast` on list text the popover covers; WebKit also the shell sidebar's ⌘ keycap.

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | After an outside change of `q` the list was filtered by a search the field didn't show: the state of the screen wasn't perceivable or reversible from the field. | 1.3.1 Info and Relationships / 3.2.2 On Input | 🔴 Critical | **Fixed**: the field follows `params.q`. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| — | Pills, popover options, Reset, Show n jobs, Search job sites: all reachable with Tab, every stop shows the 2 px focus ring; `F` focuses the first pill, `/` the field, Esc clears the field. | 2.1.1 / 2.4.7 | — | Pass. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 2 | Search job sites, disabled with an empty field, described itself with the placeholder text. | 3.3.2 Labels or Instructions | 🟢 Minor | **Fixed**: "Type a role or skill in the search field first." |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 3 | The live-search `role="status"` wrapper was created together with its first message and contained a second `status` region (the alert). | 4.1.3 Status Messages | 🟡 Major | **Fixed**: a persistent `aria-live="polite"` region; each alert is keyed by state so it is inserted fresh into that region. |

### Color Contrast Check
Tested pairings from `@bfhr/ui-tokens` (system.md "Allowed pairings"), as in `../job-detail/accessibility.md`.

| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Active pill, zero-results chip | `accent.text` | `accent.subtle` | 5.77 / 6.27:1 | 4.5:1 | ✅ |
| Show n jobs | `fg.onAccent` | `accent.solid` | 6.51 / 4.58:1 | 4.5:1 | ✅ |
| Pill outline | `line.control` | `surface.base` | 3.76:1 light | 3:1 | ✅ |
| Banner title / body | `info.text` / `fg.primary` | `info.subtle` | tested pairing | 4.5:1 | ✅ (axe pass) |

### Keyboard Navigation
| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|------------|
| Search field | After the sidebar | Enter runs Search job sites | Clears the text | — |
| Search job sites | After the field (same `role="search"` form) | Runs the search (spinner, repeats ignored) | — | — |
| Filter pill | In bar order | Opens its popover, focus to the first option; adds `?filters=<facet>` | Closes, focus to pill, removes `?filters` | — |
| Popover | Options → Reset → Show n jobs | Enter in an option closes (applied live) | Closes | — |
| Banner Dismiss | After the header controls | Removes the banner | — | — |

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| Search | "Search jobs, search field" in the "search" landmark | — |
| Search job sites (empty field) | "Search job sites, button, dimmed" + "Type a role or skill in the search field first." | Fixed (#2) |
| Pill | "Work mode, button, collapsed" / "Seniority (2), button, expanded" | — |
| Popover | "Work mode, dialog" with checkboxes "Remote", "Hybrid", "On-site" | — |
| Live search | "Searching job sites for “react”… New jobs show up in the list as they're found." then "No new jobs for “react”. Checked 90 postings, 30 already in your list. Skipped: …" (polite) | Fixed (#3) |

### Priority Fixes
1. **Keep the field in sync with the route** — the list must never be filtered invisibly. (Done.)
2. **One persistent live region for the live search.** (Done.)
3. **Say why Search job sites is disabled.** (Done.)
