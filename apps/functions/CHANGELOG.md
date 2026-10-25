# @bfhr/functions

## 0.5.0

### Patch Changes

- @bfhr/ai@0.5.0
  - @bfhr/api@0.5.0
  - @bfhr/core@0.5.0
  - @bfhr/cv-render@0.5.0
  - @bfhr/jobs-connectors@0.5.0

## 0.4.0

### Minor Changes

- 1f1c8d2: Settings › Data & privacy: "Export everything" builds a ZIP of all your data (readable JSON per collection, your CV and attachment files, a README; never passwords or tokens), downloadable for 7 days. "Delete account" removes every document, file and the sign-in account, revoking mail access at Google first, after you confirm by typing a word and, if needed, signing in again with an email link. On the Mac/PC and iPhone.
- 0905d17: Apply with AI help: "Tailor for this job" proposes edits to your CV that you accept or keep one by one, saved as a new version; a cover letter draft from your CV and the job in a formal, warm or concise tone, with your own reusable templates; and an answers library (work authorization, notice period, salary expectation, links, common questions) ready to copy into company application forms. The AI only rewords, reorders and emphasises what your CV already says: an edit or sentence that would add an employer, number, date or skill you don't have is removed.
- 6b7ba1a: Job search backend: 19 job sources (ATS boards of followed companies, Arbeitnow, Remotive, Remote OK, Himalayas, The Muse, Bundesagentur für Arbeit, Kariyer.net; Adzuna, Jooble, USAJOBS and Reed once their keys are set), deduplicated jobs with every source kept, match scores with reasons, gaps and AI explanations for the best matches, and saved searches that run on a schedule.
- 1b35770: Mail: connect IMAP accounts with an app password (Gmail and Outlook through OAuth once their clients are registered), scan the last 30–180 days, sort job mail with rules or Claude (EN/TR/DE) into automatic tracker updates with Undo or the review queue, and send email applications with a 10-second undo window.
- fc77c88: Push notifications: interview invites, offers, assessments, decisions and automatic status changes from email, plus one digest for new saved-search matches, in your app language. They wait for the end of your quiet hours and each kind can be turned off in Settings › Notifications.
- 257f97a: Security fixes from the M6 review. Connecting Gmail or Outlook now finishes in the app that started it: the mailbox is saved only for your account, the app shows which address was connected, and Microsoft always asks for consent. New accounts are by invitation for now. Mail from Spam, or mail whose sender can't be verified, no longer changes your applications automatically; it waits in Review. Followed careers pages must use https. Daily limits protect PDF making, email connect attempts and AI help; the website sends stricter security headers.

### Patch Changes

- bcb03f2: Sending from a Microsoft account now asks Microsoft only for permission to send (`Mail.Send`), as the privacy policy says; it no longer asks to change your mailbox. Each email goes out in one request with one copy in Sent Items, and follow-ups still reply in the same conversation. Because of that, a Microsoft account can attach about 2.9 MB in total; BruteForceHR tells you before sending if the CV and cover letter are larger.
- 030a488: Links you save from the share sheet or by pasting now show up under Saved for new users who haven't set up a profile or CV yet.
- Updated dependencies [1f1c8d2]
- Updated dependencies [bcb03f2]
- Updated dependencies [0905d17]
- Updated dependencies [01435f6]
- Updated dependencies [1b35770]
- Updated dependencies [fc77c88]
- Updated dependencies [257f97a]
  - @bfhr/core@0.4.0
  - @bfhr/api@0.4.0
  - @bfhr/ai@0.4.0
  - @bfhr/cv-render@0.4.0
  - @bfhr/jobs-connectors@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [1c3a3aa]
- Updated dependencies [ffcd3ed]
- Updated dependencies [fad8a90]
  - @bfhr/core@0.3.0
  - @bfhr/api@0.3.0
  - @bfhr/ai@0.3.0
  - @bfhr/cv-render@0.3.0

## 0.2.2

### Patch Changes

- @bfhr/ai@0.2.2
  - @bfhr/api@0.2.2
  - @bfhr/core@0.2.2
  - @bfhr/cv-render@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [4e69e6c]
  - @bfhr/cv-render@0.2.1
  - @bfhr/ai@0.2.1
  - @bfhr/api@0.2.1
  - @bfhr/core@0.2.1

## 0.2.0

### Minor Changes

- f679cc3: Import a CV from PDF, Word, JSON Resume or a LinkedIn data export. Rewrite, shorten, strengthen or translate CV text (English, Turkish, German) with AI. The AI never adds facts that aren't in your CV: unknown numbers become placeholders like `[X%]` for you to fill in. AI features can be turned off in your profile, and each account has a daily AI limit.
- f448de2: Sign in with a one-time link sent to your email. The website has a new sign-in page that hands the link to the desktop app, and the Privacy Policy, Terms and Support answers describe the link instead of a code.
- 6eb122d: CV PDFs now look the same whether they are made on a Mac, on Windows or by the server: line spacing, page margins and page breaks match across print engines. The server can make a PDF of your CV too (used later for email attachments and the iPhone app).

### Patch Changes

- Updated dependencies [f679cc3]
- Updated dependencies [6eb122d]
- Updated dependencies [54a2f4b]
  - @bfhr/core@0.2.0
  - @bfhr/api@0.2.0
  - @bfhr/ai@0.2.0
  - @bfhr/cv-render@0.2.0

## 0.1.1

No changes in this release.

## 0.1.0

No changes in this release.
