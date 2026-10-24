# Application kit (desktop) — accessibility review

Method: `pnpm --filter @bfhr/desktop capture:design apply-kit --states populated,empty,loading,error,offline --themes light,dark --sizes 1280x800,1920x1080 --axe` (axe-core, WCAG 2.1 A/AA, WebKit ≈ WKWebView and Chromium ≈ WebView2; 20 reports in `artifacts/a11y/desktop/apply-kit-*.json`), plus the DOM tests in `apps/desktop/src/features/apply/` and `features/settings/` and a code review of focus and live regions.

## Accessibility Audit: Application kit

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary

axe: 0 critical · 0 serious · 0 moderate · 0 minor in all 20 runs. **Critical:** 0 · **Moderate:** 0 open.

### Keyboard Navigation

Heading → Did you submit? (Yes Y, Not yet N, I'm not applying) → CV select → Tailor for this job → Open / Show in Finder / Copy path → Add a cover letter → answers (1–9 copy while focus is in the kit) → Open company site (Mod+Enter); Esc closes.

### Screen Reader

Copy buttons are named by their row (“Copy Notice period”); the toast names what was copied; long answers expand with aria-expanded; file actions are described by the file row.

### Color Contrast Check

All text and controls use the tested `@bfhr/ui-tokens` pairings (system.md "Allowed pairings"): `fg.primary`/`fg.secondary`/`fg.tertiary` on `surface.base` and `surface.sunken`, primary buttons `fg.onAccent` on `accent.solid`, control borders `line.control`, focus ring `line.focus`.

### Priority Fixes

None open.
