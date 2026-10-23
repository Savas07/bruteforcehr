# Download · Web · accessibility review

- **Skill:** `accessibility-review` (WCAG 2.1 AA), run after critique [r2](r2.md).
- **Build:** branch `m1/web-release` (r2 build), route `/download/`, both release states.
- **Methods:** as for [Home](../home/accessibility.md): Lighthouse 13.5.0 mobile + desktop, Playwright keyboard walk, Copy button with clipboard permissions (value read back from the clipboard), iPhone user agent at 375 for the card order, reflow at 320 / 640 px, touch-target scan at 375, token contrast. Not run: a real screen reader session.

## Accessibility Audit: Download

**Standard:** WCAG 2.1 AA | **Date:** 2026-10-23

### Summary

**Issues found:** 2 | **Critical:** 0 | **Major:** 0 | **Minor:** 2 (1 fixed)

### Findings

#### Perceivable

| #   | Issue                                                                                             | WCAG Criterion | Severity | Recommendation |
| --- | ------------------------------------------------------------------------------------------------- | -------------- | -------- | -------------- |
| 1   | Platform icons are decorative (`aria-hidden`); the row heading names the platform.                | 1.1.1          | —        | —              |
| 2   | SHA-256 values are real text in mono, wrap anywhere, and can be selected without the Copy button. | 1.4.10         | —        | —              |

#### Operable

| #   | Issue                                                                                                                                               | WCAG Criterion       | Severity | Recommendation                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------- | ----------------------------------- |
| 1   | All buttons and standalone links ≥ 44 px; the TestFlight link sits inside a sentence.                                                               | 2.5.5                | —        | —                                   |
| 2   | "Read this before you open it" jumps to `#mac-first-open` / `#windows-first-open`; `scroll-margin-top` keeps the target clear of the sticky header. | 2.4.3                | —        | —                                   |
| 3   | Commands wrapped at the hyphen of `x64-setup.exe` at 375.                                                                                           | 1.4.10 (informative) | 🟢 Minor | **Fixed** (`3601acc`): `break-all`. |

#### Understandable

| #   | Issue                                                                                         | WCAG Criterion           | Severity | Recommendation                                                        |
| --- | --------------------------------------------------------------------------------------------- | ------------------------ | -------- | --------------------------------------------------------------------- |
| 1   | First-launch steps name the exact macOS / Windows buttons in bold and link Apple's own guide. | 3.3.2                    | —        | —                                                                     |
| 2   | The header Download pill has no visual current-page state on this page.                       | 2.4.8 (AAA, informative) | 🟢 Minor | Logged: `aria-current="page"` is set; title and h1 identify the page. |

#### Robust

| #   | Issue                                                                                                                                                                                                                                                              | WCAG Criterion | Severity | Recommendation                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | -------- | ------------------------------------------------------ |
| 1   | Copy buttons: name "Copy SHA-256 of <file>" (contains the visible "Copy", 2.5.3); after a click the label reads "Copied" and a polite live region says "Checksum copied"; on failure it says to select and copy instead. Hidden when the Clipboard API is missing. | 4.1.2 / 4.1.3  | —        | Verified: clipboard held the exact 64-character value. |
| 2   | Row buttons: "Download for macOS" / "Download for Windows" (visible "Download" + hidden suffix).                                                                                                                                                                   | 2.5.3 / 4.1.2  | —        | —                                                      |

### Color Contrast Check

| Element                                  | Foreground     | Background       | Ratio             | Required | Pass? |
| ---------------------------------------- | -------------- | ---------------- | ----------------- | -------- | ----- |
| First-launch text (light / dark)         | `fg.secondary` | `info.subtle`    | 6.85:1 / 6.83:1   | 4.5:1    | ✅    |
| Link in first-launch note (light / dark) | `fg.link`      | `info.subtle`    | 6.11:1 / 6.65:1   | 4.5:1    | ✅    |
| Row meta (light / dark)                  | `fg.secondary` | `surface.base`   | 7.84:1 / 7.98:1   | 4.5:1    | ✅    |
| Command text (light / dark)              | `fg.primary`   | `surface.sunken` | 15.40:1 / 16.86:1 | 4.5:1    | ✅    |
| "Invite only" badge (light / dark)       | `fg.secondary` | `surface.sunken` | 6.93:1 / 8.87:1   | 4.5:1    | ✅    |

### Keyboard Navigation

| Element                                         | Tab Order | Enter/Space     | Escape      | Arrow Keys |
| ----------------------------------------------- | --------- | --------------- | ----------- | ---------- |
| Skip link, header                               | 1–5       | follow          | Menu: close | —          |
| What's new, detected primary, first-launch link | 6–8       | follow          | —           | —          |
| Per row: Download, Copy, Apple's guide (macOS)  | next      | download / copy | —           | —          |
| TestFlight, all checksums, older versions       | next      | follow          | —           | —          |

### Screen Reader

| Element      | Announced As                                                    | Issue |
| ------------ | --------------------------------------------------------------- | ----- |
| Desktop card | region "Mac and Windows", list of installers, each with heading | —     |
| iPhone card  | region "iPhone", "Invite only", ordered steps                   | —     |
| Verify       | region "Check your download", description list per OS           | —     |

### Lighthouse (13.5.0)

| Run     | Performance | Accessibility | Best Practices | SEO |
| ------- | ----------- | ------------- | -------------- | --- |
| Mobile  | 100         | 100           | 100            | 100 |
| Desktop | 100         | 100           | 100            | 100 |

LCP 0.92 s mobile / 0.24 s desktop, CLS 0.

### Related change

Support's Installing FAQ gained "macOS says it can't check BruteForceHR for malware" (shown while `MAC_BUILD_NOTARIZED` is false) and links to this page; both unsigned-build FAQ items disappear with the flags. Re-scanned for glued words in the built HTML (the r1 Support defect class): none.

### Priority Fixes

1. None open.
