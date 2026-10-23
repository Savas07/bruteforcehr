## Accessibility Audit: Update gate (iOS)

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23

Scope: the "Update available" banner (docked above the tab bar, shown over Today in the captures) and the blocking "Update required" screen, in design mode (`-BFHRUpdate available|required`). Evidence: XCUITest `performAccessibilityAudit()` in `apps/ios/BruteForceHRUITests/UpdateGateAccessibilityAuditTests.swift` on the iPhone 17e and iPhone 17 Pro Max, light and dark, default text size and AX5 (`UICTContentSizeCategoryAccessibilityXXXL`), in English, Turkish and German; token contrast computed from the asset catalog; captures reviewed in [r1](r1.md)–[r3](r3.md).

How the audit is scoped (and why):

- **Banner:** only the banner's own elements fail the test. Today's rows behind the banner stay in the accessibility tree, so the screenshot-based checks would measure them against the banner's pixels; Today has its own audit.
- **Blocking screen at AX5:** the first viewport runs every check. After each scroll, contrast / Dynamic Type / clipping are logged instead of failing, because XCUITest keeps the pre-scroll frames of the scroll view's texts (verified: the frames are identical before and after the drag while the audit's screenshots show the page moved) — the same limitation `TodayAccessibilityAuditTests` documents. The scrolled pages are saved (`update-gate-audit-required-*-page-N.png`) and were reviewed by eye. Every other check runs on every page.
- Elements partly off screen and issues without an element are logged for review, as in the other screens' audits.

**Known false positive (German clipping prediction).** In German only, the audit reports "Text of this SwiftUI.AccessibilityNode may be clipped at larger Dynamic Type sizes" for the blocking screen's message and even the one-line versions footnote, at the default size and at AX5. Evidence that nothing is clipped: the same layout passes in English and Turkish, and in English with the German locale (`de_DE`, experiment run 2026-10-23), so it follows the German strings, not the layout; the audit's own element screenshots show the full text; the German captures (`update-gate-required-light-de.png`, `update-gate-audit-required-de*.png` incl. the scrolled AX5 pages, both devices) show every line, with German hyphenation at AX5 ("wei-ter"). The likely trigger is that hyphenation, which the audit's larger-size prediction doesn't reproduce [INFERENCE]. The test logs these issues for German on the blocking screen instead of failing; a real German truncation (r2) is caught by the capture review, which is part of every round.

### Summary

**Issues found:** 4 (all resolved) | **Critical:** 1 | **Major:** 2 | **Minor:** 1

### Findings

#### Perceivable

| #   | Issue                                                                                                                                                                                                                                                                                                                                               | WCAG Criterion                              | Severity    | Recommendation                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | German blocking message truncated at AX5 ("…um weiterzuma…"), seen in the audit's screenshot on the Pro Max. Per-text `fixedSize` didn't stop SwiftUI from truncating the last line when the final word ("weiterzumachen.") is wider than the line.                                                                                                 | 1.4.4 Resize text                           | 🔴 Critical | Resolved: German copy ends "…um die App weiter zu nutzen." (short words, hyphenated at AX5), each text has its own `fixedSize`; AX5 captures show every line on both devices. |
| 2   | Banner title `info-text` on `info-subtle`: 4.64:1 by token values, "Contrast nearly passed" on the 17e. "Open TestFlight" (6.11:1 by tokens) failed the audit's contrast check on the 17e in light mode: the card's `raised` shadow was applied to the whole banner, so SwiftUI drew a shadow under every text and button, blurring the text edges. | 1.4.3 Contrast                              | 🟡 Major    | Resolved: title in `fg-primary` (15.22:1 light / 12.98:1 dark); the shadow is drawn by the card's background shape only.                                                      |
| 3   | Blocking screen at AX5: scrolled text ran under the status bar (no navigation bar).                                                                                                                                                                                                                                                                 | 1.4.10 Reflow (legibility of system status) | 🟡 Major    | Resolved: canvas strip over the top safe area.                                                                                                                                |

#### Operable

| #   | Issue                                                                                                                                                                                                            | WCAG Criterion         | Severity | Recommendation                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------- | ----------------------------------------------------------------------- |
| —   | ✕ is an `IconButton` (44 × 44, label "Close"); "Open TestFlight" ≥ 44 pt; the one-line AX banner's button has `minHeight` 44; primary and "Get help" ≥ 44 pt.                                                    | 2.5.5 Target size      | —        | Pass (audit "hit region" checks green).                                 |
| —   | The blocking screen can't be swiped away and covers the tab bar; nothing behind it is reachable (`testRequiredBlocksTheApp`). It never traps without a way out: Open TestFlight and Get help are always present. | 2.1.2 No keyboard trap | —        | Pass by design (blocking is the requirement; both exits leave the app). |

