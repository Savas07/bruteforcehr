# CV editor (desktop) — accessibility review

## Accessibility Audit: CV editor (`/cvs`, `/cvs/$cvId`)
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-22

Method:

1. Automated: `pnpm --filter @bfhr/desktop capture:design cv-editor --axe` (axe-core, WCAG 2.1 A + AA tags) on populated, empty, loading, error and offline × light/dark × 1280 × 800 and 1920 × 1080 × WebKit and Chromium. Reports: `artifacts/a11y/desktop/cv-editor-*.json`.
2. Keyboard-only pass in the harness (Playwright, both engines, 1920 × 1080 so the inspector is docked): Tab order from the `h1`, Alt+↑ / Alt+↓ on a section and an item, F8 to the next suggestion, filling a placeholder, Mod+Enter to use, Esc to keep original.
3. Contrast: token pairs computed with `@bfhr/ui-tokens` `contrastRatio`.
4. Screen-reader names: accessible names of focused elements and the live region text, read in the keyboard pass. No VoiceOver/NVDA session was run; the "Announced As" column below is [INFERENCE] from those names, roles and descriptions.

### Summary
**Issues found:** 4 | **Critical:** 0 | **Major:** 3 (all fixed) | **Minor:** 1 (logged)

Final axe result: **0 critical · 0 serious** in all 20 state/theme/engine combinations. One "needs review" item in WebKit is the shell's ⌘ keycap glyph in the sidebar (not this screen).

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Tracked changes: deletions are `<del>` with strike-through, insertions `<ins>` with underline + tint, plus sr-only "Removed:" / "Added:" prefixes; queue cards carry a full spoken sentence ("Removed: …. Added: ….") | 1.4.1 Use of Color, 1.3.1 | — | Pass. |
| 2 | Preview page is `lang` = the CV's language (`de` on the German variant) so screen readers switch voice. | 3.1.2 Language of Parts | — | Pass. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | The preview canvas scrolled but could not be focused (axe `scrollable-region-focusable`). | 2.1.1 Keyboard | 🟡 Major | Fixed (`48e8aa7`): canvas is a focusable labelled group; Mod+= / Mod+- zoom while it has focus. |
| 2 | Section jump nav used links, which WebKit (WKWebView on macOS) leaves out of the Tab order by default. | 2.1.1 Keyboard | 🟡 Major | Fixed (`48e8aa7`): buttons. |
| 3 | Clicking a block in the preview focuses its fields (mouse convenience); there is no keyboard equivalent on the page itself. | 2.1.1 | 🟢 Minor | Logged: every block is reachable through the editor form and the jump nav; the preview is a read-only rendering. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | "Use suggestion" disabled while "[X%]" is unfilled explains why in visible text and as the button's description; the placeholder input is named "Your number for [X%]". | 3.3.2 Labels or Instructions | — | Pass. |
| 2 | Month/year selects are named "Start month", "Start year", … inside a labelled fieldset. | 3.3.2 | — | Pass. |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Item card toggles had an `aria-label` that didn't contain the visible first line (axe `label-content-name-mismatch`). | 2.5.3 Label in Name, 4.1.2 | 🟡 Major | Fixed (`cb76aa1`): the name is the visible text with sr-only commas between parts. |
| 2 | Accordions expose `aria-expanded`; the inspector uses Radix Tabs (tablist / tab / tabpanel, arrow keys); restore uses Radix AlertDialog (focus trapped, Esc cancels, Cancel first). | 4.1.2 | — | Pass. |

