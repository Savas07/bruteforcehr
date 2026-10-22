# Design status

Tracks the design protocol (BRIEF §5.5) per screen and platform. A row may be set to `approved` only when the latest critique round has zero Critical and zero unresolved Moderate findings and the accessibility review passes. No UI change merges unless its row is approved (BRIEF §5.6).

- **References:** research doc for the area (`docs/design/research/<area>.md`).
- **Critique rounds:** number of saved rounds in `docs/design/critiques/<platform>/<screen>/r<N>.md`.
- **A11y:** `—` not run · `pass` · `fail`.
- **Status:** `not started` · `researching` (research doc complete; design not started) · `exploration` · `refinement` · `final` · `approved`.

Synthesis (M0): [IA](design/IA.md) · [flows](design/flows.md) · [decisions](design/decisions.md) · [components](design/components.md) · [design system](design/system.md) · tokens in `packages/ui-tokens`.

## iOS

| Screen                                 | Platform | References                                                | Critique rounds | A11y | Status                                                                                              |
| -------------------------------------- | -------- | --------------------------------------------------------- | --------------- | ---- | --------------------------------------------------------------------------------------------------- |
| Onboarding (flow)                      | iOS      | [onboarding-signin](design/research/onboarding-signin.md) | 0               | —    | researching                                                                                         |
| Sign in — email code (flow)            | iOS      | [onboarding-signin](design/research/onboarding-signin.md) | 0               | —    | researching                                                                                         |
| Connect email account (flow)           | iOS      | [connect-email](design/research/connect-email.md)         | 0               | —    | researching                                                                                         |
| Permission request                     | iOS      | [connect-email](design/research/connect-email.md)         | 0               | —    | researching                                                                                         |
| Today / home                           | iOS      | [today-home](design/research/today-home.md)               | 4               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| Job feed                               | iOS      | [job-feed-search](design/research/job-feed-search.md)     | 0               | —    | researching                                                                                         |
| Job search & filters                   | iOS      | [job-feed-search](design/research/job-feed-search.md)     | 0               | —    | researching                                                                                         |
| Saved searches                         | iOS      | [job-feed-search](design/research/job-feed-search.md)     | 0               | —    | researching                                                                                         |
| Job detail + match explanation         | iOS      | [job-detail](design/research/job-detail.md)               | 3               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| Apply (flow)                           | iOS      | [apply](design/research/apply.md)                         | 0               | —    | researching                                                                                         |
| Email compose                          | iOS      | [apply](design/research/apply.md)                         | 0               | —    | researching                                                                                         |
| Attachment picker                      | iOS      | [apply](design/research/apply.md)                         | 0               | —    | researching                                                                                         |
| CV editor                              | iOS      | [cv-editor](design/research/cv-editor.md)                 | 3               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| CV preview                             | iOS      | [cv-editor](design/research/cv-editor.md)                 | 0               | —    | researching                                                                                         |
| CV template picker                     | iOS      | [cv-editor](design/research/cv-editor.md)                 | 0               | —    | researching                                                                                         |
| Tracker board                          | iOS      | [tracker](design/research/tracker.md)                     | 4               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| Tracker table                          | iOS      | [tracker](design/research/tracker.md)                     | 0               | —    | researching                                                                                         |
| Tracker calendar                       | iOS      | [tracker](design/research/tracker.md)                     | 0               | —    | researching                                                                                         |
| Application detail + activity timeline | iOS      | [tracker](design/research/tracker.md)                     | 0               | —    | researching                                                                                         |
| Mail review queue                      | iOS      | [mail-review](design/research/mail-review.md)             | 3               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| Insights                               | iOS      | [insights](design/research/insights.md)                   | 0               | —    | researching                                                                                         |
| Settings                               | iOS      | [settings-account](design/research/settings-account.md)   | 0               | —    | researching                                                                                         |
| Export data                            | iOS      | [settings-account](design/research/settings-account.md)   | 0               | —    | researching                                                                                         |
| Delete account (flow)                  | iOS      | [settings-account](design/research/settings-account.md)   | 0               | —    | researching                                                                                         |
| Empty states (core screens)            | iOS      | [states](design/research/states.md)                       | 0               | —    | researching                                                                                         |
| Loading states (core screens)          | iOS      | [states](design/research/states.md)                       | 0               | —    | researching                                                                                         |
| Error states (core screens)            | iOS      | [states](design/research/states.md)                       | 0               | —    | researching                                                                                         |
| Offline states (core screens)          | iOS      | [states](design/research/states.md)                       | 0               | —    | researching                                                                                         |
| Notification center                    | iOS      | [mail-review](design/research/mail-review.md)             | 0               | —    | researching                                                                                         |

## macOS

