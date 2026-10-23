## Accessibility Audit: Sign-in (iOS)

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23

Scope: the signed-out takeover in every state (`-BFHRSignIn email|invalid|offline|check|resent|finishing|confirm|expired|unusable|retry`) and the avatar's account menu. Evidence: XCUITest `performAccessibilityAudit()` in `apps/ios/BruteForceHRUITests/SignInAccessibilityAuditTests.swift` — every state at the default text size and at AX5 (`UICTContentSizeCategoryAccessibilityXXXL`, plus three scrolled pages per state) in English on the iPhone 17e (light) and the iPhone 17 Pro Max (dark), and email / check / confirm / unusable / retry at both sizes in Turkish and German (17e); captures reviewed in [r1](r1.md) and [r2](r2.md). Behavior tests in the same file: inline field error then Return sends, the resend countdown's VoiceOver value, Send a new link, and the real link handler (universal link and `bruteforcehr://auth/finish` hand-off). `SignInEndToEndTests` signed in against the live project and signed out from the account menu.

How the audit is scoped (same rules as the update gate and Today):

- After each scroll at AX5, contrast / Dynamic Type / clipping are logged instead of failing, because XCUITest keeps the pre-scroll frames of a scroll view's texts; the scrolled pages are saved (`sign-in-audit-*-page-N.png`) and were reviewed by eye.
- Keyboard keys and the status bar are system UI; issues without an element and elements partly off screen are logged.
- **Known false positive (German clipping prediction).** In German only, the audit reports "Text … may be clipped" for body sentences (check, confirm, retry), at the default size and AX5, while the same layout passes in English and Turkish. The German audit screenshots of every page show each line in full, hyphenated at AX5 ("Anmel-dung", "abzu-schließen"). It is logged, not failed — the update gate documents the same behavior.

### Summary

**Issues found:** 4 (all resolved) | **Critical:** 0 | **Major:** 2 | **Minor:** 2

### Findings

#### Perceivable

| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|---|---|---|---|
| 1 | A long address scrolled sideways in a one-line field ("Text clipped" on the field at AX5, and on a long value at the default size). | 1.4.4 Resize text / 1.4.10 Reflow | 🟡 Major | Resolved: vertical `TextField` that wraps; Return still submits. |
| 2 | AX5: the placeholder `name@example.com` truncated to "name@exa…". | 1.4.4 Resize text | 🟢 Minor | Resolved: no example placeholder at accessibility sizes; the visible "Email" label names the field. |
| 3 | Example addresses (placeholder, format error) rendered as accent-colored `mailto:` links, which also made the error sentence partly a link. | 1.3.1 Info and relationships | 🟡 Major | Resolved: `Text(bfhrPlain:)`. |
| — | Text on canvas: `fg-primary` / `fg-secondary`; primary button `fg-on-accent` on `accent-solid`; legal links `fg-link`; field error `danger-text` with a glyph (not color alone); success line `success-text` with ✓. | 1.4.3 Contrast, 1.4.1 Use of color | — | Pass (audit contrast checks green in light and dark). |

#### Operable

| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|---|---|---|---|
| — | Buttons use the shared `BFHRButtonStyle` (≥ 44 pt); the field is ≥ 48 pt; the avatar menu button is 44 × 44. | 2.5.5 Target size | — | Pass. |
| — | Every step has a way forward and a way back ("Use a different email"); nothing traps. Return on the keyboard sends. | 2.1.1 Keyboard, 2.1.2 No keyboard trap | — | Pass. |
| 4 | The resend countdown changes every second; a changing label would make VoiceOver re-read it. | 2.2.2 Pause, stop, hide | 🟢 Minor | Resolved by design: the label stays "Resend link"; the time is the value ("Available in 42 seconds"), checked by `testCheckEmailCountsDownResend`. |

#### Understandable

| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|---|---|---|---|
| — | Field errors appear only after Send, say how to fix the input ("Enter a full email address, like name@example.com."), and are announced. | 3.3.1 Error identification, 3.3.3 Error suggestion | — | Pass. |
| — | Each step's title is a header and takes VoiceOver focus when the step appears. | 2.4.6 Headings and labels, 3.2.2 On input | — | Pass. |

#### Robust

| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|---|---|---|---|
| — | The field is labelled "Email" (visible label hidden from VoiceOver to avoid a double read); the account menu is "Account" with "Signed in as …" and "Sign out" inside. | 4.1.2 Name, role, value | — | Pass. |

### Color Contrast Check

Token pairs as in the update gate audit (same tokens on the same canvas): `fg-primary` on `surface-canvas` 16.26:1 light / 16.39:1 dark, `fg-secondary` 7.31:1 / 8.63:1, `fg-on-accent` on `accent-solid` 6.51:1 / 4.58:1, `accent-text` 6.53:1 / 8.40:1. The rendered screens passed the audit's contrast check.

### Keyboard / VoiceOver

- [x] Title focused on each step; header trait.
- [x] Field label "Email"; errors announced after Send.
- [x] Countdown as a value, not a changing label.
- [x] Return sends (email step) / signs in (confirm step).

### Priority Fixes

None open.
