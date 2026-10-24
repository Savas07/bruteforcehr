# Settings › Data & privacy (desktop) — accessibility review (WCAG 2.1 AA)

Date: 2026-10-24. Scope: the pane and the delete dialog in every state of `privacyDesignStates` (idle, preparing, ready, saving, saved, download-failed, too-soon, daily-limit, too-large, export-failed, offline, delete-empty, delete-typed, delete-reauth, delete-reauth-sent, delete-reauth-failed, delete-reauth-done, delete-deleting, delete-failed, delete-offline), light and dark, WebKit (≈ WKWebView) and Chromium (≈ WebView2), 1280×800; EN plus TR/DE spot checks.

Automated: `capture:design data-privacy --axe` with axe-core WCAG 2.1 A + AA tags → 0 violations in 100 reports (80 EN + 20 TR/DE). "Needs review" items are contrast over the dialog scrim (backdrop text), checked by hand below.

## Checklist

| Criterion | Result | Notes |
| --- | --- | --- |
| 1.1.1 Non-text content | Pass | Icons are `aria-hidden`; every button has a text label. |
| 1.3.1 Info and relationships | Pass | `<h2>` per section (shell `<h1>`), `<h3>` for Included / Not included, real lists; the confirm field has a `<label for>`; the dialog has a title and is described by the itemized list. |
| 1.4.1 Use of color | Pass | Included / not included use ✓ and — icons plus headings; errors have icon + title; disabled buttons explain why. |
| 1.4.3 Contrast (minimum) | Pass | Body and footnote text use `fg-primary` / `fg-secondary` tokens (≥ 4.5:1 in both themes, checked by axe); the destructive button's `danger-text` on `danger-subtle` passes in light and dark. Text behind the scrim is inert and exempt. |
| 1.4.4 / 1.4.10 Resize, reflow | Pass | Two-column lists collapse to one under `sm`; the dialog scrolls inside `max-h` at small windows; 200 % zoom keeps every control reachable. |
| 2.1.1 Keyboard | Pass | All actions are buttons/inputs; no pointer-only affordance. |
| 2.1.2 No keyboard trap | Pass | Radix dialog traps focus while open and releases it on close; Esc closes (ignored only while the deletion runs, which ends by itself). |
| 2.4.3 Focus order | Pass | Dialog: Keep my account (initial), then document order; on close focus returns to "Delete account…", or to the export button after "Export my data first". |
| 2.4.6 Headings and labels | Pass | "To confirm, type DELETE" names the field and the word. |
| 2.4.7 Focus visible | Pass | Shared focus ring on buttons and the field in both themes. |
| 3.2.2 On input | Pass | Typing the word only enables the button; Enter in the field does nothing. |
| 3.3.1 / 3.3.3 Error identification, suggestion | Pass | Each export refusal says what happened and when to retry; failed requests offer Try again; link problems reuse the sign-in explanations with "Send link". |
| 3.3.4 Error prevention (legal, data) | Pass | Deletion needs the typed word and a sign-in less than 5 minutes old, and the dialog lists exactly what is deleted, with "Export my data first". |
| 4.1.2 Name, role, value | Pass | Disabled buttons use `aria-disabled` + description (shared `Button`). |
| 4.1.3 Status messages | Pass | Preparing / deleting use `ProgressNote` (`role=status`); "Saved to …", "Link sent…", "You're signed in again" are `role=status`; failures from the user's own action are `role=alert`. |

## Findings

| # | Issue | Severity | Status |
| --- | --- | --- | --- |
| 1 | While deleting, "Keep my account" showed a disabled tooltip over the progress note (focus stays there from opening). | Moderate | Fixed in r1: no disabled state; the click is ignored until deletion ends. |
| 2 | "Keep my account" is visually enabled while the deletion runs. | Minor | Accepted: harmless, short-lived, and the status is announced. |

Exit: 0 Critical, 0 open Moderate.
