# App icon and wordmark · accessibility review

- **Skill:** `accessibility-review` (WCAG 2.1 AA), run after app icon [r2](r2.md) and wordmark [r2](../wordmark/r2.md).
- **Scope:** app icon on iOS, macOS, Windows/Linux and as favicon; the wordmark lockup in the website header and footer.
- **Methods:** contrast computed from hex values (WCAG relative luminance); pixel-zoom inspection of the 16/24/32 px renders (`r2/sizes.png`); Icon Composer renditions at 29–128 pt (`r2/appearances.png`); Playwright on the built site (`/support/`): accessibility snapshot of the banner, Tab order, focus outline, icon `<link>`s and their HTTP responses. Not run: a real VoiceOver/NVDA session — the screen-reader table is derived from the accessibility tree.

## Accessibility Audit: App icon and wordmark

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23

### Summary

**Issues found:** 3 | **Critical:** 0 | **Major:** 0 | **Minor:** 3

Logos and logotypes are exempt from 1.4.3 / 1.4.5 / 1.4.11; the checks below hold them to the non-text 3:1 and text 4.5:1 targets anyway, because the icon is how people find the app.

### Findings

#### Perceivable

| #   | Issue                                                                                                         | WCAG Criterion | Severity | Recommendation                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------- | -------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Icon plate bottom edge `#1B5954` is 2.36:1 on `#0E1014` and 2.18:1 on `#16191F` (dark canvases, dark header). | 1.4.11 (guide) | 🟢 Minor | The white B (≥ 4.58:1) and the plate's top edge identify the icon; the OS draws its own rim on iOS/macOS 26. Logged. |
| 2   | Tinted Dark rendition: glyph contrast depends on the user's tint (system-derived).                            | 1.4.11 (guide) | 🟢 Minor | Not controllable from the `.icon`; logged.                                                                           |
| 3   | The website lockup is an image of text and doesn't respond to minimum-font-size settings.                     | 1.4.4 / 1.4.5  | 🟢 Minor | Logotype exemption; the name also appears as live text (page title, footer line). Accepted.                          |
| —   | Lockup has a text alternative: `role="img"` + `aria-label="BruteForceHR"` (from `SITE_NAME`).                 | 1.1.1          | —        | Pass.                                                                                                                |

#### Operable

| #   | Issue                                                                                                   | WCAG Criterion | Severity | Recommendation |
| --- | ------------------------------------------------------------------------------------------------------- | -------------- | -------- | -------------- |
| —   | Header lockup link is 199 × 44 px; footer link keeps `min-h-11` (44 px).                                | 2.5.5          | —        | Pass.          |
| —   | Header lockup link is the second Tab stop (after the skip link) and shows the 2 px solid focus outline. | 2.4.3 / 2.4.7  | —        | Pass.          |

#### Understandable

No findings: the lockup links to `/` in both places, as before.

#### Robust

| #   | Issue                                                                                                                                                                           | WCAG Criterion | Severity | Recommendation |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- | -------------- |
| —   | `link "BruteForceHR"` → `img "BruteForceHR"` in the accessibility tree; no duplicate `id`s (`gradientId` differs per instance: `bfhr-wordmark-header`, `bfhr-wordmark-footer`). | 4.1.1 / 4.1.2  | —        | Pass.          |

### Color Contrast Check

| Element                      | Foreground | Background            | Ratio       | Required    | Pass?          |
| ---------------------------- | ---------- | --------------------- | ----------- | ----------- | -------------- |
| Icon B (light), plate top    | `#FFFFFF`  | `#2B827B`             | 4.58:1      | 3:1         | ✅             |
| Icon B (light), plate bottom | `#FFFFFF`  | `#1B5954`             | 8.07:1      | 3:1         | ✅             |
| Icon B (dark appearance)     | `#43BEB4`  | `#1E2229` → `#0E1014` | 7.04–8.40:1 | 3:1         | ✅             |
| Wordmark "BruteForce", light | `#161A22`  | `#FFFFFF`             | 17.43:1     | 4.5:1       | ✅             |
| Wordmark "HR", light         | `#1F635D`  | `#FFFFFF`             | 7.00:1      | 4.5:1       | ✅             |
| Wordmark "BruteForce", dark  | `#ECEEF2`  | `#16191F`             | 15.15:1     | 4.5:1       | ✅             |
| Wordmark "HR", dark          | `#43BEB4`  | `#16191F`             | 7.76:1      | 4.5:1       | ✅             |
| Plate edge on dark header    | `#1B5954`  | `#16191F`             | 2.18:1      | 3:1 (guide) | ❌ logged (#1) |

### Keyboard Navigation

| Element            | Tab Order                | Enter/Space     | Escape | Arrow Keys |
| ------------------ | ------------------------ | --------------- | ------ | ---------- |
| Header lockup link | 2 (after skip link)      | Enter opens `/` | —      | —          |
| Footer lockup link | first link in the footer | Enter opens `/` | —      | —          |

### Screen Reader

| Element            | Announced As                                                      | Issue |
| ------------------ | ----------------------------------------------------------------- | ----- |
| Header lockup      | "BruteForceHR, link" (link name from the image's label)           | —     |
| Footer lockup      | "BruteForceHR, link"                                              | —     |
| Favicon / app icon | not announced; the app name is the Home Screen / Dock / tab label | —     |

### Priority Fixes

None required. Three Minors logged.
