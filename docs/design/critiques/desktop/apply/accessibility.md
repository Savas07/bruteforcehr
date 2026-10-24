# Apply by email (desktop) — accessibility review

Method: `pnpm --filter @bfhr/desktop capture:design apply --states populated,empty,loading,error,offline --themes light,dark --sizes 1280x800,1920x1080 --axe` (axe-core, WCAG 2.1 A/AA, WebKit ≈ WKWebView and Chromium ≈ WebView2; reports in `artifacts/a11y/desktop/apply-*.json`), plus the DOM tests in `apps/desktop/src/features/apply/EmailApplyPanel.test.tsx` (labels, Mod+Enter / Esc, blocker line, toasts) and a code review of focus and live regions.

## Accessibility Audit: Jobs — Apply by email
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary
**Issues found:** 4 | **Critical:** 0 | **Major:** 1 (fixed) | **Minor:** 3 (2 fixed, 1 logged)

axe: 0 critical · 0 serious · 0 moderate · 0 minor in all 20 runs; "needs review" nodes are outside the panel (shell keycap, a truncated job-list row).

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | What is attached was only visible after scrolling the form. | 1.3.1 / 3.3.2 | 🟢 Minor | **Fixed** (r1): the footer status line names the attachments when nothing blocks. |
| 2 | The send countdown ticks every second. | 4.1.3 Status Messages | 🟢 Minor | **Fixed by design**: the toast's timer is `role="timer"` and excluded from the toast announcement, so "Sending to …" is announced once; the panel's countdown is also `role="timer"` (not live). |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 3 | The Jobs screen's single-key shortcuts (A, S, D, O) would fire while focus is on a panel button. | 2.1.4 Character Key Shortcuts | 🟡 Major | **Fixed** (owner): disabled while the panel is open. |
| 4 | The 10 s undo window is a time limit. | 2.2.1 Timing Adjustable | 🟢 Minor | **Logged**: the email can't be recalled after the server's send time (D11); Undo stays reachable from the toast (Mod+Z / F6) and from the panel. |

### Keyboard Navigation
| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|------------|
| Panel | Heading (focused on open and on each step) → Close → From → To → Subject → Message → CV → Cover letter toggle (→ letter) → footer | Mod+Enter: Review, then Send / I sent it | Closes, draft kept for the session (also in text fields) | Native select options |
| Review | Edit → Send to … (or the mail-app steps: Save CV as PDF, Save cover letter as PDF, Open in your mail app, Copy message → I sent it) | Activates | Closes | — |
| Toast | F6 | Undo (Mod+Z), Send now | — | — |

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| Panel | region "Apply to Fernweh Reisen" | — |
| To | "To, edit text, bewerbung@…, From the job posting" (`aria-describedby`) | — |
| Blocker line | `role="status"`: "Add the address to send your application to." when it changes | — |
| Disabled primary | "Review email, dimmed" + the reason as its description | — |
| Send error | `role="alert"`: one calm sentence ("Daily limit reached. Your draft is saved, …") | — |
| Toast | "Sending to bewerbung@fernweh-reisen.de, Undo Ctrl Z, Send now" | — |

### Color Contrast Check
All text and controls use tested `@bfhr/ui-tokens` pairings (system.md "Allowed pairings"): `fg.primary`/`fg.secondary`/`fg.tertiary` on `surface.base` and `surface.sunken` (≥ 5.18:1), primary button `fg.onAccent` on `accent.solid` (6.51 / 4.58:1), control borders `line.control` (≥ 3:1), focus ring `line.focus` (≥ 3:1).

### Priority Fixes
1. **Single-key shortcuts off while composing** (done by the owner).
