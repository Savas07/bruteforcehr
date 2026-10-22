# iOS CV editor — accessibility review

Skill: `accessibility-review` (WCAG 2.1 AA, mapped to iOS). Backed by the XCUITest `apps/ios/BruteForceHRUITests/CVEditorAccessibilityAuditTests.swift`, which runs `performAccessibilityAudit()` in design mode on the populated CV (Edit and Preview) and the empty list at the default size and at AX5 (`UICTContentSizeCategoryAccessibilityXXXL`), plus the item edit sheet, ✦ Improve, Version history, Reorder sections and the DE variant, and drives the key interactions (swipe to remove + Undo, blank-filling before "Use suggestion", switching to the variant from "…").

Runs: iPhone 17e light and iPhone 17 Pro Max dark (Xcode 26.6, iOS 26 simulators), 13 tests each. Every issue is logged to `artifacts/screens/ios/<device>/audit-issues.txt` with element, label and frame.

## Accessibility Audit: CV editor (iOS)
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-22

### Summary
**Issues found:** 15 in the screen's own UI (all fixed) + 1 shared-component finding with three parts (all fixed upstream on `m0/ios-shared`, pending Main's merge) | **Critical:** 1 | **Major:** 8 | **Minor:** 7

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation / status |
|---|---|---|---|---|
| 1 | List section headers ("Header", "Summary", "Highlights", history dates) in the system grey: 4.3–4.4:1 on the grouped background ("Contrast nearly passed" / failed). | 1.4.3 Contrast | 🟡 Major | Fixed: headers and footers use `BFHRColor.Fg.secondary` (#4B5261 light, #A8AFBB dark; ≥ 7:1 on the grouped and cell backgrounds). |
| 2 | Version history and Reorder sheets at the medium detent are translucent glass on iOS 26; every row measured against the blurred CV behind ("Contrast failed" × 12). | 1.4.3 | 🟡 Major | Fixed: `presentationBackground(BFHRColor.groupedBackground)`. |
| 3 | Suggestion diff in dark: added words had an accent fill behind accent text inside a primary-text run; the audit failed the run's contrast. | 1.4.3, 1.4.1 Use of color | 🟡 Major | Fixed: added words are underlined + bold + accent text, removed words struck through + secondary; one background. VoiceOver value spells the changes out ("replaced “Led” with “Drove”; added …"). |
| 4 | Summary and first-bullet previews truncated at 4 / 2 lines ("Text clipped"). | 1.4.4 Resize text | 🟢 Minor | Fixed: full text shown. |
| 5 | Edit-sheet text fields single-line: clipped values at AX5 and for accented capitals ("Text clipped" on Role / Location). | 1.4.4 | 🟢 Minor | Fixed: vertical-axis fields that grow; single-value fields drop line breaks. |
| 6 | `EmptyState` message clipped at the default size; title contrast in dark; primary button label clipped on iPhone 17e (shared component). | 1.4.4, 1.4.3 | 🟢 Minor | Reported to IosFoundation: message + dark title fixed on `m0/ios-shared` (d2512b1, 350717c; pending Main's merge); button clipping fixed in 539a69d (verified by IosFoundation on a temp merge with f0bd0c8: `testEmptyDefaultSize` passes on iPhone 17e light). |
| 7 | Preview page text is fixed-size print in paper colours, scaled to fit the width. | 1.4.4 | 🟢 Minor (by design) | Kept: it is the document, not UI. "Actual size" shows it 1:1, pinch/scroll both ways; VoiceOver reads the real text in page order ("Page 1 of 1" container); the editor itself scales to AX5. Audit exempts only static text inside `cv.page.N`. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation / status |
|---|---|---|---|---|
| 8 | ✦ Improve at AX5: pinned action bar covered ~70 % of the sheet. | 1.4.10 Reflow | 🔴 Critical | Fixed: at accessibility sizes the actions are the last list section (test scrolls to "Keep mine"). |
| 9 | Drag-only reordering of items and sections. | 2.1.1 Keyboard / 2.5.1 | 🟡 Major | Fixed: every item and section row has "Move up" / "Move down" VoiceOver actions; Remove is in the swipe, the context menu and the actions rotor (`bfhrRowActions`). |
| 10 | Cancel on an untouched edit sheet asked "Discard your changes?" (draft compared field-by-field). | 3.2.2 Predictable | 🟡 Major | Fixed: "unsaved" means "saving would change the CV"; UI test asserts the sheet closes without asking. |
| 11 | Touch targets: section "+ Add" (44 × 44 min, icon-only at AX with "Add to Experience" label), ✦ `IconButton` (44 pt), chips (44 pt), month/year menus (system). | 2.5.5 | — | Pass. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation / status |
|---|---|---|---|---|
| 12 | Form labels: floating labels are hidden from VoiceOver, so fields must carry their own. | 3.3.2 Labels | 🟡 Major | Fixed: each field has `accessibilityLabel` = its visible label; blank fields read "Your value for [X%]". |
| 13 | End before start: footer shows "End date is before start date." with an icon, Save disabled. | 3.3.1 Error identification | — | Pass. |
| 14 | Blanks like `[X%]` in AI text: banner "Blanks to fill in: 1" + per-bullet "Replace [X%] with your real figure."; "Use suggestion" and Save stay disabled until filled. | 3.3.1 / 3.3.3 | — | Pass. |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation / status |
|---|---|---|---|---|
| 15 | Pushed CV error had no "Try again" (reload action didn't reach the navigation destination). | 4.1.2 Name, Role, Value | 🟡 Major | Fixed: `bfhrReload` / `bfhrNow` passed into the destination. |
| 16 | Suggestion rows: selection must be exposed. | 4.1.2 | — | Pass: "Suggestion 1 of 3. …" + `isSelected` trait; versions in "…" carry `isSelected` on the open CV. |

### Color Contrast Check

Ratios computed from the token values (WCAG relative luminance); system backgrounds are iOS `systemGroupedBackground` / `secondarySystemGroupedBackground`.

| Element | Foreground | Background | Ratio | Required | Pass? |
|---|---|---|---|---|---|
| Body / item title (light) | fg.primary #161A22 | white | 17.4:1 | 4.5:1 | ✅ |
| Secondary lines, headers (light) | fg.secondary #4B5261 | grouped #F2F2F7 | 7.0:1 | 4.5:1 | ✅ |
| Secondary lines, headers (dark) | fg.secondary #A8AFBB | cell #1C1C1E | 7.7:1 | 4.5:1 | ✅ |
| "+ Add", ✦, added diff words (light) | accent.text #1F635D | white | 7.0:1 | 4.5:1 | ✅ |
| Same (dark) | accent.text #43BEB4 | cell #1C1C1E | 7.5:1 | 4.5:1 | ✅ |
| Blank warning (light) | warning.text #9C5D00 | grouped #F2F2F7 | 4.7:1 | 4.5:1 | ✅ |
| Blank warning (dark) | warning.text #C18C4C | black / cell | 7.1–5.8:1 | 4.5:1 | ✅ |
| Page text | ink #1C1F24 | paper white | 16.5:1 | 4.5:1 | ✅ (fit-to-width scaling exempted, see 7) |

### Keyboard Navigation (Full Keyboard Access / Switch Control)

Expected order from the SwiftUI structure (native controls only, no custom focus handling); not exercised with Full Keyboard Access in this round.

| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---|---|---|---|---|
| Edit · Preview | after back button | switches | — | ← → between segments |
| Section rows / items | top to bottom | opens sheet | — | — |
| Edit sheets | fields in visual order | Save / Cancel in the bar | Cancel (asks only with changes) | — |
| ✦ Improve | quote → modes → suggestions → blanks → actions | selects / uses | Keep mine (dismiss) | — |

### Screen Reader
| Element | Announced As | Issue |
|---|---|---|
| Item row | "Frontend Engineer, Pazarbox · Mar 2022 – Present, Led the rebuild …, button. Opens the editor." + actions Remove, Move down | — |
| Header row | "Deniz Aksoy, Frontend & Product Engineer, deniz.aksoy@example.com · +90 532 555 01 47 · Istanbul, button" | — |
| Suggestion | "Suggestion 1 of 3. Drove the rebuild … by [X%]., replaced “Led” with “Drove”; …. Stronger verb, Shows a result, selected" | — |
| Page | "Page 1 of 1" container; name and section headings are headers | — |
| Remove toast | announced "Removed “Pazarbox — Frontend Engineer”", Undo; after Undo "Restored" | — |

### Audit exemptions (and why)
The test logs every issue and exempts only these, each tagged in the log:
- **System chrome**: tab bar, status bar, navigation-bar buttons (system glass controls; outside this screen).
- **Disabled controls**: "Use suggestion" / Save while disabled (WCAG 1.4.3 exempts inactive components).
- **Under a translucent bar**: content scrolled under the tab bar, navigation bar or the ✦ action bar, including their scroll-edge fade; it scrolls clear and the audit measures it against blur.
- **No element**: issues the audit can't attribute (seen only on the medium-detent sheets: grabber / drag handles).
- **Default-size "Dynamic Type partially unsupported"** on screens whose AX5 audit runs separately (populated Edit, item sheet, history, empty); all text uses `Font.bfhr` text styles and the AX5 runs pass.
- **Printed page** (Preview only): text size, clipping and contrast of static text inside `cv.page.N` (see finding 7).

### Results
| Run | Result |
|---|---|
| iPhone 17e, light (final, this branch) | 12 / 13 passed. The one failure is shared `EmptyState` (finding 6: message clipped at the default size). |
| iPhone 17 Pro Max, dark (this branch, before the diff fix) | 11 / 13 passed: finding 3 (fixed afterwards in `CVAssistSheet`) and finding 6 (dark title). |
| Verification with `m0/ios-shared` @ 350717c temporarily merged (not committed) | Pro Max dark: `testEmptyDefaultSize`, `testEmptyAccessibilitySize`, `testAssistSheetBlocksUntilBlankFilled` all pass. iPhone 17e light: empty AX passes; empty default still reports "Text clipped" on the shared `EmptyState` primary button ("Start from scratch", 178 × 44) — fixed upstream in 539a69d (IosFoundation verified `testEmptyDefaultSize` passes on iPhone 17e light with this branch). |

### Priority Fixes
1. **✦ Improve actions scroll at AX5** — done; affects low-vision users deciding on AI text.
2. **Contrast of headers and sheet backgrounds** — done; affects everyone in bright light.
3. **VoiceOver move actions and field labels** — done; blind users can reorder and edit without drag.
