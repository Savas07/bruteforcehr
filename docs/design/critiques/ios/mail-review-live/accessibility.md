# Mail review on live data (iOS): accessibility audit

## Accessibility Audit: review sheet with interview suggestion, email sheet, Updates with Add interview, inbox-check card

**Standard:** WCAG 2.1 AA (+ Apple HIG accessibility) | **Date:** 2026-10-24

Evidence: `apps/ios/BruteForceHRUITests/MailReviewAccessibilityAuditTests.swift` (`testLivePanes` + the M0 tests) runs `performAccessibilityAudit()` on the Mail tab and the live panes at the default size and AX5; `TodayAccessibilityAuditTests` and `TrackerBoardAccessibilityAuditTests` cover Today's mail section and the timeline email row. Final runs on iPhone 17e (iOS 26), shared DerivedData:

| Test                                                                                               | Result    |
| -------------------------------------------------------------------------------------------------- | --------- |
| `MailReviewAccessibilityAuditTests` (populated / empty × default / AX5, review sheet)              | ✅ passed |
| `testLivePanes` (review, email, add-interview, scanning × default / AX5)                           | ✅ passed |
| `TodayAccessibilityAuditTests` (5 tests)                                                           | ✅ passed |
| `TrackerBoardAccessibilityAuditTests` (21 tests, incl. `testDetailM3` with the email timeline row) | ✅ passed |

### Summary

**Issues found:** 6 | **Critical:** 0 | **Major:** 3 (fixed) | **Minor:** 3 (fixed or verified)

### Findings

#### Perceivable

| #   | Issue                                                                         | WCAG Criterion | Severity | Recommendation                                   |
| --- | ----------------------------------------------------------------------------- | -------------- | -------- | ------------------------------------------------ |
| 1   | Email sheet time in `Fg.tertiary` beside the sender.                          | 1.4.3          | 🟢 Minor | Fixed: stacked, `Fg.secondary`.                  |
| 2   | Email / review sheet bottom bars measured against the email behind the glass. | 1.4.3          | 🟡 Major | Fixed: opaque bars.                              |
| 3   | Email sheet at AX5 in the medium detent clipped the header.                   | 1.4.4 / 1.4.10 | 🟡 Major | Fixed: full-height sheet at accessibility sizes. |

#### Operable

| #   | Issue                                | WCAG Criterion | Severity | Recommendation        |
| --- | ------------------------------------ | -------------- | -------- | --------------------- |
| 4   | Bars took most of the screen at AX5. | 1.4.10         | 🟡 Major | Fixed: capped at AX1. |

#### Understandable / Robust

| #   | Issue                                       | WCAG Criterion | Severity | Recommendation                                                               |
| --- | ------------------------------------------- | -------------- | -------- | ---------------------------------------------------------------------------- |
| 5   | Interview suggestion conveyed by an icon.   | 1.1.1          | 🟢 Minor | Met: the card's title and time are text; Add interview is a labelled button. |
| 6   | Timeline "Open email" must name its target. | 2.4.4          | 🟢 Minor | Met: the row reads "Email from {sender}, {subject}" before the button.       |

### Documented audit exemptions

The Settings policy ([../settings/accessibility.md](../settings/accessibility.md)) plus one verified exemption: at AX5 the audit reports the email sheet's header lines ("Marcus Reid", "2 days ago, 10:30 AM", "marcus@brightwave.io → deniz.aksoy@example.com") as clipped although they wrap in full (`mail-live-shots/live-email-large-ax.png`), the same audit behaviour the Tracker audit documents as `verifiedWrappedLabels`.

### Priority Fixes

None open.
