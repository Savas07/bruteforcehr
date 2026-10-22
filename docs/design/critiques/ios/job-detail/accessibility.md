# Job detail (iOS) — accessibility review

Method: `skill://accessibility-review` (WCAG 2.1 AA) applied to the r3 capture matrix, backed by
`apps/ios/BruteForceHRUITests/JobDetailAccessibilityAuditTests.swift`: Xcode's
`performAccessibilityAudit()` in design mode on the populated and empty states at the default and
the largest accessibility text size (AX5, `UICTContentSizeCategoryAccessibilityXXXL`), scrolled
page by page through the whole screen, plus the match-breakdown and Not for me reason sheets.
Run on iPhone 17e (iOS 26.5), 2026-10-22. Result bundle (local, gitignored):
`apps/ios/build/jd-1792693699.xcresult`.

## Accessibility Audit: Job detail
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-22

### Summary
**Automated audit: FAILING (open).** All five audit tests report issues. A first diagnostic run
(every issue logged with its element) showed most of them sit on elements under the translucent
navigation bar / sticky Apply bar or have no resolvable element; the test now fails only on
elements fully visible between the bars and attaches the rest as "audit-unattributed". Remaining
failures in the final run:

| Test | Contrast failed | Contrast nearly passed | Dynamic Type (partially) unsupported | Text clipped |
|---|---|---|---|---|
| Populated, default size | 11 | 9 | 14 | 7 |
| Populated, AX5 | 7 | 0 | 0 | 0 |
| Empty, default size | 3 | 6 | 8 | 1 |
| Empty, AX5 | 1 | 0 | 0 | 0 |
| Sheets (breakdown, reasons) | 1 | 1 | 1 | 8 |

Manual review (below): **Critical 0 · Major 0 · Minor 3**. The automated findings are not yet
reconciled with it; see "Open".

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Band shown by color in the bar | 1.4.1 Use of Color | — (passes) | The band is named in text ("Strong match"), the bar has text labels and is hidden from VoiceOver |
| 2 | Status glyphs (met / partly / gap / not stated) | 1.4.1 | — (passes) | Each row states the status in words ("Meets this", "Partly", "Not in your CV yet", "Not stated") |
| 3 | Section headers and footers ("How it fits", "Collected from public job sites…") use the system grouped-list secondary label color; the audit rates them "nearly passed" | 1.4.3 Contrast | 🟢 Minor | System style (HIG); keep unless the audit confirms a real < 4.5:1 ratio |
| 4 | Band legend and the sticky Apply bar stop growing (xLarge / AX1) | 1.4.4 Resize Text | 🟢 Minor | Deliberate: the band is named above the legend at full size; the bar offers the Large Content Viewer; content above is never capped |

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

The audit's "Contrast failed" on `Fg.primary` text (e.g. "Remote role you can take from Türkiye",
"Employment type") contradicts these ratios; see "Open".

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
1. **Reconcile the automated audit** (open) — attribute each remaining failure to an element (the
   diagnostic logging is in the test's git history: commit "test(ios): job detail audit fails on
   visible content issues…" replaced it), fix real ones, document deliberate ones. Candidates:
   system list header/footer colors; SwiftUI `Text` with system text styles reported as
   "partially unsupported" at the default size; inline navigation titles truncating in sheets.
2. Nothing else blocking from the manual review.

## Open
- `JobDetailAccessibilityAuditTests` does not pass yet (counts above). Not resolved in M0 for
  lack of run time: each audit run holds the shared simulator lock for 15–40 minutes.
