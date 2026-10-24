# Settings › Data & privacy (iOS) — accessibility review (WCAG 2.1 AA)

Date: 2026-10-24. Scope: `DataPrivacyView` and the pushed `DeleteAccountView`, all 20 design states (`-BFHRDataPrivacy <state>`: idle, preparing, downloading, ready, saved, downloadError, tooSoon, dailyLimit, tooLarge, exportError, offline, deleteEmpty, deleteTyped, reauthNeeded, linkSent, linkExpired, reauthDone, deleting, deleteError, deleteOffline).

Automated: `BruteForceHRUITests/DataPrivacyAccessibilityAuditTests` (XCUITest `performAccessibilityAudit`) on iPhone 17e:

| Test | Result |
| --- | --- |
| `testEveryStateDefaultSize` (20 states, first screen + 2 scrolled pages) | passed |
| `testEveryStateAccessibilitySize` (20 states at AX5, first screen + 4 scrolled pages) | passed |
| `testTurkishAndGerman` (idle, ready, tooLarge, deleteTyped, linkSent in TR and DE) | passed |
| `testDeleteNeedsTheWordAndKeepGoesBack` (Delete everything disabled until the word is typed; Return doesn't delete; Keep my account goes back) | passed |

Ignored audit items follow the shared policy (foundation-ios.md, "Accessibility audits"; same filter as the sign-in and update-gate audits) and were reviewed: items without an element, items partly off screen, and screenshot-based checks (contrast, Dynamic Type, clipping) on pages reached by scrolling, where XCUITest keeps pre-scroll frames. The same texts pass those checks on the first screen of the states that show them, and the AX5 captures (`capture.sh --screen data-privacy --ax`) show every line wrapped, not clipped.

Visual: captures of every state, light and dark, iPhone 17e and iPhone 17 Pro Max (`artifacts/screens/ios/<device>/data-privacy-*.png`, delete states with `-lower` scrolled halves).

## Checklist

| Criterion | Result | Notes |
| --- | --- | --- |
| 1.1.1 Non-text content | Pass | Check, minus and trash glyphs are hidden from VoiceOver (section headers say Included / Not included / This permanently deletes). |
| 1.3.1 Info and relationships | Pass | Native `List` sections with headers and footers; "Delete your account?" has the header trait; the confirm field's accessibility label is "To confirm, type DELETE". |
| 1.4.1 Use of color | Pass | Alerts pair tone with an icon and a sentence; disabled actions add "Needs a connection" offline. |
| 1.4.3 Contrast | Pass | Audit contrast checks pass on every first screen, light and dark. |
| 1.4.4 Resize text | Pass | All text uses `.bfhr(...)` Dynamic Type styles; AX5 audits pass; buttons grow, rows wrap. |
| 2.4.3 Focus order | Pass | VoiceOver focus moves to "Delete your account?" when the screen opens; reading order follows the list. |
| 2.5.5 Target size (AAA, applied as house rule) | Pass | Rows and buttons ≥ 44 pt (`BFHRHitTarget.minimum`). |
| 3.2.2 On input | Pass | Typing the word only enables Delete everything; Return closes the keyboard (behavior test). |
| 3.3.4 Error prevention | Pass | Itemized list, typed word, sign-in < 5 minutes old, "Export my data first". |
| 4.1.3 Status messages | Pass | Export ready, download failure, export refusals and deletion failure are announced (`DataPrivacyAnnouncement`); progress rows are labelled. |
| Reduce Motion | Pass | Section animations use `BFHRMotion.animation(_, reduceMotion:)`. |

## Findings

| # | Issue | Severity | Status |
| --- | --- | --- | --- |
| 1 | While deleting, the whole list was disabled, so VoiceOver couldn't move through it and the progress label could stay off screen. | Moderate | Fixed in r1: only the controls are disabled. |
| 2 | The confirm field repeated its label as grey placeholder text. | Minor | Fixed in r1. |

Exit: 0 Critical, 0 open Moderate.
