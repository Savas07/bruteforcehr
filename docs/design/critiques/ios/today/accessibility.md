## Accessibility Audit: Today (iOS)
**Standard:** WCAG 2.1 AA (+ Apple HIG accessibility) | **Date:** 2026-10-22

Method: `skill://accessibility-review` applied to the r4 captures (both devices, light/dark, default and AX5), backed by `apps/ios/BruteForceHRUITests/TodayAccessibilityAuditTests.swift`, an XCUITest `performAccessibilityAudit()` of Today in design mode:

| Test | Dataset | Text size | What it audits |
|---|---|---|---|
| `testPopulatedDefaultSize` | populated | Large (default) | first viewport + 5 scrolled pages |
| `testPopulatedAccessibilitySize` | populated | accessibility-XXXL | first viewport + 10 scrolled pages |
| `testEmptyDefaultSize` | empty (first run) | Large | the whole screen |
| `testEmptyAccessibilitySize` | empty | accessibility-XXXL | first viewport + 1 scrolled page |
| `testReviewSheet` | populated | Large | the ReviewSheet over Today |

Run: `apps/ios` scheme `BruteForceHR`, `-only-testing:BruteForceHRUITests/TodayAccessibilityAuditTests` on iPhone 17e (shared DerivedData `~/Library/Developer/Xcode/DerivedData/BFHR-shared`).

**Filters** (each logged as an `IGNORED (…)` activity in the result bundle, never silent):
1. System chrome (tab bar, status bar, navigation bar) — outside this screen.
2. Elements not fully inside the content area (below the navigation bar, above the floating tab bar, minus a 24 pt scroll-edge fade) — the audit reads contrast and clipping from a screenshot, and iOS 26 blurs content under the bars.
3. Contrast, Dynamic Type and clipping on **scrolled** pages — after a scroll, SwiftUI `List` cells keep stale accessibility frames that point at other content. Verified with the screenshot the test saves before each audit (`today-audit-*.png`): e.g. "Reply requested · Tannenbaum Software" reported at y = 368 pt when that row had scrolled off screen. These checks run on the first viewport of every state and size; contrast is also covered by the token table below and clipping / scaling by the AX5 captures of every page (`today-populated-scroll{1…8}-light-ax.png`).
4. Issues with no element — the audit can't say what they refer to (logged: mostly "Text clipped" / "Dynamic Type unsupported" during scrolled pages).