#### Understandable

| #   | Issue                                                                                                             | WCAG Criterion                  | Severity | Recommendation                |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------- | ----------------------------- |
| 4   | TR "Yardım alın" / DE "Hilfe erhalten" inconsistent with the app's short button labels.                           | 3.2.4 Consistent identification | 🟢 Minor | Resolved: "Yardım" / "Hilfe". |
| —   | The blocking screen states cause → action → reassurance → versions; the banner names the version and where it is. | 3.3.3 Error suggestion          | —        | Pass.                         |

#### Robust

| #   | Issue                                                                                                                                                                            | WCAG Criterion          | Severity | Recommendation |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------- | -------------- |
| —   | Banner title and blocking title are headers; glyphs hidden; one-line AX banner button reads "Update available, Version 0.2.0 is ready in TestFlight., button, Opens TestFlight." | 4.1.2 Name, Role, Value | —        | Pass.          |

### Color Contrast Check

Token values from `BFHRDesignTokens` (light / dark). Banner surface: `info-subtle` (`#DDF3FF` / `#12283B`); blocking screen: `surface-canvas` (`#F6F7F9` / `#0E1014`).

| Element                                                    | Foreground            | Background            | Ratio             | Required | Pass? |
| ---------------------------------------------------------- | --------------------- | --------------------- | ----------------- | -------- | ----- |
| Banner title + sentence (`Fg.primary`)                     | `#161A22` / `#ECEEF2` | info-subtle           | 15.22:1 / 12.98:1 | 4.5:1    | ✅    |
| Banner "Open TestFlight", AX banner button (`Accent.text`) | `#1F635D` / `#43BEB4` | info-subtle           | 6.11:1 / 6.65:1   | 4.5:1    | ✅    |
| Banner glyph (`info-text`, decorative)                     | `#2870A5` / `#689ECB` | info-subtle           | 4.64:1 / 5.27:1   | 3:1      | ✅    |
| Blocking title + body (`Fg.primary`)                       | `#161A22` / `#ECEEF2` | canvas                | 16.26:1 / 16.39:1 | 4.5:1    | ✅    |
| Versions line (`Fg.secondary`)                             | —                     | canvas                | 7.31:1 / 8.63:1   | 4.5:1    | ✅    |
| "Get help", glyph (`Accent.text`)                          | `#1F635D` / `#43BEB4` | canvas                | 6.53:1 / 8.40:1   | 4.5:1    | ✅    |
| Open TestFlight (`Fg.onAccent` on `Accent.solid`)          | `#FFFFFF`             | `#216863` / `#2B827B` | 6.51:1 / 4.58:1   | 4.5:1    | ✅    |

The audit's own contrast check passes on the banner and on the first viewport of the blocking screen in every language, size, theme and device.

### Keyboard Navigation

iOS screen; Full Keyboard Access follows the VoiceOver order below.

| Element                             | Tab Order                  | Enter/Space                          | Escape                         | Arrow Keys |
| ----------------------------------- | -------------------------- | ------------------------------------ | ------------------------------ | ---------- |
| Banner (after the screen's content) | Open TestFlight → Close    | Opens TestFlight / closes the banner | —                              | —          |
| Blocking screen                     | Open TestFlight → Get help | Opens TestFlight / the Support page  | No effect (can't be dismissed) | —          |

### Screen Reader

| Element                    | Announced As                                                                                                                   | Issue                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Banner title               | "Update available, heading"                                                                                                    | —                                                    |
| Banner sentence            | "Version 0.2.0 is ready in TestFlight."                                                                                        | —                                                    |
| Banner action / ✕          | "Open TestFlight, button" / "Close, button"                                                                                    | —                                                    |
| One-line banner (AX sizes) | "Update available, Version 0.2.0 is ready in TestFlight., button, Opens TestFlight."                                           | —                                                    |
| Blocking screen            | Focus starts on "Update required, heading", then message, reassurance, versions, "Open TestFlight, button", "Get help, button" | —                                                    |
| Banner appearance          | Not announced                                                                                                                  | Intentional: non-urgent; it stays until closed (r1). |

### Priority Fixes

All resolved (see Findings). Nothing open.

## Resolution

Fixed in [r2](r2.md) / [r3](r3.md): per-text `fixedSize` and shorter German final clause (1), banner title in `fg-primary` and the shadow on the card shape only (2), status-bar strip (3), TR/DE help label (4). The final audit run is recorded in [r3](r3.md).
