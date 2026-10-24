# Cover letter editor (desktop) — accessibility review

Method: `pnpm --filter @bfhr/desktop capture:design cover-letter --states populated,empty,loading,error,offline --themes light,dark --sizes 1280x800,1920x1080 --axe` (axe-core, WCAG 2.1 A/AA, WebKit ≈ WKWebView and Chromium ≈ WebView2; 20 reports in `artifacts/a11y/desktop/cover-letter-*.json`), plus the DOM tests in `apps/desktop/src/features/apply/` and `features/settings/` and a code review of focus and live regions.

## Accessibility Audit: Cover letter editor

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary

axe: 0 critical · 0 serious · 0 moderate · 0 minor in all 20 runs. **Critical:** 0 · **Moderate:** 0 open.

### Keyboard Navigation

Template select → Tone radio group (←/→) → Language → Draft with AI → Use template → Cover letter text → Insert field… → Save as template → Fields to fill inputs; footer Review (Mod+Enter).

### Screen Reader

Every control has a visible label; the unresolved field input is aria-invalid and the footer blocker (role=status) names it; the AI draft banner carries the AI badge and the disclosure line.

### Color Contrast Check

All text and controls use the tested `@bfhr/ui-tokens` pairings (system.md "Allowed pairings"): `fg.primary`/`fg.secondary`/`fg.tertiary` on `surface.base` and `surface.sunken`, primary buttons `fg.onAccent` on `accent.solid`, control borders `line.control`, focus ring `line.focus`.

### Priority Fixes

None open.
