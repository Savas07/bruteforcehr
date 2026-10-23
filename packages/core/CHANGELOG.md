# @bfhr/core

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
