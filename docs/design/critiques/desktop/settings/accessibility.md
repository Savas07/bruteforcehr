# Settings (desktop) — accessibility review

Skill: `accessibility-review`. Scope: `/settings/$pane` for Mail accounts (with a running and a failed scan), Notifications, Job sources, Companies you follow (populated and empty), AI and General; light and dark; WebKit and Chromium; 1280×800; EN, TR, DE.

Evidence:

- axe-core (WCAG 2.1 A + AA) via a throwaway Playwright script on the design build: 8 pages × 2 themes × 2 engines, **0 violations**.
- Keyboard walk (WebKit): the settings nav is one Tab stop (current pane), ↑/↓ move to the next pane and keep focus on its link; switches toggle with Space and announce `aria-checked`; Esc leaves Settings back to the previous route; ⌘, / Ctrl+, opens Settings (shortcut `open-settings`, also in the shortcuts sheet and the palette).

## Accessibility Audit: Settings
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary
**Issues found:** 2 | **Critical:** 0 | **Major:** 1 (fixed) | **Minor:** 1 (fixed)

### Findings

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | ↓ in the settings nav opened the next pane but dropped focus on `<body>` (the route remounts the screen on a new `$pane`). | 2.4.3 Focus Order | 🟡 Major | Fixed: the pending nav focus survives the remount and lands on the new current link. |

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 2 | The "Saved" live region reserved an empty line under every company, which read as missing content. | 1.3.1 Info and Relationships (visual structure) | 🟢 Minor | Fixed: the region stays mounted for announcements but is flat while empty. |

#### Understandable / Robust
- Switches are `role="switch"` named by the row title and described by its helper; their On/Off (and Following/Paused) state is also visible text. Disabled switches (AI email text while AI is off) say why in the helper they are described by.
- Health (sources, companies, inboxes) is icon + text, never color alone; nothing is red.
- The disconnect AlertDialog focuses "Keep connected" first; the destructive button needs an explicit choice.

### Priority Fixes
None open.
