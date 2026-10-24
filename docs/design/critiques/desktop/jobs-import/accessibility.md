# Import a job from a link (desktop) — accessibility review

Method: `pnpm --filter @bfhr/desktop capture:design jobs-import --states populated,empty,loading,error,offline --themes light,dark --sizes 1280x800,1920x1080 --axe` (axe-core WCAG 2.1 A/AA, WebKit ≈ WKWebView and Chromium ≈ WebView2; reports in `artifacts/a11y/desktop/jobs-import-*.json`), plus axe on every later step (reading, review, error, manual, manual with errors, offline) × light/dark × both sizes × both engines through ad-hoc Playwright on the design dev server (48 runs). Keyboard behaviour is exercised by `ImportJobDialog.test.tsx` (focus on open, Enter reads, Ctrl+Enter saves, Esc asks before discarding, focus moves to the first invalid field). Contrast comes from the token pairings tested in `@bfhr/ui-tokens`.

## Accessibility Audit: Jobs — import a job from a link
**Standard:** WCAG 2.1 AA | **Date:** 2026-10-24

### Summary
**Issues found:** 4 | **Critical:** 0 | **Major:** 0 | **Minor:** 4 (3 fixed, 1 logged)

axe after the fixes: 0 critical · 0 serious · 0 moderate · 0 minor in all 68 runs. Harness "needs review" items are Radix focus guards (`aria-hidden-focus` on `data-radix-focus-guard`) and colour contrast of the page dimmed behind the scrim, not the dialog.

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | "Check this" could read as colour-only (amber dot). | 1.4.1 Use of Color | — | Pass: dot + the words "Check this", plus a screen-reader sentence "We weren't sure about this one." linked to the field with `aria-describedby`. |
| 2 | Self-review before the first capture: the salary flag sat outside the group's name, so a screen reader entering "From" wouldn't hear it. | 1.3.1 Info and Relationships | 🟢 Minor | **Fixed**: the flag is inside the fieldset's `<legend>` ("Salary, Check this"). |
| 3 | Provenance icons (globe / sparkle). | 1.1.1 Non-text Content | — | Pass: icons are `aria-hidden`; the text says "Read from the page's job data" or "Read by AI · can be wrong". |

#### Operable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 4 | Focus after a failed read. | 2.4.3 Focus Order | — | Pass (built in, covered by the r1 error capture): focus returns to the link field with the text selected, so it can be replaced or the alert's action reached with Tab. |
| 5 | Focus when the review replaces step 1. | 2.4.3 Focus Order | — | Pass (built in, asserted in `ImportJobDialog.test.tsx` for manual entry): focus moves to the first flagged identity field (else Role); in manual entry to Role. |
| 6 | r1: Back silently discarded edits while Esc asked first. | 3.3.4 Error Prevention | 🟢 Minor | **Fixed** (r1): Back asks the same "Discard this job?". |

#### Understandable
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 7 | Errors identify the field and say how to fix it ("Enter the full address, starting with https://"); with 2+ problems a summary (`role="alert"`) links to each field. | 3.3.1 / 3.3.3 | — | Pass. |
| 8 | "Read posting" is disabled offline. | 3.3.2 Labels or Instructions | — | Pass: inline "Reading a link needs a connection." with "Enter it yourself"; the button keeps the reason as its accessible description. |

#### Robust
| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 9 | The wait announced its label twice (status line + button loading label). | 4.1.3 Status Messages | 🟢 Minor | **Fixed** (r1): status line "Reading the posting…" (`role="status"`), button "Reading…". |
| 10 | Reflow at 200 % zoom was not measured in this round. | 1.4.10 Reflow | 🟢 Minor | **Logged**: [INFERENCE] the body scrolls with the footer pinned (`max-h: 100vh − 48px`), but the 4-column salary row will be tight in narrow windows; check at 640 × 400 with the Jobs screen's next zoom pass. |

### Keyboard Navigation
| Element | Tab Order | Enter/Space | Escape | Arrow Keys |
|---------|-----------|-------------|--------|------------|
| Link field | 1 (focused on open) | Enter reads | Closes (asks if edited) | — |
| Alert action ("Enter it yourself" / "Try again") | after the field | Runs it | Closes | — |
| Review fields | DOM order, top-left to bottom-right | Enter in an input saves (form submit) | Asks "Discard this job?" when edited | Selects: native |
| Footer: Back · Cancel · Save job | last | Activates | — | — |
| Ctrl/⌘ + Enter | anywhere in the review | Saves | — | — |

### Screen Reader
[INFERENCE] Expected from the markup (labels, `aria-describedby`, `role="status"`); not yet checked with VoiceOver/NVDA.

| Element | Announced As | Issue |
|---------|-------------|-------|
| Dialog | "Add a job from a link, dialog" + step description | — |
| Flagged field | "Role, edit text, We weren't sure about this one." | — |
| Wait | "Reading the posting…" (polite) | — |
| Read error | warning alert title, e.g. "This site doesn't let us read its pages. You can enter the details yourself." (polite) | — |

### Priority Fixes
No Critical or Major issues. Remaining: measure 200 % zoom reflow (#10) and a VoiceOver pass in the app build.
