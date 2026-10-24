# Onboarding wizard (desktop) — accessibility review

Skill: `accessibility-review`. Scope: the nine `onboarding` design states (`?onboarding=`), light and dark, WebKit (≈ WKWebView) and Chromium (≈ WebView2), 1280×800 and 1920×1080, EN; `cv`, `preferences-cv`, `finish` in TR and DE.

Evidence:

- axe-core (WCAG 2.1 A + AA) via `pnpm --filter @bfhr/desktop capture:design onboarding --axe`: 9 states × 2 themes × 2 engines (EN) plus 3 states × TR/DE (Chromium, light), **0 violations**.
- Keyboard walk (throwaway Playwright script on the design build, Chromium with the Windows chrome): focus starts on the step title; Tab reaches Import a CV file → Start from scratch → Skip for now, then the header's Sign out; Ctrl+Enter moves CV → Preferences and focus lands on the new title; Alt+← goes back. In the role field Enter adds a role and "Added Data Engineer" is announced through the polite region; Backspace in the empty field removes the last role. The failed setup state renders `role="alert"` with "Try again".
- Unit tests (`OnboardingWizard.test.tsx`): step label "Step 1 of 3", `aria-current="step"`, name validation message, failure alert.

## Accessibility Audit: Onboarding wizard

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary

**Issues found:** 1 | **Critical:** 0 | **Major:** 0 | **Minor:** 1 (logged)

### Findings

#### Operable

| #   | Issue                                                                                                        | WCAG Criterion    | Severity | Recommendation                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | After focus moves to the step title, the header (Back, Sign out) comes after the footer in the Tab sequence. | 2.4.3 Focus Order | 🟢 Minor | Logged: DOM order matches the visual order; focus starts mid-page on purpose so the new step is announced. Shift+Tab reaches Back, and ⌘[ / Alt+← work anywhere. |

#### Perceivable / Understandable / Robust

- Stepper: `nav` "Setup steps" with an ordered list; current step `aria-current="step"`; finished steps carry "{step}, done" for screen readers; the ✓ glyph is decorative. "Step n of 3" is also visible text.
- Chips use `aria-pressed` with ✓ / + glyphs (never color alone); seniority, workplace and quick-add places are named groups.
- Work authorization is a `fieldset` per country with a `legend` question and native radios.
- Token remove buttons are named "Remove {name}"; adds and removals are announced politely.
- The name field is labelled by its section heading, `aria-invalid` with the error tied by `aria-describedby`.
- Errors that follow the user's action (profile setup, saving) use `role="alert"`; nothing is red alone (icon + text + border).

### Priority Fixes

None open.
