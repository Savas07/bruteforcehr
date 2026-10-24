---
layout: ../../layouts/GuideLayout.astro
---

## Stages

Every application has one stage. The active ones run from left to right:

**Saved** → **Preparing** → **Applied** → **Acknowledged** → **Screening** → **Interviewing** → **Offer**

An application closes as **Accepted**, **Declined**, **Not selected**, **Withdrawn** or **No response**. "Not selected" is shown in grey: it's an outcome, not a failure.

Automatic updates follow a few rules, so nothing surprising happens:

- An email can move an application forward, or to Not selected. It never marks one Accepted, Declined, Withdrawn or No response; only you do that.
- Only you can move an application back to an earlier stage.
- Every automatic change shows the email it came from, with **Undo**.
- After 21 days without a reply, the Tracker asks whether to **Mark as no response** or **Keep waiting**. It never does it by itself.

## Board, table and calendar

On Mac and Windows, switch views at the top of the Tracker.

- **Board**: a column per stage. Drag a card to another column, or select a card and press <kbd>M</kbd> to **Move to…**. Closed applications sit in a column of their own that you can show or hide.
- **Table**: one row per application, with the columns you choose in **Columns**. Sort by any column, search, filter by **Active**, **Closed** or **All**, or select several rows to set their status at once or export them as CSV.
- **Calendar**: interviews, deadlines, reminders and suggested follow-ups by month or week, with the next 7 days beside it. **Add to calendar (.ics)** puts an interview in your own calendar; **Export** saves all upcoming interviews as one file.

On iPhone, the Tracker shows your **Pipeline** grouped by stage (**Active**, **Closed** or **All**) and a **Calendar**. Touch and hold an application to move it.

## Add an application

Applications are added for you when you save a job or apply from BruteForceHR. To log one you applied to elsewhere:

1. Choose **Add application** (<kbd>⌘</kbd> <kbd>N</kbd> or <kbd>Ctrl</kbd> <kbd>N</kbd>).
2. In **Log an application**, enter the company and role, the stage and, once you've applied, the day you applied. The rest is optional: how you sent it, the CV, the location, a link to the posting and notes.
3. Choose **Add application**, or **Add and open** to continue in its details.

## Import from a spreadsheet

Tracked your applications in Excel, Google Sheets or Numbers? Save the sheet as CSV, then in the Tracker table choose **Import CSV**.

- CSV or TSV files up to 5 MB and 2,000 rows work. Column names can be in English, Turkish or German.
- BruteForceHR matches your columns to its fields and your status words to its stages; check them and change what's off.
- Review the rows and choose which to import. The file is read on your computer; only the applications you import are saved.

## Application details

Open an application to see everything about it in one place:

- **Stage** with the full path, and how long it has been in the current stage. The main button suggests the next step, such as preparing for the next interview.
- **Timeline**: every change, email and note in order, each marked with where it came from: **You**, **From email** or **Automatic · Mail**. Automatic changes have **Undo** and **View source**.
- **Interview rounds**: date and time (also in the interview's own time zone when it differs from yours), the meeting link or place, the people you'll meet and your prep notes. **Add to calendar (.ics)** works per round.
- **Emails** linked to the application.
- **Contacts**: recruiters and interviewers, kept in your address book.
- **Documents used**: the CV version and cover letter you sent.
- **Reminders**, and **Notes** for anything else.

On Mac and Windows, an application opens in a panel beside the list; <kbd>⌘</kbd> <kbd>↩</kbd> (<kbd>Ctrl</kbd> <kbd>Enter</kbd>) opens it as a full page.

## Reminders and follow-ups

- Add a reminder to any application. On a Mac or Windows PC it appears as a notification while BruteForceHR is running; on iPhone, as a notification at the time you chose.
- Seven days after you apply, if there's no reply, Today suggests a follow-up. Choose **I followed up** when you have, or **Not needed**.

## Undo

Every change you make in the Tracker shows a short confirmation with **Undo** (<kbd>⌘</kbd> <kbd>Z</kbd> or <kbd>Ctrl</kbd> <kbd>Z</kbd>). If the application has changed again since, Undo says so instead of overwriting the newer change.
