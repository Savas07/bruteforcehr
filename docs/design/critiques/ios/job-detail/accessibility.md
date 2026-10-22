# Job detail (iOS) — accessibility review

Method: `skill://accessibility-review` (WCAG 2.1 AA) applied to the r3 capture matrix, backed by
`apps/ios/BruteForceHRUITests/JobDetailAccessibilityAuditTests.swift`: Xcode's
`performAccessibilityAudit()` in design mode on the populated and empty states at the default and
the largest accessibility text size (AX5, `UICTContentSizeCategoryAccessibilityXXXL`), scrolled
page by page through the whole screen, plus the match-breakdown and Not for me reason sheets.
Run on iPhone 17e (iOS 26.5, Xcode 26.6), shared DerivedData
`~/Library/Developer/Xcode/DerivedData/BFHR-shared`, built inside the capture lock, 2026-10-23.

## Accessibility Audit: Job detail
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23

### Result
`xcodebuild test-without-building … -only-testing:BruteForceHRUITests/JobDetailAccessibilityAuditTests/<test>`:
**5 tests, 0 failures.**

| Test | Dataset | Text size | What it audits | Result |
|---|---|---|---|---|
| `testAuditPopulatedDefaultSize` | populated | Large | first viewport + 6 scrolled pages | ✅ passed |
| `testAuditPopulatedLargestText` | populated | AX5 | first viewport + 16 scrolled pages | ✅ passed |
| `testAuditEmptyDefaultSize` | empty | Large | first viewport + 3 scrolled pages | ✅ passed |
| `testAuditEmptyLargestText` | empty | AX5 | first viewport + 8 scrolled pages | ✅ passed |
| `testAuditSheets` | populated | Large | match breakdown sheet, Not for me reason sheet | ✅ passed |

(`testCaptureJourney` is the critique-capture helper, skipped in normal runs.)

