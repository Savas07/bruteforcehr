# Apply AI screens (iOS) — accessibility review

Covers the iPhone screens added for BRIEF §4.4: Tailor review (choice, review, preview, saved checklist, AI off, daily limit), Cover letter editor (template, AI draft, limit, fields to fill), Apply kit, Attachment picker and Settings › Application answers (list, editor, add). STATUS rows for these screens link here.

## Automated: `ApplyAIAccessibilityAuditTests` (XCUITest `performAccessibilityAudit`)

- **Run:** 2026-10-25, iPhone 17 Pro simulator, Xcode 26.6: `xcodebuild test -only-testing:BruteForceHRUITests/ApplyAIAccessibilityAuditTests`. CI runs the same suite in `ios.yml` › UI audits (`apply` shard).
- **Result:** 25 of 25 tests pass. They cover every state above at the default text size, the largest accessibility size (AX5) page by page, Turkish and German, plus four behaviour checks: Accept all and save, a field blocks "Use this letter" until it's filled, the kit's Copy toast names the item, and adding an answer.
- **Ignored audit issues:** the same documented false-positive rules as the other Apply audits (`../apply/accessibility.md`). These are system bars, text under the translucent navigation bar or the bottom bar while it scrolls, and disabled controls.
- **Two test fixes this round, no app change:**
  - At AX5 the letter-draft banner starts below the fold of a lazy List, so the test waits for the bar button and the page-by-page audit scrolls over the banner.
  - The kit Copy test scrolled a row half under the sticky bar; it now scrolls it clear before tapping.

## Manual

- **VoiceOver:**
  - Each tailor card reads its location, the original, the suggestion, Why and Based on as one combined element.
  - Accept and Keep original are separate buttons, now addressable inside the card (critique r1, Moderate 1).
  - Decided cards read "Accepted", then "Decide again".
- **Dynamic Type:** at AX5, the bottom bars cap at AX1 like Job detail's Apply bar (the Large Content Viewer covers larger sizes); everything else wraps.
- **Contrast:** the attachment sheet is opaque now (critique r1). Before, the glass background showed the composer through the file rows.
- **Touch targets:** all buttons are ≥ 44 pt; kit file actions are full-width.

## Result

Pass: zero open issues.