| Screen                                 | Platform | References                                                | Critique rounds | A11y | Status                                                                                              |
| -------------------------------------- | -------- | --------------------------------------------------------- | --------------- | ---- | --------------------------------------------------------------------------------------------------- |
| Onboarding (flow)                      | macOS    | [onboarding-signin](design/research/onboarding-signin.md) | 0               | —    | researching                                                                                         |
| Sign in — email code (flow)            | macOS    | [onboarding-signin](design/research/onboarding-signin.md) | 0               | —    | researching                                                                                         |
| Connect email account (flow)           | macOS    | [connect-email](design/research/connect-email.md)         | 0               | —    | researching                                                                                         |
| Permission request                     | macOS    | [connect-email](design/research/connect-email.md)         | 0               | —    | researching                                                                                         |
| Today / home                           | macOS    | [today-home](design/research/today-home.md)               | 4               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| Job feed                               | macOS    | [job-feed-search](design/research/job-feed-search.md)     | 0               | —    | researching                                                                                         |
| Job search & filters                   | macOS    | [job-feed-search](design/research/job-feed-search.md)     | 0               | —    | researching                                                                                         |
| Saved searches                         | macOS    | [job-feed-search](design/research/job-feed-search.md)     | 0               | —    | researching                                                                                         |
| Job detail + match explanation         | macOS    | [job-detail](design/research/job-detail.md)               | 3               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| Apply (flow)                           | macOS    | [apply](design/research/apply.md)                         | 0               | —    | researching                                                                                         |
| Email compose                          | macOS    | [apply](design/research/apply.md)                         | 0               | —    | researching                                                                                         |
| Attachment picker                      | macOS    | [apply](design/research/apply.md)                         | 0               | —    | researching                                                                                         |
| CV editor                              | macOS    | [cv-editor](design/research/cv-editor.md)                 | 3               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| CV preview                             | macOS    | [cv-editor](design/research/cv-editor.md)                 | 0               | —    | researching                                                                                         |
| CV template picker                     | macOS    | [cv-editor](design/research/cv-editor.md)                 | 0               | —    | researching                                                                                         |
| Tracker board                          | macOS    | [tracker](design/research/tracker.md)                     | 5               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| Tracker table                          | macOS    | [tracker](design/research/tracker.md)                     | 0               | —    | researching                                                                                         |
| Tracker calendar                       | macOS    | [tracker](design/research/tracker.md)                     | 0               | —    | researching                                                                                         |
| Application detail + activity timeline | macOS    | [tracker](design/research/tracker.md)                     | 0               | —    | researching                                                                                         |
| Mail review queue                      | macOS    | [mail-review](design/research/mail-review.md)             | 2               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| Insights                               | macOS    | [insights](design/research/insights.md)                   | 0               | —    | researching                                                                                         |
| Settings                               | macOS    | [settings-account](design/research/settings-account.md)   | 0               | —    | researching                                                                                         |
| Export data                            | macOS    | [settings-account](design/research/settings-account.md)   | 0               | —    | researching                                                                                         |
| Delete account (flow)                  | macOS    | [settings-account](design/research/settings-account.md)   | 0               | —    | researching                                                                                         |
| Empty states (core screens)            | macOS    | [states](design/research/states.md)                       | 0               | —    | researching                                                                                         |
| Loading states (core screens)          | macOS    | [states](design/research/states.md)                       | 0               | —    | researching                                                                                         |
| Error states (core screens)            | macOS    | [states](design/research/states.md)                       | 0               | —    | researching                                                                                         |
| Offline states (core screens)          | macOS    | [states](design/research/states.md)                       | 0               | —    | researching                                                                                         |
| Command palette                        | macOS    | [desktop-chrome](design/research/desktop-chrome.md)       | 0               | —    | researching                                                                                         |
| Sidebar navigation                     | macOS    | [desktop-chrome](design/research/desktop-chrome.md)       | 0               | —    | researching                                                                                         |
| Keyboard shortcuts sheet               | macOS    | [desktop-chrome](design/research/desktop-chrome.md)       | 0               | —    | researching                                                                                         |
| Update-available banner                | macOS    | [desktop-chrome](design/research/desktop-chrome.md)       | 0               | —    | researching                                                                                         |

## Windows

