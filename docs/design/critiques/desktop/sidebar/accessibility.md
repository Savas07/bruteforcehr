## Accessibility Audit: Sidebar navigation (desktop)

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

Method: axe-core WCAG 2.1 A/AA on `rail` and `rail-focus` (+ the sidebar inside every palette/sheet state) × WebKit + Chromium × light + dark × EN/TR/DE via `capture:design chrome --axe` (24 rail reports, 0 violations); Tab walk of every top-level screen in both engines at 1280 and 600 px ([keyboard-pass.md](../keyboard-pass.md)); real-app E2E (`app.e2e.ts`).

### Summary

**Issues found:** 1 | **Critical:** 0 | **Major:** 1 (fixed) | **Minor:** 0

| #   | Issue                                                                                                     | WCAG Criterion | Severity | Recommendation                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------ |
| 1   | macOS (WKWebView): section links and Settings unreachable with Tab.                                       | 2.1.1 Keyboard | 🟡 Major | Fixed: `tabFocusesLinks`. Other controls follow macOS "Keyboard navigation", like every Mac app. |
| —   | Rail: icon-only rows keep their name (sr-only label) and show it with the shortcut in a tooltip on focus. | 2.4.6 / 1.1.1  | —        | Pass.                                                                                            |
| —   | Current section: `aria-current="page"` plus a fill, not colour alone.                                     | 1.4.1 / 4.1.2  | —        | Pass.                                                                                            |
| —   | Bypass: `nav` "Sections" and `main` landmarks; ⌘1–6 focus the section title.                              | 2.4.1          | —        | Pass.                                                                                            |

### Keyboard Navigation

| Element            | Tab Order | Enter/Space       | Escape | Arrow Keys |
| ------------------ | --------- | ----------------- | ------ | ---------- |
| Jump to…           | 1st       | Opens the palette | —      | —          |
| Sections, Settings | Next 7    | Navigate          | —      | —          |
| Keyboard shortcuts | Last      | Opens the sheet   | —      | —          |