### Summary
**Issues found:** 11 | **Critical:** 1 | **Major:** 6 | **Minor:** 4 — all fixed except two logged Minors (see Priority Fixes) and one audit finding judged a false positive (Robust #3).

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | AX5: decorative monograms kept their column; titles wrapped one word per line with hyphenation. | 1.4.4 Resize text / 1.4.10 Reflow | 🔴 Critical | Fixed: `CompanyMonogram(hidesAtAccessibilitySizes: true)` in every Today row and in the shared rows. |
| 2 | AX5: date subtitle truncated ("Thursday, October…"). | 1.4.4 Resize text | 🟡 Major | Fixed: "Thu, Oct 22" at accessibility sizes. |
| 3 | AX5: shared `PaneError` truncated title / message. | 1.4.4 | 🟡 Major | Fixed in the shared component (scrolls at AX sizes). |
| 4 | Automatic-change sender looked like a link (accent-colored autolink) but wasn't one. | 1.3.1 Info and relationships | 🟡 Major | Fixed: interpolated data renders as plain text (`Text(bfhrPlain:)`). |
| 5 | Audit: "Prep" disclosure label flagged "Dynamic Type partially unsupported" / "Text clipped" (system `DisclosureGroup` label). | 1.4.4 | 🟡 Major | Fixed for clipping (custom chevron row). See Robust #3 for the remaining audit flag. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | AX5: match Save / ✕ icon buttons hidden to give the title room; actions only in swipe, context menu and rotor. | 2.5.5 Target size / discoverability | 🟡 Major | Fixed: labelled "Save" / "Not for me" buttons under the row at AX sizes. |
| 2 | ReviewSheet: Confirm / Change… below the fold at the medium detent. | 2.4.3 Focus order / efficiency | 🟡 Major | Fixed: buttons pinned in the shared sheet; Today opens it at large. |
| 3 | Every row action is reachable without gestures. | 2.1.1 | — | Pass: `bfhrRowActions` feeds swipe, context menu and the VoiceOver actions rotor from one list. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | "To review · 3" over six rows (three decisions + three automatic changes). | 3.2.4 Consistent identification | 🟢 Minor | Fixed: automatic changes get their own "Updated automatically" section. |
| 2 | Avatar rendered as an empty circle before the profile loads. | 3.3.2 Labels | 🟢 Minor | Fixed: `person.crop.circle` "Settings" button until initials exist. |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Next up time line was its own tiny element ("Hit area is too small"). | 4.1.2 | 🟢 Minor | Fixed: time and place are one combined element of the card. |
| 2 | Prep state: the expanded / collapsed state was an `accessibilityValue`. | 4.1.2 | 🟢 Minor | Changed to a hint ("Shows who you'll meet and your notes" / "Hides the prep details"); the row is one button element. |
| 3 | Audit still reports "Dynamic Type partially unsupported" on the Prep row (first viewport, default size) in some runs. | 1.4.4 | 🟢 Minor | Judged a false positive: the row uses `.bfhr(.body)` (Dynamic Type `body`), and the AX5 captures show "Prep" at full accessibility size (`iphone-17e/today-populated-scroll2-light-ax.png`). Logged; see the final run result in the Resolution. |

### Color Contrast Check
Token values from `BFHRDesignTokens` (light / dark); row = inset-grouped cell background (`#FFFFFF` / `#1C1C1E`), grouped background `#F2F2F7` / `#000000`.

| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Row titles (`Fg.primary`, light) | `#161A22` | `#FFFFFF` | 17.43:1 | 4.5:1 | ✅ |
| Context lines (`Fg.secondary`, light) | `#4B5261` | `#FFFFFF` | 7.84:1 | 4.5:1 | ✅ |
| Meta / time (`Fg.tertiary`, light) | `#5E6573` | `#FFFFFF` | 5.86:1 | 4.5:1 | ✅ |
| Section headers (`Fg.secondary`, light) | `#4B5261` | `#F2F2F7` | 7.03:1 | 4.5:1 | ✅ |
| Kind line, Undo, links (`Accent.text`, light) | `#1F635D` | `#FFFFFF` | 7.00:1 | 4.5:1 | ✅ |
| Source tag (`Fg.secondary` on `Surface.sunken`, light) | `#4B5261` | `#EFF1F4` | 6.93:1 | 4.5:1 | ✅ |
| Primary button (`Fg.onAccent` on `Accent.solid`, light) | `#FFFFFF` | `#216863` | 6.51:1 | 4.5:1 | ✅ |
| Row titles (`Fg.primary`, dark) | `#ECEEF2` | `#1C1C1E` | 14.65:1 | 4.5:1 | ✅ |
| Context lines (`Fg.secondary`, dark) | `#A8AFBB` | `#1C1C1E` | 7.71:1 | 4.5:1 | ✅ |
| Meta / time (`Fg.tertiary`, dark) | `#8F97A4` | `#1C1C1E` | 5.78:1 | 4.5:1 | ✅ |
| Kind line, Undo, links (`Accent.text`, dark) | `#43BEB4` | `#1C1C1E` | 7.51:1 | 4.5:1 | ✅ |
| Section headers (`Fg.secondary`, dark) | `#A8AFBB` | `#000000` | 9.51:1 | 4.5:1 | ✅ |
| Primary button (`Fg.onAccent` on `Accent.solid`, dark) | `#FFFFFF` | `#2B827B` | 4.58:1 | 4.5:1 | ✅ |

The audit's own contrast check passes on the first viewport of every audited state and size.

### Keyboard Navigation
iOS screen; hardware-keyboard / Full Keyboard Access follows the VoiceOver order below. Desktop keyboard shortcuts belong to the desktop Today.

| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|------------|
| Avatar (Settings) | 1 | Opens Settings link | — | — |
| Rows, top to bottom by section | 2… | Opens the row's target (ReviewSheet, job) | — | Next / previous row |
| ReviewSheet | sheet | Confirm / Change… / Not job mail | Dismisses the sheet | — |

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| Section header | "To review · 3, heading" | — |
| Review row | "Looks like a recruiter reaching out, Sail Analytics · Product Engineer, Growth, From email, Today, button" + hint "Shows the email and what we'd change"; actions: Confirm, Snooze, Not job mail, Review…, Open application | — |
| Automatic change | "Moved to Offer, Lumenpay · …, Email from …, Automatic · Mail, Yesterday"; action: Undo, Looks right, Open application | — |
| Next up card | kind + title + company · role; then the time (full date) and place as one element | — |
| Prep | "Prep, button", hint shows / hides | — |
| Relative times | full date and time ("Thursday, October 22, 2026 at 3:00 PM") | — |
| Sync glyph | "Waiting to sync" | — |

### Priority Fixes
1. **AX5 reflow (monograms)** — fixed; affected every row for people using the largest text sizes.
2. **Labelled actions at AX sizes and pinned ReviewSheet buttons** — fixed.
3. **Logged Minors** — the Prep audit flag (Robust #3, judged false positive) and the scrolled-page audit limitation (filter 3); revisit when Xcode's audit handles stale `List` frames.

## Resolution
- `swift test` (packages/swift/BFHRUI): 96 tests in 11 suites passed.
- `xcodebuild test-without-building … -only-testing:BruteForceHRUITests/TodayAccessibilityAuditTests` on iPhone 17e (iOS 26, Xcode 26.6), final run 2026-10-22: **6 tests, 0 failures** — `testPopulatedDefaultSize`, `testPopulatedAccessibilitySize`, `testEmptyDefaultSize`, `testEmptyAccessibilitySize`, `testReviewSheet` pass (plus the capture helper `testCaptureBelowTheFold`). Every filtered issue is listed as an `IGNORED (…)` activity in the result bundle; the only screen-specific one is the Prep row (Robust #3).
