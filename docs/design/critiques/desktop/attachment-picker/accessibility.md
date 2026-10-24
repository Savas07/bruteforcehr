# Attachment picker (desktop) — accessibility review

Method: `pnpm --filter @bfhr/desktop capture:design attachment-picker --states populated,empty,loading,error,offline --themes light,dark --sizes 1280x800,1920x1080 --axe` (axe-core, WCAG 2.1 A/AA, WebKit ≈ WKWebView and Chromium ≈ WebView2; 20 reports in `artifacts/a11y/desktop/attachment-picker-*.json`), plus the DOM tests in `apps/desktop/src/features/apply/` and `features/settings/` and a code review of focus and live regions.

## Accessibility Audit: Attachment picker

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary

axe: 0 critical · 0 serious · 0 moderate · 0 minor in all 20 runs. **Critical:** 0 · **Moderate:** 0 open.

### Keyboard Navigation

From your files… (dialog: checkboxes, Cancel, Attach n files; Esc closes and returns focus) → From this computer… (system picker) → remove buttons per extra file.

### Screen Reader

The dialog is a labelled Radix dialog with a description; checkboxes are labelled by the file row; remove buttons name the file; refusals are one sentence in a role=status line. With the dialog open, axe lists 8–9 “needs review” colour-contrast nodes behind the modal scrim (not violations; the background is inert).

### Color Contrast Check

All text and controls use the tested `@bfhr/ui-tokens` pairings (system.md "Allowed pairings"): `fg.primary`/`fg.secondary`/`fg.tertiary` on `surface.base` and `surface.sunken`, primary buttons `fg.onAccent` on `accent.solid`, control borders `line.control`, focus ring `line.focus`.

### Priority Fixes

None open.