| Screen                                 | Platform | References                                                | Critique rounds | A11y | Status                                                                                              |
| -------------------------------------- | -------- | --------------------------------------------------------- | --------------- | ---- | --------------------------------------------------------------------------------------------------- |
| Onboarding (flow)                      | Windows  | [onboarding-signin](design/research/onboarding-signin.md) | 0               | —    | researching                                                                                         |
| Sign in — email code (flow)            | Windows  | [onboarding-signin](design/research/onboarding-signin.md) | 0               | —    | researching                                                                                         |
| Connect email account (flow)           | Windows  | [connect-email](design/research/connect-email.md)         | 0               | —    | researching                                                                                         |
| Permission request                     | Windows  | [connect-email](design/research/connect-email.md)         | 0               | —    | researching                                                                                         |
| Today / home                           | Windows  | [today-home](design/research/today-home.md)               | 4               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| Job feed                               | Windows  | [job-feed-search](design/research/job-feed-search.md)     | 0               | —    | researching                                                                                         |
| Job search & filters                   | Windows  | [job-feed-search](design/research/job-feed-search.md)     | 0               | —    | researching                                                                                         |
| Saved searches                         | Windows  | [job-feed-search](design/research/job-feed-search.md)     | 0               | —    | researching                                                                                         |
| Job detail + match explanation         | Windows  | [job-detail](design/research/job-detail.md)               | 3               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| Apply (flow)                           | Windows  | [apply](design/research/apply.md)                         | 0               | —    | researching                                                                                         |
| Email compose                          | Windows  | [apply](design/research/apply.md)                         | 0               | —    | researching                                                                                         |
| Attachment picker                      | Windows  | [apply](design/research/apply.md)                         | 0               | —    | researching                                                                                         |
| CV editor                              | Windows  | [cv-editor](design/research/cv-editor.md)                 | 3               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| CV preview                             | Windows  | [cv-editor](design/research/cv-editor.md)                 | 0               | —    | researching                                                                                         |
| CV template picker                     | Windows  | [cv-editor](design/research/cv-editor.md)                 | 0               | —    | researching                                                                                         |
| Tracker board                          | Windows  | [tracker](design/research/tracker.md)                     | 5               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| Tracker table                          | Windows  | [tracker](design/research/tracker.md)                     | 0               | —    | researching                                                                                         |
| Tracker calendar                       | Windows  | [tracker](design/research/tracker.md)                     | 0               | —    | researching                                                                                         |
| Application detail + activity timeline | Windows  | [tracker](design/research/tracker.md)                     | 0               | —    | researching                                                                                         |
| Mail review queue                      | Windows  | [mail-review](design/research/mail-review.md)             | 2               | pass | refinement — critique exit criteria met; awaiting [M0 checkpoint](design/checkpoint-m0.md) approval |
| Insights                               | Windows  | [insights](design/research/insights.md)                   | 0               | —    | researching                                                                                         |
| Settings                               | Windows  | [settings-account](design/research/settings-account.md)   | 0               | —    | researching                                                                                         |
| Export data                            | Windows  | [settings-account](design/research/settings-account.md)   | 0               | —    | researching                                                                                         |
| Delete account (flow)                  | Windows  | [settings-account](design/research/settings-account.md)   | 0               | —    | researching                                                                                         |
| Empty states (core screens)            | Windows  | [states](design/research/states.md)                       | 0               | —    | researching                                                                                         |
| Loading states (core screens)          | Windows  | [states](design/research/states.md)                       | 0               | —    | researching                                                                                         |
| Error states (core screens)            | Windows  | [states](design/research/states.md)                       | 0               | —    | researching                                                                                         |
| Offline states (core screens)          | Windows  | [states](design/research/states.md)                       | 0               | —    | researching                                                                                         |
| Command palette                        | Windows  | [desktop-chrome](design/research/desktop-chrome.md)       | 0               | —    | researching                                                                                         |
| Sidebar navigation                     | Windows  | [desktop-chrome](design/research/desktop-chrome.md)       | 0               | —    | researching                                                                                         |
| Keyboard shortcuts sheet               | Windows  | [desktop-chrome](design/research/desktop-chrome.md)       | 0               | —    | researching                                                                                         |
| Update-available banner                | Windows  | [desktop-chrome](design/research/desktop-chrome.md)       | 0               | —    | researching                                                                                         |

## Web (website pages)

Sections (hero, features, how it works, download CTA, FAQ, changelog, footer, legal page) are critiqued as part of the page that contains them.

| Screen         | Platform | References                            | Critique rounds | A11y | Status      |
| -------------- | -------- | ------------------------------------- | --------------- | ---- | ----------- |
| Home           | Web      | [website](design/research/website.md) | 0               | —    | researching |
| Features       | Web      | [website](design/research/website.md) | 0               | —    | researching |
| Download       | Web      | [website](design/research/website.md) | 0               | —    | researching |
| Changelog      | Web      | [website](design/research/website.md) | 0               | —    | researching |
| Privacy Policy | Web      | [website](design/research/website.md) | 3               | pass | approved    |
| Terms          | Web      | [website](design/research/website.md) | 3               | pass | approved    |
| Support        | Web      | [website](design/research/website.md) | 2               | pass | approved    |

## App icon and wordmark

| Screen               | Platform | References | Critique rounds | A11y | Status      |
| -------------------- | -------- | ---------- | --------------- | ---- | ----------- |
| App icon (all sizes) | iOS      | —          | 0               | —    | not started |
| App icon (all sizes) | macOS    | —          | 0               | —    | not started |
| App icon (all sizes) | Windows  | —          | 0               | —    | not started |
| Wordmark             | Web      | —          | 0               | —    | not started |
