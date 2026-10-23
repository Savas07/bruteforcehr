## Accessibility Audit: Sign-in with an email link (desktop)

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23

Method:

1. Automated scan: `pnpm --filter @bfhr/desktop capture:design sign-in --axe` (+ `--locale tr|de`): axe-core WCAG 2.1 A/AA on all 18 sign-in states × WebKit (≈ WKWebView) + Chromium (≈ WebView2) × light + dark (TR/DE: light). Reports: `artifacts/a11y/desktop/{,tr/,de/}sign-in-<state>-<theme>-<engine>.json`.
2. A keyboard-only probe in both engines (Playwright, no pointer): Tab order per state, Enter to submit, an invalid address, send → "Check your email", Esc back, focus on each step's entry, and a 640×400 viewport (≈ 1280×800 at 200 % zoom).
3. Names and roles from the accessibility tree (Playwright `ariaSnapshot`) for the waiting and expired states. No live VoiceOver / NVDA session in this round.
4. The real apps (macOS + Windows CI, run 39927355856) for rendering. The E2E suite drives the gate and the error states with WebDriver.

### Summary

**Issues found:** 5 | **Critical:** 0 | **Major:** 2 (fixed) | **Minor:** 3 (1 fixed, 2 kept)

Final axe result: **0 critical · 0 serious · 0 moderate · 0 minor** in every run (EN 72 pages, TR 36, DE 36). No "needs review" items.

### Findings

#### Perceivable

| #   | Issue                                                                                                 | WCAG Criterion              | Severity | Recommendation                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | An invalid address kept the teal focus border, so while focused the error showed only in the message. | 1.4.1 Use of Color / 1.4.11 | 🟢 Minor | Fixed: danger border and outline while the error shows, plus the icon and text under the field.                                                                       |
| 2   | The countdown "Send again in 0:42" changes every second.                                              | 4.1.3 Status Messages       | 🟢 Minor | Kept: it's in the disabled button's name only, never in a live region. One `role="status"` line announces "You can send another link now." when it becomes available. |

#### Operable

| #   | Issue                                                                                                    | WCAG Criterion    | Severity | Recommendation                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | After a step changed, focus was left on a control that no longer existed (the old step unmounts).        | 2.4.3 Focus Order | 🟡 Major | Fixed: every step sets focus on entry. The email and confirm steps focus their field. "Check your email", "Signing you in…" and the link errors focus their heading (`tabIndex=-1`), so screen readers announce the new step. Probe: both engines. |
| 4   | With focus on the disabled "Send again", the first Esc closes its tooltip and only the second goes back. | 2.1.1 Keyboard    | 🟢 Minor | Kept: dismissing the transient tooltip first is the platform norm. From anywhere else one Esc returns to the email step with the address kept.                                                                                                     |

#### Understandable

| #   | Issue                                                       | WCAG Criterion         | Severity | Recommendation                                        |
| --- | ----------------------------------------------------------- | ---------------------- | -------- | ----------------------------------------------------- |
| 5   | Error states didn't say where "Send a new link" would send. | 3.3.3 Error Suggestion | 🟡 Major | Fixed: "We'll send it to **{email}**." (critique r1). |

#### Robust

- Field: `<label for>`, `type="email"`, `autocomplete="email"`, `aria-invalid` and `aria-describedby` pointing at the error while it shows.
- Send failures use `role="alert"` (the user's own action). The resend confirmation and readiness use `role="status"`.
- Disabled buttons stay focusable (`aria-disabled`) and explain why (tooltip + accessible description).
- One `h1` per state. The window title follows the state ("Sign in · BruteForceHR", per language).

### Color Contrast Check

All text pairs passed axe's contrast rule in both themes and both engines. The disabled "Send again" label is exempt (inactive component). The neutral error icon circle is decorative (`aria-hidden`); the title carries the meaning.

### Keyboard Navigation

| Element            | Tab Order                                                      | Enter/Space                | Escape                          | Arrows |
| ------------------ | -------------------------------------------------------------- | -------------------------- | ------------------------------- | ------ |
| Email step         | field → Send sign-in link → Terms → Privacy Policy             | Enter in the field submits | —                               | —      |
| Check your email   | heading → Open {provider} → Send again → Use a different email | activates                  | back to the email step          | —      |
| Confirm your email | field → Sign in → Request a new link instead                   | Enter submits              | back to the email step          | —      |
| Link errors        | heading → primary → Use a different email (when shown)         | activates                  | back (when a way back is shown) | —      |

### Priority Fixes

All Major findings are fixed. Open item for a later round: a live VoiceOver (macOS) and NVDA (Windows) pass once the real sign-in email can be clicked on a test device.
