# Tailor review (desktop) — accessibility review

Method: `pnpm --filter @bfhr/desktop capture:design tailor-review --states populated,empty,loading,error,offline --themes light,dark --sizes 1280x800,1920x1080 --axe` (axe-core, WCAG 2.1 A/AA, WebKit ≈ WKWebView and Chromium ≈ WebView2; 20 reports in `artifacts/a11y/desktop/tailor-review-*.json`), plus the DOM tests in `apps/desktop/src/features/apply/` and `features/settings/` and a code review of focus and live regions.

## Accessibility Audit: Tailor review

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary

axe: 0 critical · 0 serious · 0 moderate · 0 minor in all 20 runs. **Critical:** 0 · **Moderate:** 0 open.

### Keyboard Navigation

Heading (focused on open and on each step) → Close → intensity radios → Suggest edits; review: preview canvas (scroll, Mod+= / Mod+-) → Accept all / Keep original for the rest → cards (J/K move, A accept, R keep original) → Save as new version (Mod+Enter); Esc closes.

### Screen Reader

Region “Tailor your CV for Fernweh Reisen”; each card an article named by its location (“Reworded, Experience · Pazarbox · bullet 2”); Accept/Keep original are described by the card title; decisions are text (“Accepted”, “Original kept”), never colour alone; the tally is role=status.

### Color Contrast Check

All text and controls use the tested `@bfhr/ui-tokens` pairings (system.md "Allowed pairings"): `fg.primary`/`fg.secondary`/`fg.tertiary` on `surface.base` and `surface.sunken`, primary buttons `fg.onAccent` on `accent.solid`, control borders `line.control`, focus ring `line.focus`.

### Priority Fixes

None open.
