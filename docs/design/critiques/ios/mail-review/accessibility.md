# Mail review (iOS): accessibility audit

## Accessibility Audit: Mail tab (To review, Updates, All job mail, review sheet, Change…)
**Standard:** WCAG 2.1 AA (+ Apple HIG accessibility) | **Date:** 2026-10-22

Evidence: `apps/ios/BruteForceHRUITests/MailReviewAccessibilityAuditTests.swift` runs XCUITest `performAccessibilityAudit()` (all audit types) on the Mail tab in design mode: populated and empty data at the default size and at AX5 (`UICTContentSizeCategoryAccessibilityXXXL`), plus the open review sheet. Final run on iPhone 17e (iOS 26), shared DerivedData:

| Test | Result |
|---|---|
| `testPopulatedDefaultSize` | ✅ passed |
| `testPopulatedAccessibilitySize` | ✅ passed |
| `testEmptyDefaultSize` | ✅ passed |
| `testEmptyAccessibilitySize` | ✅ passed |
| `testReviewSheet` | ✅ passed |

Every issue fails the test except the documented exclusions below; each issue is printed (`AUDIT ignored|FAILED …`) with its element and frame.

### Summary
**Issues found:** 9 (across 3 audit rounds) | **Critical:** 0 | **Major:** 4 (fixed) | **Minor:** 5 (fixed or excluded with reason)

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Review sheet text (proposal sentence, reason, "Show full email") failed contrast: the medium detent's glass let the list behind show through. | 1.4.3 Contrast | 🟡 Major | Fixed: `.presentationBackground(BFHRColor.Surface.base)`. |
| 2 | Sync-line separator "·" in `Fg.tertiary` failed contrast (4 pt glyph). | 1.4.3 Contrast | 🟢 Minor | Fixed: separator removed; spacing separates scope and time. |
| 3 | Section header "We weren't sure about these" nearly failed (system header colour on grouped background). | 1.4.3 Contrast | 🟢 Minor | Fixed: headers / footers use `Fg.secondary`. |
| 4 | Email addresses auto-detected as links (teal on amber) in the Reconnect card and row chips. | 1.4.3 / 3.2.4 | 🟡 Major | Fixed: `Text(bfhrPlain:)` (shared, via IosFoundation). |
| 5 | Category conveyed by monogram badge glyph only. | 1.1.1 / 1.4.1 | 🟢 Minor | Already met: rows combine into one VoiceOver element whose label includes the classification sentence and category text. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 6 | Swipe actions are invisible to VoiceOver / Switch Control users. | 2.1.1 | 🟡 Major | Met by design: `.bfhrRowActions` feeds the same Confirm / Change… / Not job mail / Review later into the context menu and the VoiceOver actions rotor; Confirm is disabled (not hidden) without an application. |
| 7 | Account scope only reachable via the title menu (no visible affordance). | 2.4.3 / 3.2.3 | 🟡 Major | Fixed: visible "All accounts ▾" menu (≥ 44 pt) in the sync line, labelled "Show email from", value = current scope. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 8 | "1 emails" on the job-alert bundle. | 3.1 (readability) | 🟢 Minor | Fixed: "Job alerts (1)". |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 9 | Chips need name, role and state. | 4.1.2 | 🟢 Minor | Met: chips are toggles with `.isSelected`; the Category chip has label "Category" and a value (selected category or "All categories"); the chip row is a container labelled "Show". |

### Color Contrast Check
| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Row subject / reason | `fg-secondary` | `surface-base` | audit pass | 4.5:1 | ✅ |
| Proposal sentence | `fg-primary` | `surface-base` | audit pass | 4.5:1 | ✅ |
| Reconnect title | `warning-text` | `warning-subtle` | audit pass | 4.5:1 | ✅ |
| Selected chip | `accent-text` | `accent-subtle` | audit pass | 4.5:1 | ✅ |
| Sync line | `fg-secondary` / `accent-text` | grouped background | audit pass | 4.5:1 | ✅ |

(Ratios are the audit's own verdict; token values come from `@bfhr/ui-tokens`, checked in light and dark captures.)

### Keyboard Navigation (Full Keyboard Access)
[INFERENCE] Derived from the view structure (SwiftUI controls, toolbar, sheet); not exercised with Full Keyboard Access in M0.

| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|------------|
| Scope menu | 1 | opens account list | closes | moves in list |
| Chips | 2–5 | selects chip | — | — |
| Reconnect | 6 | opens account settings | — | — |
| Review row | 7… | opens review sheet | — | rows |
| Review sheet | Close → content → Change… → Confirm | activates | closes sheet | — |

### Screen Reader
[INFERENCE] Announcements derived from the combined accessibility elements and labels in code (the audit verifies labels exist); not recorded with VoiceOver in M0.

| Element | Announced As | Issue |
|---------|-------------|-------|
| Review row | "Hannah Brooks, 5:42 AM, Product Engineer at Sail — open to a chat?, Looks like a recruiter reaching out, Sent from sailanalytics.com…, button. Review…" + actions rotor (Confirm, Change…, Not job mail, Review later) | — |
| Updates row | "Moved to Offer, Lumenpay · Frontend Engineer…, Email from …, Automatic · Mail, Yesterday" + Undo action | — |
| Category chip | "Category, All categories, button" | — |
| Tab | "Mail, 3 items" (badge = To review count only) | — |

### Documented audit exclusions (known false positives)
- **Dynamic Type / text clipped at the default size**: SwiftUI text-style fonts (`Font.bfhr` = `.system(textStyle, weight:)`) are reported as fixed-size on `ContentUnavailableView` text and `ButtonStyle` labels. They scale (AX5 captures), and the AX5 audits — where clipping is measured on the real layout — pass.
- **Contrast under the floating tab bar's scroll-edge blur** (element bottom within 72 pt of the tab bar) and **system glass toolbar buttons** ("Close"): the audit samples the blurred backdrop, not the resting background; the same rows pass when scrolled into the clear area.
- **Element detection without a label**: the sheet's rounded corner over the dimmed tab root.

### Priority Fixes
1. **Opaque review sheet** — done; affects low-vision users reading the proposal before confirming.
2. **Visible scope menu** — done; affects everyone with two inboxes and keyboard / VoiceOver users.
3. **Shared InlineAlert at AX5** — requested from IosFoundation (address hyphenation; minor).
