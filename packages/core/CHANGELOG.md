# @bfhr/core

## 0.4.0

### Minor Changes

- 1f1c8d2: Settings › Data & privacy: "Export everything" builds a ZIP of all your data (readable JSON per collection, your CV and attachment files, a README; never passwords or tokens), downloadable for 7 days. "Delete account" removes every document, file and the sign-in account, revoking mail access at Google first, after you confirm by typing a word and, if needed, signing in again with an email link. On the Mac/PC and iPhone.
- 0905d17: Apply with AI help: "Tailor for this job" proposes edits to your CV that you accept or keep one by one, saved as a new version; a cover letter draft from your CV and the job in a formal, warm or concise tone, with your own reusable templates; and an answers library (work authorization, notice period, salary expectation, links, common questions) ready to copy into company application forms. The AI only rewords, reorders and emphasises what your CV already says: an edit or sentence that would add an employer, number, date or skill you don't have is removed.
- 01435f6: iPhone: the Jobs tab is live. Matches from your job sources with their band, reasons and gaps; search across job sites; filters for work mode, match, date, salary, location, seniority and source; save (straight into the Tracker) or hide with an optional reason, both with Undo; saved searches with alerts and a Hidden jobs list; add a job from a link. Apply from any job: pick the CV and cover letter, then open the company site in Safari and answer "Did you apply?", or email it with your CV and cover letter as PDFs (from a connected account with 10 seconds to undo, or from Mail). The application keeps the exact CV version you sent. Push notifications are wired up for alerts and interview mail once the APNs key is in place.
- 1b35770: Mail: connect IMAP accounts with an app password (Gmail and Outlook through OAuth once their clients are registered), scan the last 30–180 days, sort job mail with rules or Claude (EN/TR/DE) into automatic tracker updates with Undo or the review queue, and send email applications with a 10-second undo window.
- fc77c88: Push notifications: interview invites, offers, assessments, decisions and automatic status changes from email, plus one digest for new saved-search matches, in your app language. They wait for the end of your quiet hours and each kind can be turned off in Settings › Notifications.
- 257f97a: Security fixes from the M6 review. Connecting Gmail or Outlook now finishes in the app that started it: the mailbox is saved only for your account, the app shows which address was connected, and Microsoft always asks for consent. New accounts are by invitation for now. Mail from Spam, or mail whose sender can't be verified, no longer changes your applications automatically; it waits in Review. Followed careers pages must use https. Daily limits protect PDF making, email connect attempts and AI help; the website sends stricter security headers.

### Patch Changes

- bcb03f2: Sending from a Microsoft account now asks Microsoft only for permission to send (`Mail.Send`), as the privacy policy says; it no longer asks to change your mailbox. Each email goes out in one request with one copy in Sent Items, and follow-ups still reply in the same conversation. Because of that, a Microsoft account can attach about 2.9 MB in total; BruteForceHR tells you before sending if the CV and cover letter are larger.

## 0.3.0

### Minor Changes

- 1c3a3aa: Tracker on real data (M3, desktop): Firestore listeners and batched writes for applications, events, interviews and contacts (offline, waiting-to-sync state); board moves by drag, keyboard and Move to… through the core state machine with durable Undo; full-page application detail (timeline with automatic events and Undo, documents used, contacts, interview rounds with .ics export, notes, reminders); Log an application (⌘N); follow-up and no-response suggestions with Later / Not needed / Keep waiting persisted on the application (`visibleSuggestions`, ported to BFHRCore); opt-in interview prep notifications; Today on live data.
- ffcd3ed: Insights (M3): pure metrics in `@bfhr/core` (funnel by apply date, response rate by source / channel / CV / market, median time to first response, 12-week activity, Tracker drill-downs) with conformance vectors ported to BFHRCore; desktop Insights screen (sidebar ⌘6) and iOS Insights pushed from the Tracker, both on live data.
- fad8a90: iPhone Tracker on real data: Pipeline with Move to… and Undo, application detail with interviews, contacts, notes and reminders, Log an application, a Calendar agenda with Add to Calendar (.ics), local reminders for follow-ups and interview prep, and Today on real data.

## 0.2.2

No changes in this release.

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- f679cc3: Import a CV from PDF, Word, JSON Resume or a LinkedIn data export. Rewrite, shorten, strengthen or translate CV text (English, Turkish, German) with AI. The AI never adds facts that aren't in your CV: unknown numbers become placeholders like `[X%]` for you to fill in. AI features can be turned off in your profile, and each account has a daily AI limit.
- 6eb122d: CV PDFs now look the same whether they are made on a Mac, on Windows or by the server: line spacing, page margins and page breaks match across print engines. The server can make a PDF of your CV too (used later for email attachments and the iPhone app).
- 54a2f4b: Three CV templates (Classic, Modern, Compact) that applicant tracking systems read correctly, with accent colours, font pairs, density and A4/Letter. Section headings and dates follow the CV's language (English, Turkish, German). Export to PDF, Word and JSON Resume, named `First-Last-CV-Company.pdf`. German and Turkish CVs can add a photo and date of birth; both are off unless you turn them on.

## 0.1.1

No changes in this release.

## 0.1.0

No changes in this release.
