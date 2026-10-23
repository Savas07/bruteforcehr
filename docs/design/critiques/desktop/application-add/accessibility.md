## Accessibility Audit: Log an application (desktop)
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23

Command: `pnpm --filter @bfhr/desktop capture:design application-add --axe` (all states × light/dark × WebKit/Chromium, 1280×800 + 1920×1080). Reports: `artifacts/a11y/desktop/application-add-<state>-<theme>-<engine>.json`. Exit code 0.

### Axe summaries (verbatim)

```
a11y application-add-populated-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 7 needs review
a11y application-add-empty-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 8 needs review
a11y application-add-loading-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 5 needs review
a11y application-add-error-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 5 needs review
a11y application-add-offline-light-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 5 needs review
a11y application-add-populated-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 7 needs review
a11y application-add-empty-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 8 needs review
a11y application-add-loading-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 5 needs review
a11y application-add-error-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 5 needs review
a11y application-add-offline-dark-webkit: 0 critical · 0 serious · 0 moderate · 0 minor · 5 needs review
a11y application-add-populated-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 5 needs review
a11y application-add-empty-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 5 needs review
a11y application-add-loading-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 4 needs review
a11y application-add-error-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 4 needs review
a11y application-add-offline-light-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 4 needs review
a11y application-add-populated-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 5 needs review
a11y application-add-empty-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 5 needs review
a11y application-add-loading-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 4 needs review
a11y application-add-error-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 4 needs review
a11y application-add-offline-dark-chromium: 0 critical · 0 serious · 0 moderate · 0 minor · 4 needs review
20 axe reports in artifacts/a11y/desktop
```

Needs review, checked by hand: `aria-hidden-focus` ×5 (Radix Dialog's focus guards and the shell/board it marks `aria-hidden` behind the modal — focus is trapped in the dialog, so nothing hidden is reachable) and, in WebKit light, `color-contrast` on the shared `Keycaps` `<kbd>` chips (sidebar "Jump to…", the footer "⌘↩ to add" hint; `fg-secondary` on `surface-sunken`, the system's audited keycap pairing — axe can't compute it through the scrim).

### Summary
**Issues found:** 1 | **Critical:** 0 | **Major:** 0 | **Minor:** 1

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Dark loading skeleton: label bars match the elevated surface (decorative, `aria-hidden`; the region announces "Loading your tracker") | 1.4.11 (not applicable to decorative shapes) | 🟢 Minor | Skeleton token for elevated surfaces (design system follow-up) |

#### Operable
No issues. Mod+N opens from anywhere (also `openAddApplication()` and `?add=1`); focus starts on Company (or Role when Company is prefilled); Tab order follows the visual order; Esc closes or asks "Discard this application?" with "Keep editing" focused; Mod+Enter submits from any field including Notes; Enter submits from single-line fields.

#### Understandable
No issues. Every control has a visible `<label>`; optional fields say "(optional)"; required fields carry `aria-required`. Errors appear after the first add attempt (the link also on blur), under the field, linked by `aria-describedby`, with `aria-invalid`; with 2+ errors an assertive summary lists the fields as buttons that move focus.

#### Robust
No issues. Radix Dialog (`role="dialog"`, title + description) and AlertDialog for the discard prompt; native `select`/`optgroup`, `input type="date"` with `max` = today (the check also runs in code), `input type="url"`.

### Keyboard Navigation
| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|------------|
| Company, Role, Link, Location | 1, 2, 3, then after Sent via | Enter submits | Close / discard prompt | — |
| Status, Sent via, CV, Version | in visual order | opens native list | closes list, then dialog | change option |
| Applied on | after Status | — | Close | change date segment |
| Notes | after CV | newline; Mod+Enter submits | Close | — |
| Cancel · Add and open · Add application | last | activate | Close | — |

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| Dialog | "Log an application, dialog, Add an application you sent or are planning…" | — |
| Company (error) | "Company, required, invalid, Enter the company's name." | — |
| Duplicate note | status: "You're already tracking Frontend Engineer, Editor at Brightwave (Interviewing)." + "Open it" button | — |
| Disabled Add while loading | "Add application, dimmed, Your tracker is still loading." | — |
| Footer hint | "Command Enter to add" (Keycaps spoken form) | — |

### Priority Fixes
1. None blocking. Minor: elevated-surface skeleton token (design system).

Exit criteria met: zero Critical, zero open Moderate (r2), zero axe serious/critical.
