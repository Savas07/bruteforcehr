# Share sheet — accessibility review (WCAG 2.1 AA, iOS)

Date: 2026-10-24. Scope: `JobImportShareSheet` in all ten states (reading, ready, ai, existing, saved, logged, blocked, offline, signed-out, manual), checked two ways:
- **Design host** (`-BFHRShareSheet`): light/dark, default/AX5 text, iPhone 17e and 17 Pro Max.
- **Real extension in Safari** (`ShareExtensionEndToEndTests`).

Automated: `ShareSheetAccessibilityAuditTests` (XCUITest `performAccessibilityAudit`) runs every state at the default size and at AX5, and the ready, blocked, saved and manual states in Turkish and German. It also checks two flows: Save from the form, and a wall offering "Add it by hand" with role and company required.

## Findings and fixes

| # | Criterion | Finding | Severity | Fix |
|---|---|---|---|---|
| 1 | 1.4.4 Resize text | At AX5 the pinned Save buttons covered ~30 % of the sheet and hid the fields. | Moderate | At accessibility sizes the actions scroll as the last Form section (critique r1). |
| 2 | 1.4.3 Contrast | Read-only values for an already-saved job ("Security Engineer, Cloud", "Ramp", …) used the system's trailing grey: "Contrast nearly passed". | Moderate | `readOnlyRow`: label above (Fg.secondary), value in Fg.primary, wrapping. |
| 3 | 1.4.3 Contrast | The hand-entry section header "Add it by hand" ("Elle ekleyin", "Selbst eintragen") failed contrast as a Form header. | Moderate | The title moved into the navigation bar (system style). No section header. |
| 4 | 1.4.4 / 1.4.10 | German at the default size: "Text may be clipped" on the source line and footer. | Minor | The source text wraps (`fixedSize(vertical:)`). The report is a prediction at the default size; the AX5 run measures it and passes. |
| 5 | 4.1.2 Name, role, value | Saving spinners had no name. | Minor | "Saving…" label on both progress views. |
| 6 | 2.4.6 Headings | Failure and saved titles weren't headers. | Minor | `.isHeader` on message titles. |

Audit policy (the same as `TrackerBoardAccessibilityAuditTests`): system navigation bar items (Cancel and the title, which iOS caps) are ignored. Dynamic Type reports at the default size are left to the AX5 run of the same state.

## Result

The last run (2026-10-24, iPhone 17 Pro, iOS 26) passed all five tests: every state at default and AX5, TR/DE, and both flows. **0 Critical, 0 open Moderate.**

## Manual checks

- **VoiceOver order:** Cancel → title → source card (one element: "From jobs.ashbyhq.com, Read from the page's job details", plus "AI-assisted" when AI read it) → Role / Company / Location fields (labels stay visible above the values) → footer → Save → Save and log as applied.
- **Targets:** the buttons are full width and ≥ 44 pt.
- **Color:** failures are never red. Glyphs are decorative (hidden), and the save-failed note uses the warning tone plus text.
- **Reduce Motion:** no custom animation. The confirm haptic plays only on success.
