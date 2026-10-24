# Connect email (iOS): accessibility audit

## Accessibility Audit: Connect email sheet (providers, OAuth pre-permission, app-password form, inbox check, result)
**Standard:** WCAG 2.1 AA (+ Apple HIG accessibility) | **Date:** 2026-10-24

Evidence: `apps/ios/BruteForceHRUITests/SettingsMailAccessibilityAuditTests.swift` runs XCUITest `performAccessibilityAudit()` (all audit types) on every connect step in design mode (`-BFHRScreen mail-connect -BFHRConnectStep …`) at the default size and at AX5. Final runs on iPhone 17e (iOS 26), shared DerivedData:

| Test | Result |
|---|---|
| `testConnectDefaultSize` (all 16 steps) | ✅ passed |
| `testConnectAccessibilitySize` (all 16 steps at AX5) | ✅ passed |

### Summary
**Issues found:** 9 (across 4 audit rounds) | **Critical:** 0 | **Major:** 4 (fixed) | **Minor:** 5 (fixed or accepted with reason)

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Password caption "Not your regular password: the one you just created." nearly failed contrast (footer grey). | 1.4.3 | 🟢 Minor | Fixed: `Fg.secondary`. |
| 2 | Section headers, trust footer nearly failed contrast. | 1.4.3 | 🟢 Minor | Fixed: `Fg.secondary`. |
| 3 | "Choose another provider" / "Done" in a glass bottom bar measured against the content behind. | 1.4.3 | 🟡 Major | Fixed: opaque bar on `Surface.base`. |
| 4 | Email address and server host clipped at AX5 (single-line fields). | 1.4.4 Resize text | 🟡 Major | Fixed: fields wrap (1–3 lines). |
| 5 | Scan "Connected to …" clipped at AX5 inside a fixed row. | 1.4.4 | 🟡 Major | Fixed: wrapping first-baseline HStack. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 6 | Show-password button below 44 pt. | 2.5.5 (AAA) / HIG | 🟢 Minor | Fixed: 44 × 44 pt with a label "Show password"/"Hide password". |
| 7 | Sticky bar covered most of the screen at AX5. | 1.4.10 Reflow | 🟡 Major | Fixed: bar capped at AX1 (`dynamicTypeSize(...accessibility1)`); the form above scales fully. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 8 | Errors must say what to fix. | 3.3.1 / 3.3.3 | 🟢 Minor | Met: every server reason has its own message and marks its field (port pairs listed in words); failures are posted as VoiceOver announcements. |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 9 | Inbox-check stages show state by symbol. | 4.1.2 / 1.4.1 | 🟢 Minor | Met: each stage row is one element whose value states its state (`scan.stage.done` / `.current` / `.pending`). |

### Color Contrast Check
| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Not-set-up alert | `info-text` | `info-subtle` | audit pass | 4.5:1 | ✅ |
| Field error | `warning-text` | `surface-base` | audit pass | 4.5:1 | ✅ |
| Help steps | `fg-primary` | `surface-base` | audit pass | 4.5:1 | ✅ |
| Bar secondary button | `accent-text` | `surface-base` | audit pass | 4.5:1 | ✅ |

### Screen Reader
[INFERENCE] From labels in code; not recorded with VoiceOver.

| Element | Announced As | Issue |
|---------|-------------|-------|
| Provider row | "Gmail, Gmail and Google Workspace, Recommended, button" | — |
| Password toggle | "Show password, button" | — |
| Failed test | announcement with the error sentence | — |

### Documented audit exemptions
Same policy as Settings ([../settings/accessibility.md](../settings/accessibility.md)): no element, system chrome (Cancel / back), disabled controls (Connect before the form is complete), default-size Dynamic Type, content under the bars.

### Priority Fixes
None open.
