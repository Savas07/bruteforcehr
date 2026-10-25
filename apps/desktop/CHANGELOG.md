# @bfhr/desktop

## 0.5.0

### Minor Changes

- e113637: More jobs in your feed. First-run setup now starts one saved search for each role you're looking for (up to five), not only the first, and each search runs as soon as it's saved instead of up to 30 minutes later. Every search also brings back more jobs per source: up to 100 instead of 40, with more pages from Himalayas and Bundesagentur für Arbeit. On Mac/PC and iPhone.

### Patch Changes

- @bfhr/api@0.5.0
  - @bfhr/core@0.5.0
  - @bfhr/cv-render@0.5.0
  - @bfhr/ui-tokens@0.5.0

## 0.4.0

### Minor Changes

- 1f1c8d2: Settings › Data & privacy: "Export everything" builds a ZIP of all your data (readable JSON per collection, your CV and attachment files, a README; never passwords or tokens), downloadable for 7 days. "Delete account" removes every document, file and the sign-in account, revoking mail access at Google first, after you confirm by typing a word and, if needed, signing in again with an email link. On the Mac/PC and iPhone.
- b341645: Mail and Settings on the desktop. Connect an email account: Gmail and Outlook sign in through the browser (until the sign-in is switched on, the app says so calmly and offers an app password for Gmail), iCloud Mail, Yahoo, Yandex, GMX, WEB.DE and any IMAP server connect with an app password, with each provider's steps and field-level errors, and the inbox scan shows its progress. Mail runs on your real job emails: Confirm, Change or Not job mail keep a 10-second Undo before they're saved, automatic changes can be undone, and interview invites suggest the interview to add. Today lists emails to review and the inbox scan; an application shows its emails. New Settings (⌘, / Ctrl+,): mail accounts (reconnect, check now, scan again, disconnect), notifications with quiet hours and notifications on this computer, job source health, companies you follow, AI, language, appearance and update channel.
- ae53754: First-run setup on the desktop. After you sign in for the first time, three short steps get you started: add your CV (import a file or start an empty one), tell us what you're looking for (roles, seniority, remote / hybrid / on-site, places with "I'd move here", a private salary floor with currency and per month or per year, whether you can work in each country without visa sponsorship, and your languages), then start your first saved search, which runs right away and lands you on Today. Every step can be skipped, and setup picks up where you left off if you close the app. The same preferences live in the new Settings › Job preferences, which saves as you go.
- 5630f73: Apply on the desktop, start to finish: "Tailor for this job" (from the Apply panel or CV Studio's Check tab) shows each suggested edit with the original, the suggestion, why and what in your CV it is based on, a live preview and Accept / Keep original per edit or all at once, and saves the result as a version for that application without changing your CV. Cover letters are drafted with AI in a formal, warm or concise tone and your language, or started from a starter or your own template, with fields such as the hiring manager filled before sending. After opening a company's site, the application kit has your CV as a file (open, show in Finder / Explorer, copy its path), your cover letter (copy, save as PDF) and your saved answers, each with Copy. Settings › Application answers manages those answers per language, country and currency, and emails can carry more files from your saved PDFs or your computer, within your account's size limit.
- 4f0d860: Jobs on your real data: a feed ranked by match with filters (work mode, location, seniority, salary, posted, match, visa, source), sort, keyboard triage (J/K, S save, D Not for me with optional reasons), live search of the job sites, saved searches with alerts, adding a job from a link, and applying — on the company site with "Did you apply?", or by email from the app (or your mail app until an account can send).
- 257f97a: Security fixes from the M6 review. Connecting Gmail or Outlook now finishes in the app that started it: the mailbox is saved only for your account, the app shows which address was connected, and Microsoft always asks for consent. New accounts are by invitation for now. Mail from Spam, or mail whose sender can't be verified, no longer changes your applications automatically; it waits in Review. Followed careers pages must use https. Daily limits protect PDF making, email connect attempts and AI help; the website sends stricter security headers.

### Patch Changes

- f7a0681: Changes from another device reach the Mac app at once again: Firestore uses long polling in WebKit webviews, where WebKit since Safari 26.4 held back a listener's last update until the server sent more (up to 30 s). CV Studio no longer shows "This CV changed on another device" right after saving: the session store mistook the editor from before its own write for a remote save.
- bcb03f2: Sending from a Microsoft account now asks Microsoft only for permission to send (`Mail.Send`), as the privacy policy says; it no longer asks to change your mailbox. Each email goes out in one request with one copy in Sent Items, and follow-ups still reply in the same conversation. Because of that, a Microsoft account can attach about 2.9 MB in total; BruteForceHR tells you before sending if the CV and cover letter are larger.
- Updated dependencies [1f1c8d2]
- Updated dependencies [bcb03f2]
- Updated dependencies [0905d17]
- Updated dependencies [01435f6]
- Updated dependencies [1b35770]
- Updated dependencies [fc77c88]
- Updated dependencies [257f97a]
  - @bfhr/core@0.4.0
  - @bfhr/api@0.4.0
  - @bfhr/cv-render@0.4.0
  - @bfhr/ui-tokens@0.4.0

## 0.3.0

### Minor Changes

- 1c3a3aa: Tracker on real data (M3, desktop): Firestore listeners and batched writes for applications, events, interviews and contacts (offline, waiting-to-sync state); board moves by drag, keyboard and Move to… through the core state machine with durable Undo; full-page application detail (timeline with automatic events and Undo, documents used, contacts, interview rounds with .ics export, notes, reminders); Log an application (⌘N); follow-up and no-response suggestions with Later / Not needed / Keep waiting persisted on the application (`visibleSuggestions`, ported to BFHRCore); opt-in interview prep notifications; Today on live data.
- ffcd3ed: Insights (M3): pure metrics in `@bfhr/core` (funnel by apply date, response rate by source / channel / CV / market, median time to first response, 12-week activity, Tracker drill-downs) with conformance vectors ported to BFHRCore; desktop Insights screen (sidebar ⌘6) and iOS Insights pushed from the Tracker, both on live data.

### Patch Changes

- fe0780e: Downloads, release notes and updates now come from the public `Savas07/bruteforcehr-releases` repository: the desktop app checks for updates there (stable and beta), the website's Download and Changelog pages list its releases, and "Release page on GitHub", Support and the privacy/terms contact links open it. Problems and questions go to its Issues, which are public, so please don't include personal details.
- Updated dependencies [1c3a3aa]
- Updated dependencies [ffcd3ed]
- Updated dependencies [fad8a90]
  - @bfhr/core@0.3.0
  - @bfhr/api@0.3.0
  - @bfhr/cv-render@0.3.0
  - @bfhr/ui-tokens@0.3.0

## 0.2.2

### Patch Changes

- d5b8fc0: Release fix: the ATS check test waits long enough for the real PDF read-back on loaded CI runners.
- @bfhr/api@0.2.2
  - @bfhr/core@0.2.2
  - @bfhr/cv-render@0.2.2
  - @bfhr/ui-tokens@0.2.2

## 0.2.1

### Patch Changes

- 4e69e6c: Release fixes: the CV renderer reads its version from package.json (version bumps no longer break the build), the iOS release job builds the renderer bundle before archiving, and the secret scan allowlists the public Firebase web key.
- Updated dependencies [4e69e6c]
  - @bfhr/cv-render@0.2.1
  - @bfhr/api@0.2.1
  - @bfhr/core@0.2.1
  - @bfhr/ui-tokens@0.2.1

## 0.2.0

### Minor Changes

- 981fa3a: CV Studio works on your real CVs: create one (empty or from your profile), import a PDF, Word file, JSON Resume or LinkedIn export and review what was read, edit with a live preview that is exactly the exported PDF, pick a template, accent and fonts, and export PDF (made on this computer), Word or JSON with a `First-Last-CV-Company.pdf` name. Each editing session saves one version; version history compares and restores, and edits made on another device at the same time ask which version to keep. The ATS check reads your exported PDF back and compares it with a pasted job description, and "Improve with AI" suggests rewrites you accept one by one (placeholders like [X%] must be filled first).
- d9dc095: Sign in with your email, no password: enter your address, then open the link we email you on this computer. It takes you back to the app and signs you in. If you asked for the link on another device, the app asks for your address once. Expired, used or broken links get a clear message and a way to send a new one. Gmail, Outlook and other webmail addresses get an "Open …" button. "Sign Out" is in the app menu (macOS) or File (Windows) and in the command palette.

### Patch Changes

- Updated dependencies [f679cc3]
- Updated dependencies [6eb122d]
- Updated dependencies [54a2f4b]
  - @bfhr/core@0.2.0
  - @bfhr/api@0.2.0
  - @bfhr/cv-render@0.2.0
  - @bfhr/ui-tokens@0.2.0

## 0.1.1

### Patch Changes

- 59856f2: Jobs list: a salary like "€65,000–€78,000 a year · employer" now fits on one line in a 1280-pixel-wide window. The posting date and the saved mark sit beside the title only, so the salary line uses the row's full width.
- @bfhr/api@0.1.1
  - @bfhr/core@0.1.1
  - @bfhr/ui-tokens@0.1.1

## 0.1.0

### Minor Changes

- a952e6e: First release of BruteForceHR: the desktop app for macOS and Windows, with automatic updates signed by the BruteForceHR release key.

### Patch Changes

- @bfhr/api@0.1.0
  - @bfhr/core@0.1.0
  - @bfhr/ui-tokens@0.1.0
