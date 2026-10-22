# Job detail (desktop) — accessibility review

Method: `pnpm --filter @bfhr/desktop capture:design job-detail --axe` (axe-core, WCAG 2.1 A/AA, WebKit ≈ WKWebView and Chromium ≈ WebView2, all 5 states × light/dark × 1280×800/1920×1080; reports in `artifacts/a11y/desktop/job-detail-*.json`), a scripted keyboard-only pass in the design harness (Tab order, J/K/Enter/S/D/Shift+D/Esc//, at 1280, 1920 and 900 px), Playwright accessibility-tree snapshots of the list and detail (screen-reader names), and a 640 × 400 viewport for 200 % zoom. Contrast comes from the token pairings tested in `@bfhr/ui-tokens` (`contrastPairs()`).

## Accessibility Audit: Jobs — job detail
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-22

### Summary
**Issues found:** 9 | **Critical:** 0 | **Major:** 5 (all fixed) | **Minor:** 4 (2 fixed, 2 logged)

axe after the fixes: 0 critical · 0 serious · 0 moderate · 0 minor in all 20 runs. WebKit runs report 1 "needs review" (color-contrast on the shell sidebar's ⌘ keycap, `.ml-auto kbd`), which is shell chrome, not this screen.

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Requirement items prefixed their status for screen readers even when the text already said it ("Not stated: Visa sponsorship: Not stated", "Outside your preferences: Outside your preferences: …"). | 1.3.1 Info and Relationships | 🟢 Minor | **Fixed**: the sr-only status is added only when the text doesn't contain it. |
| 2 | Disabled Apply offline was explained only in a tooltip; the disabled label is exempt from contrast and hard to read in dark mode. | 1.4.3 (exempt) / 3.3.2 | 🟡 Major | **Fixed** (r1): visible footnote under the action row; the button keeps its accessible description. |
| 3 | Band bar meaning by colour. | 1.4.1 Use of Color | — | Pass: every segment is labelled, the current one is bold; the bar is `aria-hidden` and the band label + "88 of 100" carry the meaning. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 4 | The first J/K from `/jobs` changes the route to `/jobs/$jobId`, which remounted the screen and dropped focus to `body`. | 2.4.3 Focus Order | 🟡 Major | **Fixed**: the selected row is refocused after the route change. |
| 5 | `D` (Not for me) removed the focused row and left focus on `body`. | 2.4.3 Focus Order | 🟡 Major | **Fixed**: focus moves to the next row; with Shift+D the reason popover takes focus and hands it back to the list on close. |
| 6 | WebKit skipped the "Found on" links on Tab (Safari / WKWebView default "Tab highlights each item" is off). | 2.1.1 Keyboard | 🟡 Major | **Fixed**: explicit `tabIndex={0}` on the source links. (The shell's sidebar links have the same issue in WebKit; shell-owned.) |
| 7 | "Sorted by Best match ⓘ" button was 16 px tall; source links 18 px. | 2.5.8 Target Size (2.2, desktop minimum 24 px) | 🟢 Minor | **Fixed**: `min-h-6`. |
| 8 | At 200 % zoom (640 × 400) the fixed header + Back + prev/next bars use ~260 px. Content reflows, no horizontal scroll. | 1.4.10 Reflow | 🟢 Minor | **Logged**: compact pushed header is a shared layout decision. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 9 | Prev / next on a job outside the list showed the disabled reason "↑ ↓ to move · Enter to open". | 3.3.2 Labels or Instructions | 🟢 Minor | **Fixed** (r2): hidden when not listed; ends say "This is the first / last job in the list". |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 10 | List rows were named by title only, so several rows were all "Frontend Engineer". | 4.1.2 Name, Role, Value | 🟡 Major | **Fixed**: `aria-labelledby` title + company ("Frontend Engineer Quill Docs"). |
| 11 | The detail had a `complementary` "Details" landmark wrapping a `region` "Details", and the chip list was also named "Details". | 1.3.1 / 4.1.2 | 🟢 Minor | **Fixed**: one "Details" region only. |

### Color Contrast Check
Measured values from `@bfhr/ui-tokens` (system.md "Allowed pairings"); every pairing used here is in the tested set.

| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Body, title, band label | `fg.primary` #161A22 / #ECEEF2 | `surface.base` #FFFFFF / #16191F | > 15:1 | 4.5:1 | ✅ |
| Meta, basis line, facts | `fg.secondary` #4B5261 / #A8AFBB | `surface.base` | 7.84:1 light | 4.5:1 | ✅ |
| Evidence quotes, impact, timestamps | `fg.tertiary` #5E6573 / #8F97A4 | `surface.base`, `surface.sunken` | ≥ 5.18:1 | 4.5:1 | ✅ |
| Matched-skill chips, "Used for Apply", Strong pill | `accent.text` #1F635D / #43BEB4 | `accent.subtle` #D3EFEC / #0D302D | 5.77 / 6.27:1 | 4.5:1 | ✅ |
| Apply (primary) | `fg.onAccent` #FFFFFF | `accent.solid` #216863 / #2B827B | 6.51 / 4.58:1 | 4.5:1 | ✅ |
| Outside-preference warning, unreachable source | `warning.text` #9C5D00 / #C18C4C | `surface.base` | ≥ 4.61:1 | 4.5:1 | ✅ |
| Links (sources, Open original) | `fg.link` #1F635D / #43BEB4 | `surface.base` | ≥ 4.5:1 | 4.5:1 | ✅ |
| Control borders (Save, Not for me, search) | `line.control` #7D8492 / #707887 | `surface.base` | 3.76:1 light | 3:1 | ✅ |
| Focus ring | `line.focus` #216863 / #43BEB4 | every surface | ≥ 3:1 | 3:1 | ✅ |

### Keyboard Navigation
Tab order at 1920 (Chromium): sidebar → search → sort info → selected row (roving, one stop for the list) → splitter → previous / next → Apply → Save → Not for me → Open original → More → breakdown toggle → Change (CV) → 👍 → 👎 → What goes into this score? → rail Apply → Greenhouse → Arbeitnow. Every stop shows the 2 px focus ring. At 1280 the folded layout keeps the same order with the sources after the description.

| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|------------|
| Job list | One stop (roving `tabIndex`) | Enter: focus the job title in the detail (≥ 980 px) or push the detail (< 980 px) | — | ↑ / ↓ and J / K move the selection and focus; the detail follows |
| Pushed detail (< 980 px) | Back, then detail | Activates | Back to the list, focus returns to the row | — |
| Screen keys | — | S save / unsave · D (or ⌫) Not for me · Shift+D Not for me with reason · A Apply · O Open original · / search (all listed in the shortcuts sheet under "Jobs", never fired in text fields) | — | — |
| Search field | After sidebar | — | Clears the search | — |
| Reason popover | Focus moves into it | Enter saves | Skips, focus back to the list | 1–9 toggle reasons |
| More menu / Change CV menu | Trigger in order | Opens | Closes, focus to trigger | ↑ / ↓ within (Radix) |
| Splitter | After the list | — | — | ← / → resize, Home / End |

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| List row | "Design Systems Engineer Pixelpost, list item, current" + "Strong match, 88 of 100", status pill "Status: Applied", "2 sources" | Fixed (#10) |
| Match section | region "How this job fits": "Partial match 52 of 100", "Hide the breakdown, expanded", basis line + "Change" button, counts | — |
| Requirement | "Met: Pays €52k–€62k per year, above your floor · Matters some", evidence paragraph | Fixed (#1) |
| Gap (corrected) | "Added to your profile. We'll update the match." (`role="status"`) + Undo | — |
| AI feedback | "This summary is helpful, toggle button, not pressed"; thanks line in a live status | — |
| Apply | "Apply on Arbeitnow (opens in your browser), button"; offline: same + "Needs a connection" description | — |
| Source link | "Greenhouse (opens in your browser), link" | — |
| Toasts | "Hidden from your feed: … Undo ⌘Z, Why?" in the "Notifications (F6)" region | — |

### Priority Fixes
1. **Keep focus on the list through route changes and hides** — keyboard triage is the screen's main loop. (Done.)
2. **Name list rows with title + company** — duplicate titles are common in job search. (Done.)
3. **Reachable source links in WebKit** — "Found on" is the trust surface. (Done.)
