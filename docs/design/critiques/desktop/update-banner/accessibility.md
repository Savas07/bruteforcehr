## Accessibility Audit: Update banner, "Check for Updates…" and "Update required" (desktop)
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23

Method:
1. Automated scan: `pnpm --filter @bfhr/desktop capture:design update --axe` (+ `--locale tr|de`): axe-core WCAG 2.1 A/AA on all 17 update states × WebKit (≈ WKWebView) + Chromium (≈ WebView2) × light + dark, per language. Reports: `artifacts/a11y/desktop/{,tr/,de/}update-<state>-<theme>-<engine>.json`.
2. Keyboard-only probe in both engines (Playwright, no pointer for the checked paths): card, Later / expand, What's new, Tab cycles in the notes dialog and the gate, Esc, ⌘K / Ctrl+K behind the gate; 640 px wide (≈ 1280 px at 200 % zoom) for the notes dialog and the gate.
3. Names and roles from the accessibility tree (Playwright `ariaSnapshot`). No live VoiceOver / NVDA session in this round.

### Summary
**Issues found:** 6 | **Critical:** 0 | **Major:** 4 (all fixed) | **Minor:** 2 (1 fixed, 1 kept)

Final axe result: **0 critical · 0 serious · 0 moderate · 0 minor** in every run (EN, TR, DE). "Needs review" items: text over the modal scrim (axe can't resolve the background through `bg-surface-scrim`) and the shell's ⌘ keycap in WebKit; the dialog text itself sits on `surface-elevated`.

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | The rail's "update ready" dot was drawn inside the icon and invisible. | 1.4.11 Non-text Contrast | 🟡 Major | Fixed: 8 px dot outside the icon's stroke; the button's name also says "Update ready: version 0.1.1", so the dot is not the only cue. |
| 2 | Progress track (`surface-sunken`) barely visible on the gate's canvas. | 1.4.11 | 🟢 Minor | Fixed: `line-subtle` track. The percentage and MB are also in text and in `aria-valuenow`. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 3 | Behind "Update required", ⌘K / Ctrl+K and the keymap still acted on the hidden shell. | 2.4.3 Focus Order / 2.1.2 | 🟡 Major | Fixed: the shell ignores its commands while the gate blocks. Probe: palette count 0 after ⌘K/Ctrl+K; Tab cycles Try again ↔ Download from the website; Esc leaves the gate up. |
| 4 | "Later" and the collapsed line replace each other and focus fell to `<body>`. | 2.4.3 | 🟡 Major | Fixed: focus moves to the replacement control. |
| 5 | Closing a dialog (Esc, Close) returned focus to `<body>`: no Radix trigger. | 2.4.3 | 🟡 Major | Fixed: focus returns to the control that opened the first dialog (keyboard: "What's new" after Esc, both engines). WebKit doesn't focus buttons on mouse click (platform behaviour), so after a click focus starts from the document, as in every Safari page. |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| — | Errors name what failed and what to do ("Couldn't check for updates · Check your internet connection, then try again. Your current version keeps working."); the save-first prompt names the item and the consequence. | 3.3.1 Error Identification | — | Pass. |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 6 | Collapsed line's name read "Update ready , 0.1.1" (sr-only fragment). | 4.1.2 Name, Role, Value | 🟢 Minor | Fixed: `aria-label="Update ready: version 0.1.1"`; the visible "Update ready" starts the name (2.5.3 Label in Name). |

### Color Contrast Check
All text uses `fg-primary` / `fg-secondary` / `accent-text` / `warning-text` / `success-text` on `surface-base` / `surface-elevated` / `surface-canvas`, and the primary button `fg-on-accent` on `accent-solid`; the pairs are covered by the `@bfhr/ui-tokens` contrast tests, and axe `color-contrast` passes on every update element in both themes and engines.

### Keyboard Navigation
| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|------------|
| Update card | Later → Restart to update → What's new (after the sidebar destinations) | Later collapses (focus → collapsed line); Restart asks to save first or restarts; What's new opens the notes | — | — |
| Collapsed line / rail icon | One stop | Expands (focus → Later) / opens "Software update" | — | — |
| Check / notes dialogs | ✕ → content actions; trapped | Activates | Closes, focus back to the opener | — |
| Save-first prompt | Keep editing (initial) → Save and restart | Activates | Closes (= Keep editing) | — |
| Update required | Try again → Download from the website (or Restart to update); trapped | Activates | Ignored (blocking) | — |

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| Card | region "Update ready", heading level 2, buttons "Later" (expanded), "Restart to update", "What's new" | — |
| Collapsed line / rail | button "Update ready: version 0.1.1" (collapsed) | — |
| Check dialog | dialog "<state headline>"; body is a polite `status` region, so each step of a manual check is announced | — |
| Download | progressbar "Download of version 0.1.1", value 45 | — |
| Gate | alertdialog "Update required", description = the versions sentence; actions inside a `status` region | — |
| Restart (busy) | button "Restarting…" (aria-busy via `Button loading`) | — |

### Priority Fixes
All Major findings are fixed. Logged: a live VoiceOver / NVDA pass when the release flow first runs end to end on real installs (M1 acceptance).
