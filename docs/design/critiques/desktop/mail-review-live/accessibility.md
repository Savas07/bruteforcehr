# Mail review on live data (desktop) — accessibility review

Skill: `accessibility-review`. Scope: what changed since the M0 audit (`../mail-review/accessibility.md`): the Suggested interview card, Open in {provider}, the read-only Status row in the correction popover, the inbox-scan bundle view, the Emails section on the application page and the scan line on Today. Light and dark, WebKit and Chromium, 1280×800.

Evidence:

- axe-core (WCAG 2.1 A + AA) on `/mail`, `/mail/review/mail-nordlicht-invite`, `/mail?folder=updates`, `/tracker/applications/app-brightwave` and `/today?scan=running`, both themes and engines: **0 violations** (20 pages).
- Unit tests: held decisions, Undo inside and after the window, Not job mail and auto-change Undo (`src/data/mail/actions.test.tsx`); the E2E spec drives Confirm and the timeline Undo by role and text (`e2e/specs/mail.e2e.ts`).

## Accessibility Audit: Mail review (live)
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary
**Issues found:** 0 new | **Critical:** 0 | **Major:** 0 | **Minor:** 0

### Notes
- Suggested interview is a labelled `<section>` with an `<h2>`; its time is a `<time datetime>` with the absolute date as title; "Add interview" explains why it's disabled offline.
- The popover's Status row is plain text described to the search field (`aria-describedby`), so Tab still cycles only the two editable fields and the outcome is announced.
- "Back to To review" in the bundle view is an icon button with that accessible name and a tooltip.
- Application page: the Emails list items are links whose name is the subject plus category, sender and time.

### Priority Fixes
None open.
