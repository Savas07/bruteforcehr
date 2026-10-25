# BruteForceHR

A job-search app for Mac, Windows and iPhone: find jobs, write and tailor your CV, apply, and track every application. It can also follow up through your email.

**Website:** https://bruteforcehr.web.app · [Features](https://bruteforcehr.web.app/features/) · [User guide](https://bruteforcehr.web.app/guide/) · [Download](https://bruteforcehr.web.app/download/)

> **View only.** This repository is public so the code can be read. It is **not** open source. You may not copy, build, run, modify or redistribute it, or use it to access BruteForceHR's servers. See [LICENSE](LICENSE). New accounts are by invitation.

## What it does

- **Jobs:** a feed from job boards and company career pages, ranked by how well each job matches your profile, with the reasons and gaps for each match. Saved searches with alerts. Add a job from any link or from the iPhone share sheet.
- **CV Studio:** CVs with versions and variants, three ATS-friendly templates, and PDF, Word and JSON export. You can import from PDF, Word or LinkedIn, and AI can reword, shorten or translate your text.
- **Apply:** tailor your CV for a job (you accept or reject each change), draft a cover letter, keep an answers library for application forms, and apply on the company site or by email.
- **Tracker:** a board, table and calendar of your applications, with reminders, interviews, Insights and CSV import and export.
- **Mail:** connect Gmail, Outlook or any IMAP account. Job-related emails update your applications automatically, and each change can be undone.
- **Privacy:** data is stored in the EU (Belgium). There's no analytics and no ads, you can export everything, and you can delete your account. See the [Privacy Policy](https://bruteforcehr.web.app/privacy/) and [Terms](https://bruteforcehr.web.app/terms/).

The AI works only with what your CV already says. A suggestion that would add an employer, date, number or skill you don't have is removed before you see it.

## Download

| Platform                        | Get it                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| macOS (Apple silicon and Intel) | [Download page](https://bruteforcehr.web.app/download/) or [Releases](https://github.com/Savas07/bruteforcehr-releases/releases/latest) |
| Windows 10/11 (x64)             | Same as macOS                                                                                                                           |
| iPhone                          | TestFlight, by invitation                                                                                                               |

The desktop apps update themselves. Release notes are on the [changelog](https://bruteforcehr.web.app/changelog/).

## Support

Open an issue at [bruteforcehr-releases](https://github.com/Savas07/bruteforcehr-releases/issues). Issues are public, so don't include personal details.

## Repository

| Path             | What                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `apps/desktop`   | Mac and Windows app (Tauri 2, React)                                                         |
| `apps/ios`       | iPhone app (SwiftUI) and Share Extension                                                     |
| `apps/functions` | Backend (Firebase Cloud Functions, europe-west1)                                             |
| `apps/web`       | Website (Astro, Firebase Hosting)                                                            |
| `packages/*`     | Shared code: data model, API, AI, CV renderer, job connectors, design tokens, Swift packages |
| `firebase/`      | Firestore and Storage rules and their tests                                                  |
| `docs/`          | Product brief, architecture decisions (`adr/`), design, runbooks, `STATUS.md`                |

Maintainers: start with [AGENTS.md](AGENTS.md) and [docs/runbooks](docs/runbooks).

## License

Copyright © 2026 Savaş Altıntaş. All rights reserved. See [LICENSE](LICENSE).
