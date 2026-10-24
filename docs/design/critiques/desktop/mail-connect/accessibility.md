# Connect your email (desktop) — accessibility review

Skill: `accessibility-review`. Scope: the connect dialog in every step (`?connect=picker|oauth-intro|oauth-unavailable|outlook-unavailable|oauth-waiting|oauth-error|imap|imap-other|imap-error|imap-testing|reconnect|scanning`, `?scan=running|done|failed`), light and dark, WebKit (≈ WKWebView) and Chromium (≈ WebView2), 1280×800; EN, TR and DE.

Evidence:

- axe-core (WCAG 2.1 A + AA tags) through a Playwright script on the design build (throwaway, not committed): picker, imap-other, imap-error, outlook-unavailable, oauth-waiting, oauth-error, scanning (scan done) and reconnect, each in both themes and both engines: **0 violations** (32 pages).
- Keyboard walk (WebKit): open → focus in the address field; Tab → the selected provider tile; ←/→/↑/↓ move and select tiles (radio group, roving tabindex); Enter continues; the form opens with focus in the first empty field (password when the address is known); Esc closes and focus returns to the opener ("Add email account", Reconnect in Mail's callout).
- Unit tests (`MailConnectHost.test.tsx`): the refused password marks its field `aria-invalid` with the message tied by `aria-describedby`.

## Accessibility Audit: Connect your email
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary
**Issues found:** 3 | **Critical:** 0 | **Major:** 2 (fixed) | **Minor:** 1 (fixed)

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | Two headings per step (dialog title + step title) were both announced. | 1.3.1 Info and Relationships | 🟢 Minor | Fixed: the dialog title names the step. |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 2 | The dialog opened with focus on Close; keyboard users had to Tab back to the form. | 2.4.3 Focus Order | 🟡 Major | Fixed: focus starts in the step's first empty field and moves there on every step change. |
| 3 | After Esc, focus fell to `<body>`: the dialog has no Radix trigger. | 2.4.3 Focus Order | 🟡 Major | Fixed: the host remembers the opener and returns focus to it. |

#### Understandable
- Field errors say what happened and how to fix it, next to the field; several invalid fields add a summary with `role="alert"`; server failures without a field show an inline error alert. The not-configured state is a `role="status"` message, never an error.

#### Robust
- Provider tiles are `role="radio"` in a labelled `role="radiogroup"`; the password toggle is a pressed/unpressed button with a changing name; the scan stages announce politely (`aria-live`), the counter does not.

### Color Contrast Check
axe found no contrast failures; the selected tile is marked by border, ring and fill, never color alone.

### Keyboard Navigation
| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|-----------|
| Provider tiles | one stop (selected tile) | Enter continues | closes | move + select |
| Form | address → password → show/hide → Server settings → … → footer | Enter submits | closes (blocked while testing) | — |

### Screen Reader
| Element | Announced As | Issue |
|---------|-------------|-------|
| Waiting for Google | status | — |
| Scan stage | "Finding job-related emails, in progress" | — |

### Priority Fixes
None open.
