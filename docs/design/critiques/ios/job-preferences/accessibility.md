## Accessibility Audit: Settings › Job preferences (iOS)

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-25

Method: `OnboardingAccessibilityAuditTests.testJobPreferencesDefaultAndAccessibilitySize` (the page and all six section pages, `-BFHRScreen settings -BFHRSettingsPage job-preferences[-<section>]`, default and AX5, each page down the scroll), `testTurkishAndGerman` (page, Where, Work authorization in TR and DE), `testSettingsRowsOpenEditors` (row → page → Seniority → chip → back shows "Principal"); same audit policy as [onboarding](../onboarding/accessibility.md). Manual: the full capture matrix (r1, r2) and the live run (Seniority saved from this page).

### Summary

**Round 1:** "Where" section header repeating the navigation title failed contrast under the scroll edge (job-preferences-location, EN / TR / DE); the "Period" picker label at AX5 (Dynamic Type, clipped).
**After fixes:** the three tests pass locally (`OnboardingAccessibilityAuditTests`, iPhone 17 Pro simulator, iOS 26.5, re-run 2026-10-25). **Critical: 0 · Major: 0 · Minor: 0 open.**

### Findings

#### Perceivable

| #   | Issue                                                                                   | WCAG Criterion | Severity | Resolution                                |
| --- | --------------------------------------------------------------------------------------- | -------------- | -------- | ----------------------------------------- |
| 1   | Section header repeated the page title and sat under the scroll-edge effect (contrast). | 1.4.3          | 🟢 Minor | Fixed: no section title on section pages. |
| 2   | Summary values are full text at every size (no truncation).                             | 1.4.4          | —        | Pass.                                     |

#### Operable

| #   | Issue                                                                                | WCAG Criterion | Severity | Resolution |
| --- | ------------------------------------------------------------------------------------ | -------------- | -------- | ---------- |
| 1   | Rows are full-width navigation links (≥ 44 pt); tokens' ✕ and Add buttons are 44 pt. | 2.5.5          | —        | Pass.      |

#### Understandable

| #   | Issue                                                   | WCAG Criterion | Severity | Resolution |
| --- | ------------------------------------------------------- | -------------- | -------- | ---------- |
| 1   | Load failure now says what failed and offers Try again. | 3.3.1          | 🟢 Minor | Fixed.     |

#### Robust

| #   | Issue                | WCAG Criterion | Severity | Resolution                      |
| --- | -------------------- | -------------- | -------- | ------------------------------- |
| 1   | Period label at AX5. | 1.4.4          | 🟢 Minor | Fixed (shared with onboarding). |

### Screen Reader

| Element      | Announced As                               | Issue |
| ------------ | ------------------------------------------ | ----- |
| Settings row | "Job preferences, Mobile Engineer, button" | —     |
| Summary row  | "Salary floor, €55,000 a year, button"     | —     |
| Loading      | "Loading your preferences…"                | —     |

### Priority Fixes

None open.
