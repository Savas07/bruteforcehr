# Jobs feed, Saved searches and Apply (iOS) — accessibility review

Method: `skill://accessibility-review` (WCAG 2.1 AA) applied to the r2 capture matrix, backed by
`apps/ios/BruteForceHRUITests/JobsAccessibilityAuditTests.swift`: Xcode's
`performAccessibilityAudit()` in design mode, first viewport plus scrolled pages, at the default
and the largest accessibility size (AX5, `UICTContentSizeCategoryAccessibilityXXXL`), and four
interaction checks. iPhone 17 Pro, iOS 26.5, Xcode 26.6, shared DerivedData, inside the capture
lock, 2026-10-24. The exemption policy is the one in `../job-detail/accessibility.md` (system
chrome, content under the bars, disabled controls, issues without an element, default-size
Dynamic Type reports for `Font.bfhr`, visual checks on scrolled pages); every exempted issue is
logged as an `IGNORED (…)` activity in the result bundle.

## Accessibility Audit: Jobs feed, Saved searches, Apply
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Result
`xcodebuild test-without-building … -only-testing:BruteForceHRUITests/JobsAccessibilityAuditTests`:
**15 tests, 0 failures** (final run after the fixes below).

| Test | Screen / state | Text size | Result |
|---|---|---|---|
| `testAuditFeedPopulatedDefaultSize` | feed, populated | Large | ✅ |
| `testAuditFeedPopulatedLargestText` | feed, populated | AX5 | ✅ |
| `testAuditFeedEmptyDefaultSize` / `…LargestText` | feed, first use | Large / AX5 | ✅ |
| `testAuditSavedSearches` / `…LargestText` | Saved searches | Large / AX5 | ✅ |
| `testAuditApplyChecklist` / `…LargestText` | Apply checklist | Large / AX5 | ✅ |
| `testAuditApplyKitWithPrompt` | Apply kit + "Did you apply?" | Large | ✅ |
| `testAuditApplyEmail` | Review email | Large | ✅ |
| `testAuditImportReview` | Add a job from a link, review | Large | ✅ |
| `testNotForMeLeavesInlineUndo` | swipe Not for me → inline row → Undo | Large | ✅ |
| `testWorkModeFilter` | chip → sheet → Show results | Large | ✅ |
| `testSavedScope` | Saved scope chip | Large | ✅ |
| `testSaveSearchBannerCreatesChip` | "Get alerts for this search" | Large | ✅ |

### Summary
**Issues found:** 6 | **Critical:** 0 | **Major:** 0 | **Minor:** 6, of which 4 were found by the audit and fixed.

### Findings

#### Perceivable
| # | Issue | WCAG | Severity | Resolution |
|---|-------|------|----------|------------|
| 1 | Apply file rows read the raw file name ("Deniz-Aksoy-CV.pdf"): audit "Label not human-readable" | 1.1.1 / 2.4.6 | 🟢 Minor | **Fixed** 45278a4: "Your CV, PDF" / "Your cover letter, PDF"; Share reads "Share Your CV, PDF" |
| 2 | Scope chip count badge (translucent white on teal, grey on white) measured below 4.5:1 | 1.4.3 | 🟢 Minor | **Fixed**: solid `Surface.base` + `Accent.text` (selected, 8.7:1) / `Surface.sunken` + `Fg.primary` |
| 3 | Saved searches › Hidden jobs count in the system secondary label color: "Contrast nearly passed" | 1.4.3 | 🟢 Minor | **Fixed**: `Fg.secondary` (10.1:1) |
| 4 | AX5 mid-word breaks in the result header and the saved-search row | 1.4.4 / 1.4.10 | 🟢 Minor | **Fixed** 6111a92 (layouts stack at accessibility sizes) |
| 5 | Band shown by colour on rows | 1.4.1 | — passes | The band is named in text ("Strong match") |
| 6 | Sticky bottom bars (Apply, filter sheet "Show results") stop growing at AX1 | 1.4.4 | 🟢 Minor | Deliberate, as Job detail (r2): Large Content Viewer, content above never capped |

#### Operable
| # | Issue | WCAG | Severity | Resolution |
|---|-------|------|----------|------------|
| 1 | Swipe actions (Save, Not for me, Show in feed, Delete) | 2.5.1 | — passes | Same actions in the context menu and the VoiceOver actions rotor (`bfhrRowActions`); Save also as the visible bookmark |
| 2 | Targets: chips, bookmark, sort, ⓘ, +, radio rows, Share | 2.5.5 | — passes | ≥ 44 pt at every size |
| 3 | Undo windows (save toast, send toast 10 s) | 2.2.1 | — passes | Toasts follow D11/D12 (longer with VoiceOver); the inline hidden row keeps Undo until the list changes |

#### Understandable
| # | Issue | WCAG | Severity | Resolution |
|---|-------|------|----------|------------|
| 1 | Leaving the app | 3.2.5 | — passes | Route rows say "opens here in Safari"; Send names the recipient; the email footer states the 10-second undo |
| 2 | Disabled primary buttons | 3.3.2 | — passes | A line above the button says why ("Add a CV first.", "You're offline. Your draft stays here.") |

#### Robust
| # | Issue | WCAG | Severity | Resolution |
|---|-------|------|----------|------------|
| 1 | Scope / filter chips and radio rows | 4.1.2 | — passes | `.isSelected` trait; chip counts as accessibility value ("New: 2") |
| 2 | Bookmark | 4.1.2 | — passes | "Save" / "Remove from Saved" with the selected trait |

### Color Contrast Check (tokens)
| Element | Foreground | Background | Light / dark | Pass |
|---|---|---|---|---|
| Row title / body | `Fg.primary` | `Surface.base` | 17.4 / 15.2 | ✅ |
| Row meta, criteria | `Fg.secondary` | `Surface.base` | 10.1 / 10.9 | ✅ |
| "Salary not stated" | `Fg.tertiary` | `Surface.base` | 5.9 / 6.6 | ✅ |
| Selected chip | `Fg.onAccent` | `Accent.solid` | ≥ 4.5 (primary-button pair) | ✅ |
| Band pill, badges | `Accent.text` | `Accent.subtle` | 7.2 / 7.2 | ✅ |
