## Accessibility Audit: Insights (desktop)
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23

Method (`skill://accessibility-review`): `pnpm --filter @bfhr/desktop capture:design insights --axe` (axe-core WCAG 2.1 A/AA) on populated, empty, loading, error, offline × light, dark × WebKit, Chromium (20 pages, `artifacts/a11y/desktop/insights-*.json`); accessible-name review in both engines; 640 px (≈200 % zoom) capture.

### Summary
**Issues found:** 2 | **Critical:** 0 | **Major:** 2 (fixed) | **Minor:** 0

Final axe run: **0 critical · 0 serious · 0 moderate · 0 minor** on all 20 pages. "Needs review": the decorative `▾` in filter chips and the `⌘` keycap (symbol-only elements; axe can't compute contrast).

|#|Issue|WCAG|Severity|Resolution|
|---|---|---|---|---|
|1|KPI tiles and funnel bars had `aria-label`s that didn't contain the visible text (axe `label-content-name-mismatch`, 9 nodes).|2.5.3 Label in Name|🟡 Major|**Fixed**: name = visible content; the full sentence is `aria-describedby`. Week bars add a visually hidden "Week of …" prefix.|
|2|Tables overflow horizontally at narrow widths with no keyboard scroll.|2.1.1 Keyboard|🟡 Major|**Fixed**: overflow wrappers are focusable named regions.|
|3|Charts: colour never carries meaning; each bar prints its value; funnel has a data table; chart groups are labelled with the sentence summary.|1.4.1, 1.1.1|✅|—|
|4|Range control: Radix toggle group, ←/→ between ranges; `F` focuses the filters; Mod+E export.|2.1.1|✅|—|
