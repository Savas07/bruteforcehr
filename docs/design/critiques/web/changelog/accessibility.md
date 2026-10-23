# Changelog · Web · accessibility review

- **Skill:** `accessibility-review` (WCAG 2.1 AA), run after critique [r2](r2.md).
- **Build:** branch `m1/web-release` (r2 build), route `/changelog/`, both release states.
- **Methods:** as for [Home](../home/accessibility.md): Lighthouse 13.5.0 mobile + desktop, keyboard walk, reflow at 320 / 640 px, touch-target scan at 375, token contrast. Not run: a real screen reader session.

## Accessibility Audit: Changelog

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23

### Summary

**Issues found:** 1 | **Critical:** 0 | **Major:** 0 | **Minor:** 1 (fixed)

### Findings

#### Perceivable

| #   | Issue                                                                                           | WCAG Criterion | Severity | Recommendation |
| --- | ----------------------------------------------------------------------------------------------- | -------------- | -------- | -------------- |
| 1   | Release-note headings from GitHub are shifted to `h3`–`h6` so they nest under the version `h2`. | 1.3.1          | —        | —              |
| 2   | Beta is text ("Beta" badge, "(Beta)" in the feed title), not colour alone.                      | 1.4.1          | —        | —              |

#### Operable

| #   | Issue                                                                                                               | WCAG Criterion       | Severity | Recommendation               |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------------- | -------- | ---------------------------- |
| 1   | "Version X on GitHub" links were only as tall as their text.                                                        | 2.5.5 (project rule) | 🟢 Minor | **Fixed** (r2 build): 44 px. |
| 2   | The sticky version column at 1280+ is plain CSS `position: sticky`; no focus is trapped and nothing moves on focus. | 2.4.3                | —        | —                            |

#### Understandable

| #   | Issue                                                          | WCAG Criterion      | Severity | Recommendation |
| --- | -------------------------------------------------------------- | ------------------- | -------- | -------------- |
| 1   | Empty state says what's missing, why, and how to get notified. | 3.3.2 (informative) | —        | —              |

#### Robust

| #   | Issue                                                                                                                                                                               | WCAG Criterion | Severity | Recommendation |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- | -------------- |
| 1   | Each release is an `article` labelled by its heading inside an `ol`; dates are `<time datetime>`. The feed is advertised with `<link rel="alternate" type="application/atom+xml">`. | 4.1.2          | —        | —              |

### Color Contrast Check

| Element                   | Foreground     | Background    | Ratio             | Required | Pass? |
| ------------------------- | -------------- | ------------- | ----------------- | -------- | ----- |
| Notes text (light / dark) | `fg.primary`   | canvas        | 16.26:1 / 16.39:1 | 4.5:1    | ✅    |
| Dates (light / dark)      | `fg.secondary` | canvas        | 7.31:1 / 8.63:1   | 4.5:1    | ✅    |
| Beta badge (light / dark) | `info.text`    | `info.subtle` | 4.64:1 / 5.27:1   | 4.5:1    | ✅    |
| Links (light / dark)      | `fg.link`      | canvas        | 6.53:1 / 8.40:1   | 4.5:1    | ✅    |

### Keyboard Navigation

| Element                                             | Tab Order | Enter/Space | Escape      | Arrow Keys |
| --------------------------------------------------- | --------- | ----------- | ----------- | ---------- |
| Skip link, header                                   | 1–5       | follow      | Menu: close | —          |
| Feed, All releases                                  | 6–7       | follow      | —           | —          |
| Links inside notes, "Version X on GitHub" per entry | next      | follow      | —           | —          |

### Screen Reader

| Element     | Announced As                                                     | Issue |
| ----------- | ---------------------------------------------------------------- | ----- |
| Entry       | article "Version 0.1.1", heading level 2, time "30 October 2026" | —     |
| Empty state | region "No releases yet"                                         | —     |

### Lighthouse (13.5.0)

| Run     | Performance | Accessibility | Best Practices | SEO |
| ------- | ----------- | ------------- | -------------- | --- |
| Mobile  | 100         | 100           | 100            | 100 |
| Desktop | 100         | 100           | 100            | 100 |

LCP 0.91 s mobile / 0.25 s desktop, CLS 0.

### Priority Fixes

1. None open.
