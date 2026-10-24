# Saved searches (desktop) — accessibility review

Method: `pnpm --filter @bfhr/desktop capture:design saved-searches --states populated,empty,loading,error,offline --themes light,dark --sizes 1280x800,1920x1080 --axe` (axe-core, WCAG 2.1 A/AA, WebKit ≈ WKWebView and Chromium ≈ WebView2; reports in `artifacts/a11y/desktop/saved-searches-*.json`), an ad-hoc axe run on the Save search popover (after Mod+S) and on the dialog after Run now (de-DE, light + dark, both engines), Playwright accessibility-tree snapshots of the list, and the keyboard flows in `SavedSearches.test.tsx` (Mod+S, Undo, radios, switches, Run now, Delete + Undo). Contrast comes from the token pairings tested in `@bfhr/ui-tokens` (`contrastPairs()`).

## Accessibility Audit: Jobs — saved searches
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary
**Issues found:** 7 | **Critical:** 0 | **Major:** 3 (all fixed) | **Minor:** 4 (3 fixed, 1 logged)

axe after the fixes: 0 critical · 0 serious · 0 moderate · 0 minor in all 20 matrix runs and in the 12 ad-hoc runs (popover, filter-bar button, Run now result). "Needs review" items are the Radix focus guards (`aria-hidden-focus` on `data-radix-focus-guard`, expected), the job list behind the modal scrim, and, in Chromium, text on the popover's `surface.elevated` that axe can't resolve through the overlay; those pairings are in the tested set (table below).

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Cadence radios were labelled by the whole option row, so each was announced as label + explanation ("Daily digest We check once a day and send one summary"), and the explanation again as the description. | 1.3.1 Info and Relationships | 🟢 Minor | **Fixed**: `aria-labelledby` the option label, `aria-describedby` the hint. |
| 2 | Disabled Run now offline was explained only in the tooltip. | 3.3.2 Labels or Instructions | 🟡 Major | **Fixed**: visible footnote above the footer ("Run now needs a connection. Changes you make here are saved on this device and sync when you're back online."); the button keeps "Needs a connection" as its accessible description. |
| 3 | Alerts on/off by colour. | 1.4.1 Use of Color | — | Pass: Radix switches expose `checked`; rows also say "Off" / the cadence in text. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 4 | Dialog opened with focus on Close, so the list wasn't reachable with arrows until tabbing. | 2.4.3 Focus Order | 🟡 Major | **Fixed**: focus starts on the selected row; the list is one Tab stop (roving `tabIndex`), ↑ / ↓ / Home / End move selection and focus, the editor follows. |
| 5 | Delete's Undo toast sits behind the modal (inert), so it can't be reached while the dialog is open. | 2.1.1 Keyboard | 🟡 Major | **Fixed**: an inline "Deleted “…” · Undo" status bar inside the dialog; after closing, the toast and Mod+Z still undo. |
| 6 | Mod+S is bound only while the Save search button is mounted. | 2.1.4 Character Key Shortcuts | — | Pass: it's a modified chord, listed in the shortcuts sheet under "Jobs"; disabled (with the reason) when nothing can be saved. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 7 | Empty name / query fields were silently reverted. | 3.3.1 Error Identification | 🟢 Minor | **Fixed**: "Give this search a name." / "Enter what to search for." under the field, `aria-invalid`, linked with `aria-describedby`; the stored value is kept. |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 8 | The saved button's `aria-label` ("Saved as “react · Remote”. Edit alert") didn't contain its visible label; naming list rows by the search name only (tried in r1) did the same (axe `label-content-name-mismatch`, serious). | 2.5.3 Label in Name | 🟢 Minor | **Fixed**: both use their visible text as the accessible name. Rows read "React · Remote Europe “react typescript frontend” · Remote · … Daily digest · Strong matches Checked 2 hours ago"; switches are "Alerts for “React · Remote Europe”". |
| 9 | Dialog loading / error panes aren't reachable in the design captures because the Jobs screen shows its own skeleton / error first. | 4.1.3 Status Messages | 🟢 Minor | **Logged** for DesktopJobs; the dialog's `SkeletonRegion` (`aria-busy`, "Loading saved searches") and `PaneError` (focus on Try again) are the shared, audited components. |

### Color Contrast Check
| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Names, values, radio labels | `fg.primary` | `surface.elevated` | > 15:1 | 4.5:1 | ✅ |
| Criteria, hints, status line | `fg.secondary` | `surface.elevated`, `surface.selected` | ≥ 7:1 light | 4.5:1 | ✅ |
| Alert + last-check lines | `fg.tertiary` | `surface.elevated`, `surface.selected` | ≥ 4.6:1 | 4.5:1 | ✅ |
| Run now, Done (primary) | `fg.onAccent` | `accent.solid` | 6.51 / 4.58:1 | 4.5:1 | ✅ |
| "Edit filters in Jobs", result check | `accent.text` | `surface.elevated` | ≥ 4.5:1 | 4.5:1 | ✅ |
| Delete | `danger.text` | `danger.subtle` | ≥ 4.5:1 | 4.5:1 | ✅ |
| Switch track off / radio ring | `line.control` | `surface.elevated` | ≥ 3:1 | 3:1 | ✅ |
| Focus ring | `line.focus` | every surface | ≥ 3:1 | 3:1 | ✅ |

### Keyboard Navigation
| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|------------|
| Save search (filter bar) | After the filter pills | Saves (or opens the popover when saved); Mod+S anywhere on Jobs | — | — |
| Alert popover | Focus moves to Name; then radios (one stop), threshold (one stop), Delete search, Done | Enter in Name commits; Space selects | Closes, keeps edits, focus back to the button | ↑ / ↓ radios, ← / → threshold |
| Dialog list | One stop (selected row), then each row's switch | Space toggles a switch | Closes the dialog | ↑ / ↓ / Home / End move the selection |
| Editor | Name → Search for → Edit filters in Jobs → radios → digest switch (As they arrive only) → threshold | Enter commits a text field | Closes the dialog | as above |
| Footer | Delete → Show results → Run now (disabled offline, still focusable with its reason) | Activates | — | — |

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| Save toast | "Search saved, Undo ⌘Z, Edit" in the "Notifications (F6)" region | — |
| Row switch | "Alerts for “Istanbul · hybrid”, switch, off" | — |
| Cadence radio | "Daily digest, radio button, checked, 2 of 4" + "We check once a day and send one summary." | Fixed (#1) |
| Run now | Progress "Searching job sources…" (`role="status"`), then "Checked just now · 12 new jobs · Adzuna skipped: no key" (`role="status"`); errors `role="alert"` with Try again | — |
| Delete | "Deleted “React · Remote Europe”" (`role="status"`) + Undo | Fixed (#5) |

### Priority Fixes
1. **Start focus in the list** (done).
2. **Reachable Undo for Delete inside the modal** (done).
3. **Explain disabled Run now in text** (done).
