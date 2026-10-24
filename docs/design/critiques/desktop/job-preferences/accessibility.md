# Settings › Job preferences (desktop) — accessibility review

Skill: `accessibility-review`. Scope: `/settings/job-preferences` (design build, persona populated), light and dark, WebKit and Chromium, 1280×800 and 1920×1080, EN; TR and DE in Chromium, light.

Evidence:

- axe-core (WCAG 2.1 A + AA) via `pnpm --filter @bfhr/desktop capture:design settings-job-preferences --states populated --axe`: **0 violations** in every engine, theme and language (one "needs review" item in WebKit dark: axe can't compute contrast over the sunken token surface; checked by eye in the capture, the text uses `fg.primary` on `surface.sunken`, the same pair as other tokens).
- Unit test (`JobPreferencesPane.test.tsx`): chips expose `aria-pressed`, "Remove {role}" buttons, autosave per section, the "Saved" status.

## Accessibility Audit: Settings › Job preferences

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary

**Issues found:** 0 | **Critical:** 0 | **Major:** 0 | **Minor:** 0

### Findings

- Each section is a `section` labelled by its `h2`; multi-control sections are `role="group"` named by the heading and described by the helper.
- The "Saved" feedback is a polite live region (`useSaver`), mounted with the section that changed before the write settles, so the outcome is announced.
- The salary amount, currency and period controls each have an accessible name ("Amount", "Currency", "Period"); the period is a Radix toggle group (← / → move, selection not by color alone).
- Language levels are native selects named "{language} level"; adding another language is a named select.
- Keyboard: every control is in the Tab order in reading order; the Settings nav keeps its ↑ / ↓ behaviour and Esc leaves Settings.

### Priority Fixes

None open.
