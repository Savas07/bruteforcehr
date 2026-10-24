# Settings › Application answers (desktop) — accessibility review

Method: `pnpm --filter @bfhr/desktop capture:design answers-settings --states populated,empty,loading,error,offline --themes light,dark --sizes 1280x800,1920x1080 --axe` (axe-core, WCAG 2.1 A/AA, WebKit ≈ WKWebView and Chromium ≈ WebView2; 20 reports in `artifacts/a11y/desktop/answers-settings-*.json`), plus the DOM tests in `apps/desktop/src/features/apply/` and `features/settings/` and a code review of focus and live regions.

## Accessibility Audit: Settings › Application answers

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary

axe: 0 critical · 0 serious · 0 moderate · 0 minor in all 20 runs. **Critical:** 0 · **Moderate:** 0 open.

### Keyboard Navigation

Add answer → list (nav, aria-current on the open answer) → editor: Move up/Move down (disabled with a reason) → Group → Question or label → one text box per language → Countries → Currency (salary) → Save answer (Enter) / Cancel / Delete (Undo in the toast).

### Screen Reader

Validation errors are role=alert and move focus to the field; hints are aria-describedby; language text boxes carry lang.

### Color Contrast Check

All text and controls use the tested `@bfhr/ui-tokens` pairings (system.md "Allowed pairings"): `fg.primary`/`fg.secondary`/`fg.tertiary` on `surface.base` and `surface.sunken`, primary buttons `fg.onAccent` on `accent.solid`, control borders `line.control`, focus ring `line.focus`.

### Priority Fixes

None open.
