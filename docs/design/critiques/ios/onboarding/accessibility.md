## Accessibility Audit: Onboarding (iOS)
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-25

Method: XCUITest `performAccessibilityAudit()` in `apps/ios/BruteForceHRUITests/OnboardingAccessibilityAuditTests.swift` on every design state (`-BFHROnboarding`: `cv`, `cv-reading`, `cv-found`, `cv-error`, `preferences`, `preferences-cv`, `preferences-filled`, `finish`, `finishing`, `finish-existing`, `finish-failed`, `finish-nothing`) at the default size and AX5 (`UICTContentSizeCategoryAccessibilityXXXL`), each page down the scroll; TR and DE for `cv`, `cv-found`, `preferences-filled`, `finish`; plus behavior checks (`testFlowFromScratchToFinish`, `testNothingToSearchGoesBack`). Audit policy as the Tracker / Share / Job detail suites: system navigation-bar items are skipped (iOS caps them), Dynamic Type reports and clipping predictions at the default size are covered by the AX5 run, screenshot checks after a scroll and content under the sticky bottom bar's material are logged, hung audits (-56) retry. Manual: captures in light / dark, both devices, default / AX5 (r1, r2), and the live run.

### Summary
**Round 1 (local, 2026-10-24):** 187 recorded issues before the policy; after it — Hit area 3 elements, Label not human-readable 1, Dynamic Type 1 (Period label at AX5), contrast under the bars 6 (policy), audit hangs 2.
**After fixes:** all seven tests pass locally (iPhone 17 Pro, iOS 26): `testOnboardingDefaultSize`, `testOnboardingAccessibilitySize`, `testJobPreferencesDefaultAndAccessibilitySize`, `testTurkishAndGerman`, `testFlowFromScratchToFinish`, `testNothingToSearchGoesBack`, `testSettingsRowsOpenEditors`; and on CI in the `ui-audits` matrix (`UI audit (OnboardingAccessibilityAuditTests)`, see the PR run). **Critical: 0 · Major: 0 · Minor: 0 open.**

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Resolution |
|---|-------|---------------|----------|----------------|
| 1 | "Scan_0042.pdf" was read with its underscore ("Label not human-readable"). | 1.1.1 / 4.1.2 | 🟢 Minor | Fixed: file names are spoken with spaces (`spokenFileName`). |
| 2 | The CV progress spinner was its own element (and a "small hit area"). | 1.3.1 | 🟢 Minor | Fixed: hidden from VoiceOver; "Reading your CV…" says it. |
| 3 | Step state conveyed by the bar only? | 1.4.1 | — | No: "Step 2 of 3" is text and announced on every step change. |
| 4 | Chip selection by color only? | 1.4.1 | — | No: ✓ glyph, emphasized label, and VoiceOver "switch, on / off". |

#### Operable
| # | Issue | WCAG Criterion | Severity | Resolution |
|---|-------|---------------|----------|----------------|
| 1 | "How to get it" (15.7 pt tall), the trash "Remove" (16 × 19 pt) and "Cancel" were below 44 pt. | 2.5.5 | 🟡 Major | Fixed: 44 pt frames with content shapes. |
| 2 | The number pad couldn't be closed and covered the next questions. | 2.1.1 | 🟡 Major | Fixed: Done above the number pad; scrolling dismisses the keyboard. |
| 3 | Finish's busy state used the disabled style. | 1.4.3 | 🟢 Minor | Fixed: keeps its colors; taps ignored while busy. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Resolution |
|---|-------|---------------|----------|----------------|
| 1 | Errors (wrong type, too large, scan, offline, AI off, daily limit) are named in the row with the next step; Finish's refused write says what to do. | 3.3.1 | — | Pass. |
| 2 | Every field has a label (name, role, place, salary amount, period, currency). | 3.3.2 | — | Pass. |

#### Robust
| # | Issue | WCAG Criterion | Severity | Resolution |
|---|-------|---------------|----------|----------------|
| 1 | The salary period's system menu label didn't scale at AX5. | 1.4.4 | 🟢 Minor | Fixed: our own "Period" label above a label-less picker at AX sizes; segmented at default sizes. |
| 2 | Work-authorization answers are segmented controls named by their question. | 4.1.2 | — | Pass. |

### Color Contrast Check
Tokens only (`BFHRColor` / `BFHRTone`), same pairs as the audited screens: primary / secondary text on grouped backgrounds, accent text on accent-subtle chips, warning text on warning-subtle. The audit passes them in light and dark at both sizes; the only contrast reports were content under the sticky bar's blur and the navigation bar's glass (policy above).

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| Step header | "Step 1 of 3", then the title (header trait) | — |
| Option row | "Upload a file, PDF, Word (DOCX) or JSON Resume · up to 20 MB, button" | — |
| Role token ✕ | "Remove Product Designer, button" | — |
| Market chip | "Germany, switch button, on" | — |
| Finish summary row | "Where, Germany, Netherlands and United Kingdom" | — |
| Busy Finish | "Setting up your search…, button" | — |

### Priority Fixes
None open.