**Exemptions** (the same policy as Today and Mail review). Every other issue fails the test; each
exempted one is logged as an `IGNORED (…)` activity and an `AUDIT ignored` line in the result
bundle, never silently:
1. **System chrome** — tab bar, status bar, navigation bar and its glass toolbar buttons (Back, Share, Open original, More): outside this screen's content.
2. **Under bars / off screen** — elements not fully inside the content area (below the navigation bar, above the sticky Apply bar or the sheet's bottom, minus the 24 pt scroll-edge fade). The audit reads contrast and clipping from a screenshot, and iOS 26 blurs content under the translucent bars. The Apply bar itself stops at AX1 on purpose and offers the Large Content Viewer (r2).
3. **Disabled controls** — e.g. "Save reason" before a reason is picked (WCAG 1.4.3 exempts inactive components).
4. **No element** — the audit can't say what the issue refers to (mostly "Text clipped" / "Dynamic Type unsupported" during scrolled pages).
5. **Dynamic Type / text clipping at the default size** — SwiftUI text-style fonts (`Font.bfhr`) are reported as fixed yet scale; the same screens pass these checks in the AX5 runs against the real layout.
6. **Visual checks on scrolled pages** — after a scroll, SwiftUI `List` cells keep stale accessibility frames, so contrast, Dynamic Type and clipping measure other pixels. They run on the first viewport of every state and size; contrast is also covered by the token table below, and scaling by the scrolled AX5 captures (`artifacts/screens/ios/iphone-17e/job-detail-*-scroll*-light-ax.png`).

Ignored counts in the final run: populated default 107 (40 rule 5, 34 rule 6, 30 rule 4, 3 rule 2), populated AX5 89 (62 rule 6, 24 rule 4, 3 rule 2), empty default 48, empty AX5 58, sheets 21 (14 rule 5, 6 rule 1, 1 rule 2). No exemption is specific to this screen.

### Summary
**Issues found:** 5 | **Critical:** 0 | **Major:** 0 | **Minor:** 5 — one fixed after the audit (Perceivable #3), the rest pass or are deliberate (documented below).

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Band shown by color in the bar | 1.4.1 Use of Color | — (passes) | The band is named in text ("Strong match"), the bar has text labels and is hidden from VoiceOver |
| 2 | Status glyphs (met / partly / gap / not stated) | 1.4.1 | — (passes) | Each row states the status in words ("Meets this", "Partly", "Not in your CV yet", "Not stated") |
| 3 | Audit: section headers and footers ("How it fits", "Details", "Requirements") "Contrast nearly passed" in the system grouped-list header color | 1.4.3 Contrast | 🟢 Minor | **Fixed**: headers and footers use `Fg.secondary` (7.0:1 on the grouped background), as in Mail review |
| 4 | The sticky Apply bar stops growing at AX1 | 1.4.4 Resize Text | 🟢 Minor | Deliberate: the bar would otherwise cover half the screen at AX5 (r2); it offers the Large Content Viewer and content above it is never capped. The band legend now uses the shared current-band-only label (my local cap was removed) |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Targets: Apply, Save, toolbar buttons, thumbs, gap buttons, source rows | 2.5.5 Target Size | — (passes) | All ≥ 44 pt at every size |
| 2 | Swipe on a gap row ("I have this") | 2.5.1 Pointer Gestures | — (passes) | Same action as a visible button and in the VoiceOver actions rotor (`bfhrRowActions`) |
| 3 | Toast with Undo times out | 2.2.1 Timing Adjustable | 🟢 Minor | Shared toast: 6 s / 10 s with VoiceOver; the hidden banner keeps Undo afterwards |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | External links | 3.2.5 Change on Request | — (passes) | ↗ glyph plus "Opens in your browser" hint on Apply, Open original and source rows |
| 2 | AI output | — | — (passes) | "AI summary · can be wrong" badge; rule-based reasons carry their evidence quote |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Match card | 4.1.2 Name, Role, Value | — (passes) | One element: "Strong match, 84 of 100. Based on “Base CV — English” · updated 7 hours ago" |
| 2 | Save | 4.1.2 | — (passes) | Label "Save" / "Saved" with the selected trait |
| 3 | Thumbs | 4.1.2 | — (passes) | "Useful" / "Not useful", selected trait when rated |

### Color Contrast Check (token pairs, computed from `BFHRDesignTokens` Colors.xcassets)
| Element | Foreground | Background | Ratio light / dark | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Title, reasons, body | `Fg.primary` | `Surface.base` | 17.4 / 15.2 | 4.5:1 | ✅ |
| Meta, evidence, values | `Fg.secondary` | `Surface.base` | 10.1 / 10.9 | 4.5:1 | ✅ |
| Impact / status tags | `Fg.secondary` | `Surface.sunken` | 8.9 / 12.1 | 4.5:1 | ✅ |
| Band label, links, plain buttons | `Accent.text` | `Surface.base` | 8.7 / 9.0 | 4.5:1 | ✅ |
| Skill chips, direct badge | `Accent.text` | `Accent.subtle` | 7.2 / 7.2 | 4.5:1 | ✅ |
| Apply label | `Fg.onAccent` | `Accent.solid` | 6.5 / 4.6 | 4.5:1 | ✅ |
| AI badge | `info.text` | `info.subtle` | 4.6 / 5.3 | 4.5:1 | ✅ |
| Button / chip borders | `Line.control` | `Surface.base` | 5.4 / 5.8 | 3:1 | ✅ |
| Band bar marker / filled segment | `Chart.series` | `Surface.base` | 6.5 / 5.7 | 3:1 | ✅ |
| Section headers / footers | `Fg.secondary` | grouped background | 7.0 / 9.5 | 4.5:1 | ✅ |

The audit's own contrast check passes on the first viewport of every audited state and size and
on both sheets. Earlier "Contrast failed" reports on `Fg.primary` text (17:1 by the tokens) came
from scrolled pages and from content under the glass bars — exemptions 2 and 6.

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| Header title | "Senior Frontend Engineer, heading" | — |
| Match card | "Strong match, 84 of 100. Based on “Base CV — English” · updated 7 hours ago" | — |
| Counts | "Requirements: 2 of 3 met, Skills: 5 of 6 match, Gaps to consider: 1" | — |
| Reason row | label + "Posting: “…”" + "Matters most" (one element) | — |
| Gap row | "Not in your CV yet: Vue.js, Posting: “Vue.js”, Matters some"; buttons "I have this", "Add to CV…"; rotor actions | — |
| Source row | "Workable, Direct from employer, Used for Apply, Posted yesterday, link", hint "Opens in your browser" | — |
| Apply | "Apply on company site, button", hint "Opens in your browser" | — |
| Band bar | hidden (decorative) | — |

### Priority Fixes
1. **Section header / footer contrast** — fixed (Perceivable #3).
2. Nothing else blocking. The Apply bar's AX1 cap is deliberate (Perceivable #4).

## Resolution
- `swift test` (packages/swift/BFHRUI): 118 tests in 13 suites passed.
- `JobDetailAccessibilityAuditTests` on iPhone 17e, final run 2026-10-23: **5 tests, 0 failures**
  (table above). Every exempted issue is listed as an `IGNORED (…)` activity in the result bundle.
