# Accessibility Audit: iOS Tracker board (Pipeline + Application detail)
**Standard:** WCAG 2.1 AA (+ Apple HIG: Dynamic Type to AX5, VoiceOver, Reduce Motion) | **Date:** 2026-10-22
Skill: `skill://accessibility-review`. Evidence: `apps/ios/BruteForceHRUITests/TrackerBoardAccessibilityAuditTests.swift`, which runs `performAccessibilityAudit()` in design mode on iPhone 17e. It covers populated and empty data at the default size and at AX5, scrolled page by page, plus the Closed scope, the Application detail (default + AX5), the Move to… sheet, the Close… sheet and the Undo toast. The test logs every issue it keeps or ignores to `artifacts/screens/ios/iphone-17e/flows/audit.log`. Token contrast was computed from `Colors.xcassets`.

### Summary
Final run (commit `5cad64b`, before the last InterviewRow fix): **9 of 12 tests pass.**

- **Pass:** Pipeline populated (default + AX5, all pages), empty (default + AX5), Closed scope, Move to… sheet, swipe → Undo → "Restored", Close… → Not selected.
- **Fail:** the detail at default size and at AX5, and the drag test (a design gap, not an a11y issue; see Operable).

**Issues found:** 4 | **Critical:** 0 | **Major:** 1 (drag path, see Operable) | **Minor:** 3

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Interview row "Round 1 · date": the lone "·" glyph was measured as low contrast. | 1.4.3 Contrast | 🟢 Minor | Fixed after the run: the line is one `Text` (same fix as the next-step line). Not re-run. |
| 2 | Detail at AX5, page 1: "Dynamic Type font sizes are unsupported" ×5. The audit names no element; the page shows timeline rows from the shared `TimelineRow` / `SourceTag`. | 1.4.4 Resize text | 🟢 Minor | Our own views all use `Font.bfhr` / `@ScaledMetric`. Reported to IosFoundation to check the shared timeline row. |
| 3 | Fixed during the rounds: system section-header grey (≈ 4.4:1) → `Fg.secondary`; `LabeledContent` values → `FactRow`; AX5 monogram squeezing the role (rows and the detail header). | 1.4.3 / 1.4.10 | — | Done (r1, r2). |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Drag onto the stage strip doesn't start in the simulator: the long-press context menu takes the gesture (`testDragOntoStageStrip` fails). Every move stays reachable without drag: long press / VoiceOver action "Move to…", leading swipe "Move to {next}", trailing swipe "Move to…" / "Close…", the detail's status pill and its ⋯ menu. | 2.5.1 Pointer gestures (satisfied: drag is never the only path) | 🟡 Major (design gap) | See r2/r3: open for the user. |
| 2 | Contact email link 16 pt tall (fixed: 44 pt row with "Email {name}"). | 2.5.5 Target size | — | Done (r2). |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Invalid moves explain themselves: disabled targets carry the D16 reason; a refused drop or move shows the reason in a toast with an error haptic. | 3.3.1 | — | Pass. |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Detail page 1: "Potentially inaccessible text" ×1, no element named (timeline area, shared `TimelineRow`). | 4.1.2 | 🟢 Minor | Reported to IosFoundation; not reproducible from our views. |

### Color Contrast Check (tokens, light / dark; `/tmp` script over `Colors.xcassets`)
| Element | Foreground | Background | Ratio (light / dark) | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Row role, headers | fg-primary | systemBackground | 17.4 / 18.1 | 4.5:1 | ✅ |
| Company, meta, day/section headers | fg-secondary | systemBackground | 7.8 / 9.5 | 4.5:1 | ✅ |
| Interview line | accent-text | systemBackground | 7.0 / 9.3 | 4.5:1 | ✅ |
| Strip chip count | fg-secondary | surface-sunken | 6.9 / 8.9 | 4.5:1 | ✅ |
| Hovered drop chip | fg-primary | accent-subtle | 14.4 / 12.2 | 4.5:1 | ✅ |
| "Not selected" / "No response" pill | status-rejected/ghosted-text | …-subtle | 4.66 / 5.23 | 4.5:1 | ✅ |
| Accepted / Interviewing / Offer / Saved pills | status-*-text | status-*-subtle | 4.62–4.71 / 5.23–5.37 | 4.5:1 | ✅ |
| Detail cell values | fg-secondary | secondarySystemGroupedBackground | 7.8 / 7.7 | 4.5:1 | ✅ |

### Ignored audit reports (each logged, with the reason, in `audit.log`)
- System tab and status bars.
- Contrast of text under the translucent nav bar, inside the iOS 26 scroll-edge band (44 pt above the tab bar), or under the toast. The audit measures this text against the blur or the overlay; the same text is clean higher up the screen.
- Scrolled pages skip contrast. The audit re-scrolls while it measures, so rows sliding under the opaque pinned stage header get measured against the header. Top-of-screen audits and the token table cover contrast.
- Disabled controls (the current stage, Accepted/Declined before an offer): inactive components are exempt.
- "Dynamic Type unsupported" at the default size: the AX5 runs of the same screens pass that check.
- "Text clipped" with no element (the strip's peeking chip, rows cut by the viewport), on shared `EmptyState` / `StatusMenu` copy, and "Potentially inaccessible text" without an element in the `StatusMenu` sheets. Reported to IosFoundation.

### Keyboard / Switch Control / VoiceOver
| Element | Announced As | Issue |
|---------|-------------|-------|
| Scope picker | "Applications to show, Active, 1 of 3" | — |
| Stage strip chip | "Interviewing 3, button. Shows this stage in the list" | — |
| Stage header | "Interviewing 3, heading, Expanded" (button toggles) | — |
| Row | role, company, next step, "Days in this stage: 12", value "Last change came from an email" when automatic; actions rotor: Move to {next} · Move to… · Close… | — |
| Toast | announced on show; Undo ≥ 44 pt, full width at AX/VoiceOver (shared host) | — |
| Detail pill | "Status: Interviewing, Changes the status" | — |
| Timeline auto row | sentence + reason + "Automatic · Mail" + View source / Undo actions | — |
| Contact | "Email Marcus Reid", hint = address | — |

Reduce Motion: chevron rotation, strip scroll and chip scale use `BFHRMotion`; hover scale is off under Reduce Motion.

### Priority Fixes
1. **Drag path** (design gap; the other two move paths cover every user, including VoiceOver and Switch Control).
2. **Shared `TimelineRow` Dynamic Type / inaccessible-text reports**: IosFoundation to check.
3. Re-run `testApplicationDetail*` after the InterviewRow fix.
