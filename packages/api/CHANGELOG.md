# @bfhr/api

## 0.3.0

### Minor Changes

- 1c3a3aa: Tracker on real data (M3, desktop): Firestore listeners and batched writes for applications, events, interviews and contacts (offline, waiting-to-sync state); board moves by drag, keyboard and Move to… through the core state machine with durable Undo; full-page application detail (timeline with automatic events and Undo, documents used, contacts, interview rounds with .ics export, notes, reminders); Log an application (⌘N); follow-up and no-response suggestions with Later / Not needed / Keep waiting persisted on the application (`visibleSuggestions`, ported to BFHRCore); opt-in interview prep notifications; Today on live data.

### Patch Changes

- Updated dependencies [1c3a3aa]
- Updated dependencies [ffcd3ed]
- Updated dependencies [fad8a90]
  - @bfhr/core@0.3.0

## 0.2.2

### Patch Changes

- @bfhr/core@0.2.2

## 0.2.1

### Patch Changes

- @bfhr/core@0.2.1

## 0.2.0

### Minor Changes

- f679cc3: Import a CV from PDF, Word, JSON Resume or a LinkedIn data export. Rewrite, shorten, strengthen or translate CV text (English, Turkish, German) with AI. The AI never adds facts that aren't in your CV: unknown numbers become placeholders like `[X%]` for you to fill in. AI features can be turned off in your profile, and each account has a daily AI limit.
- 54a2f4b: Three CV templates (Classic, Modern, Compact) that applicant tracking systems read correctly, with accent colours, font pairs, density and A4/Letter. Section headings and dates follow the CV's language (English, Turkish, German). Export to PDF, Word and JSON Resume, named `First-Last-CV-Company.pdf`. German and Turkish CVs can add a photo and date of birth; both are off unless you turn them on.

### Patch Changes

- Updated dependencies [f679cc3]
- Updated dependencies [6eb122d]
- Updated dependencies [54a2f4b]
  - @bfhr/core@0.2.0

## 0.1.1

### Patch Changes

- @bfhr/core@0.1.1

## 0.1.0

### Patch Changes

- @bfhr/core@0.1.0
