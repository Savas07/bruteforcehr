# Settings (iOS): accessibility audit

## Accessibility Audit: Settings sheet (root and pages), Data & privacy entry
**Standard:** WCAG 2.1 AA (+ Apple HIG accessibility) | **Date:** 2026-10-24

Evidence: `apps/ios/BruteForceHRUITests/SettingsMailAccessibilityAuditTests.swift` runs XCUITest `performAccessibilityAudit()` (all audit types) on every Settings page in design mode (`-BFHRScreen settings -BFHRSettingsPage …`), populated at the default size and at AX5 (`UICTContentSizeCategoryAccessibilityXXXL`), the empty root, and the disconnect alert. Final run on iPhone 17e (iOS 26), shared DerivedData:

| Test | Result |
|---|---|
| `testSettingsDefaultSize` (root, mail-accounts, mail-account, job-sources, companies, notifications, notifications-off, ai) | ✅ passed |
| `testSettingsAccessibilitySize` (same pages at AX5) | ✅ passed |
| `testSettingsEmpty` | ✅ passed |
| `testDisconnectConfirmation` | ✅ passed |

Every issue fails the test except the exemptions below; each issue is printed (`AUDIT ignored (…)` / `AUDIT FAILED …`) with its element and frame.

### Summary
**Issues found:** 8 (across 3 audit rounds) | **Critical:** 0 | **Major:** 3 (fixed) | **Minor:** 5 (fixed)

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Section headers and footers (system grey on the grouped background) nearly failed contrast. | 1.4.3 Contrast | 🟢 Minor | Fixed: `Fg.secondary`. |
| 2 | Trailing values (`LabeledContent` default tertiary grey) nearly failed contrast. | 1.4.3 Contrast | 🟡 Major | Fixed: values in `Fg.secondary`. |
| 3 | Server details read as bare hosts ("imap.mail.me.com:993") — not human-readable without the row title. | 1.3.1 / 2.4.6 | 🟢 Minor | Fixed: titled rows, combined into one element ("Incoming server (IMAP), imap.mail.me.com:993"). |
| 4 | Status shown by colour (amber) on the root. | 1.4.1 Use of Color | 🟢 Minor | Met: dot + "Check"/"Needs attention" words; VoiceOver reads the full phrase. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 5 | Disconnect confirmation: the safe choice wasn't reachable as a visible button in the iOS 26 action sheet. | 2.1.1 / 3.3.4 | 🟡 Major | Fixed: `.alert` with "Keep connected" as the cancel button (test asserts both buttons). |
| 6 | Paused companies only resumable by swipe. | 2.1.1 | 🟢 Minor | Met: `bfhrRowActions` adds the context menu and VoiceOver actions. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 7 | Notifications toggles with iOS permission off looked pointless. | 3.3.2 | 🟢 Minor | Fixed (r1): the permission card says the choices are kept; "Open iOS Settings" deep-links to the app's page. |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 8 | Quiet-hours value is a glyph + times. | 4.1.2 | 🟡 Major | Fixed (r1): accessibility label "Quiet 22:30–08:00". |

### Color Contrast Check
| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Row values | `fg-secondary` | `surface-base` | audit pass | 4.5:1 | ✅ |
| Headers / footers | `fg-secondary` | grouped background | audit pass | 4.5:1 | ✅ |
| "Check" value | `warning-text` | `surface-base` | audit pass | 4.5:1 | ✅ |
| Load-error alert | `warning-text` | `warning-subtle` | audit pass | 4.5:1 | ✅ |

(Ratios are the audit's verdict in light and dark design captures; token values come from `@bfhr/ui-tokens`.)

### Screen Reader
[INFERENCE] From labels in code (the audit verifies they exist); not recorded with VoiceOver.

| Element | Announced As | Issue |
|---------|-------------|-------|
| Mail accounts row | "Mail accounts, Needs attention, button" | — |
| Notifications row | "Notifications, Quiet 22:30–08:00, button" | — |
| Appearance | "Appearance, System, pop-up button" | — |
| Language | "Language, English, link" (opens iOS Settings) | — |

### Documented audit exemptions
Shared with `JobsAccessibilityAuditTests` (job-detail/accessibility.md), each logged:
- issues with no element; system chrome (tab bar, status bar, navigation bar and its glass buttons, e.g. Done); disabled controls (1.4.3 exempts them);
- Dynamic Type / clipping at the default size (text styles scale; the AX5 run measures real layout);
- elements outside the content rect (under the navigation bar, a sheet's sticky bar or the tab bar, minus the 24 pt scroll-edge fade): the audit samples iOS 26's blurred bar backdrop.

### Priority Fixes
None open.