### Color Contrast Check
| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Body text (light) | fg-primary #161A22 | surface-base #FFFFFF | 17.43:1 | 4.5:1 | ✅ |
| Secondary text (light) | fg-secondary #4B5261 | surface-base #FFFFFF | 7.84:1 | 4.5:1 | ✅ |
| Hints, disclaimers (light) | fg-tertiary #5E6573 | surface-base #FFFFFF | 5.86:1 | 4.5:1 | ✅ |
| Suggestion badge (light) | accent-text #1F635D | accent-subtle #D3EFEC | 5.77:1 | 4.5:1 | ✅ |
| Placeholder reason (light) | warning-text #9C5D00 | surface-base #FFFFFF | 5.28:1 | 4.5:1 | ✅ |
| Placeholder field (light) | warning-text #9C5D00 | warning-subtle #FFEDD7 | 4.61:1 | 4.5:1 | ✅ |
| Primary button (light) | fg-on-accent #FFFFFF | accent-solid #216863 | 6.51:1 | 4.5:1 | ✅ |
| "ATS-safe" tag (light) | success-text #1B7B3C | success-subtle #E0F7E4 | 4.71:1 | 4.5:1 | ✅ |
| Body text (dark) | fg-primary #ECEEF2 | surface-base #16191F | 15.15:1 | 4.5:1 | ✅ |
| Hints (dark) | fg-tertiary #8F97A4 | surface-base #16191F | 5.98:1 | 4.5:1 | ✅ |
| Suggestion badge (dark) | accent-text #43BEB4 | accent-subtle #0D302D | 6.27:1 | 4.5:1 | ✅ |
| Primary button (dark) | fg-on-accent #FFFFFF | accent-solid #2B827B | 4.58:1 | 4.5:1 | ✅ |
| Field borders (light / dark) | line-control | surface-base | 3.76 / 3.96:1 | 3:1 | ✅ |
| Gutter bar (dark) | accent-solid #2B827B | surface-base #16191F | 3.84:1 | 3:1 | ✅ |

The preview page always renders in the light scheme (it shows the document, not UI), so its text uses the light pairs above in both themes.

### Keyboard Navigation
| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|------------|
| CV list | Before the editor (roving: one stop) | Selects | — | J / K / ↑ / ↓ move between CVs; F2 renames; Shift+F10 / Menu opens the row menu |
| Toolbar | "3 suggestions", Version history, Inspector (after the `h1`) | Activates | — | — |
| Jump nav | Next | Scrolls to the section and focuses its header | — | — |
| Section header | Next | Expands / collapses | — | Alt+↑ / Alt+↓ move the section (header pinned); live region announces "Moved Summary to position 3 of 9" |
| Item card | Inside the section | Expands / collapses | — | Alt+↑ / Alt+↓ move the item; focus stays on it |
| Bullet field | Inside the expanded item | — | — | Mod+Enter adds a line below |
| Tracked change | F8 / Shift+F8 focus it from anywhere | Buttons: Use / Keep / Edit | Keep original | Mod+Enter uses it (blocked while a placeholder is empty) |
| Inspector | After the preview | Tabs switch panels | — | ← / → between tabs (Radix); queue cards: A use, R keep, E show in CV |
| Preview | Focusable canvas | — | — | Arrows / Page keys scroll; Mod+= / Mod+- zoom |
| Restore dialog | Cancel first | Confirms the focused button | Cancels | — |

Toggles: Mod+Shift+D inspector, Mod+Shift+P preview (below 1100 px), Mod+Shift+H version history. All registered in the shortcuts sheet under "CV editor" / "CV suggestions" / "CVs".

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| Item card toggle | "Frontend Engineer, Pazarbox · Mar 2022 – Present, Led the rebuild…, 1 suggestion, collapsed, button" | — |
| Tracked change | "Suggested change: Add a result, group" then the text with "Removed: … Added: …" | — |
| Placeholder field | "Your number for [X%], edit text" | — |
| Disabled Use | "Use suggestion, dimmed, Fill in [X%] with your real numbers first." | — |
| Move result | Polite live region: "Moved Frontend Developer to position 1 of 3" | — |
| Preview pages | "Page 1 of 2, group" | — |

### Priority Fixes
1. **Focusable preview canvas** — fixed (`48e8aa7`).
2. **Jump nav reachable by Tab in WebKit** — fixed (`48e8aa7`).
3. **Label in name for item cards** — fixed (`cb76aa1`).
4. Keyboard equivalent for preview click-to-locate — logged (the form already reaches every field).
