---
layout: ../../layouts/GuideLayout.astro
---

## Install on Mac

1. Download the Mac app from the [Download page](/download/). It runs on Apple silicon and Intel Macs.
2. Open the downloaded file and drag BruteForceHR to Applications.
3. Open BruteForceHR. The first time, macOS says it can't check the app for malware, because this build isn't notarized by Apple yet. Select **Done**.
4. Open **System Settings › Privacy & Security**, scroll to **Security** and select **Open Anyway**. The button is there for about an hour after you tried to open the app.
5. Enter your Mac login password. From then on, BruteForceHR opens like any other app.

Apple explains this step in [opening an app from an unknown developer](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac).

## Install on Windows

1. Download the Windows installer from the [Download page](/download/). It runs on 64-bit Windows 10 and 11.
2. Open the installer. The installer isn't code-signed yet, so Windows may show "Windows protected your PC". Select **More info**, then **Run anyway**.
3. Follow the installer, then open BruteForceHR from the Start menu.

Both desktop apps update themselves. They check when they start and every few hours, check each update's signature, and ask you to restart when an update is ready. You can also check right away in **Settings › General › Updates**. To make sure a download arrived intact, compare its checksum with the one on the [Download page](/download/#verify).

## Install on iPhone

The iPhone app is in a private beta on TestFlight, Apple's app for testing new apps. It isn't on the App Store and there's no public sign-up. It needs iOS 18 or later.

1. Ask the owner of BruteForceHR to invite you. The invitation goes to the email address of your Apple Account.
2. Install [TestFlight from the App Store](https://apps.apple.com/app/testflight/id899247664).
3. On your iPhone, open the invitation email and follow its link, then install BruteForceHR in TestFlight.

New versions arrive through TestFlight too. Turn on **Automatic Updates** for BruteForceHR in TestFlight to get them without asking.

## Sign in

BruteForceHR has no passwords. You sign in with a one-time link sent to your email address, and the same address signs you in on every device, so your jobs, CVs and applications are everywhere.

<div class="guide-note">

**Sign-up is invite-only for now.** If your address isn't on the list yet, the link says "BruteForceHR is invite-only for now" and no account is created. Ask the owner to add your email, then send yourself a new link.

</div>

1. Open BruteForceHR, enter your email address and select **Send sign-in link**.
2. Open the email on the same device. It usually arrives within a minute; if not, check your spam folder.
3. Select the link:
   - **On a Mac or Windows PC**, the link opens in your browser, which hands it back to the app.
   - **On iPhone**, the link opens the app directly.

A link works once, for a limited time, and a newer link replaces an older one. If you open a link on a different device from the one that asked for it, the app asks you to confirm your email address first.

## Set up in three steps

The first time you sign in, BruteForceHR asks three things. Every step has **Skip for now**, and you can change everything later.

1. **Add your CV.** Import the CV you have (PDF, Word, JSON Resume or your LinkedIn data export), **Start from scratch**, or skip. On Mac and Windows the import button is **Import a CV file**; on iPhone, **Upload a file** or **Import LinkedIn export**. PDF and Word files are read by Claude, an AI, and you check the result. See [CV Studio](/guide/cv-studio/).
2. **What are you looking for?** Roles, seniority, where you'd work, a salary floor, work authorization and languages. If you added a CV, what it says is filled in already; change anything that's off. Everything is optional.
3. **Start your first search.** BruteForceHR shows the search it will run for you every day, built from your roles and places. **Start searching** saves it and runs it right away. To finish without one, choose **Finish without a search** (on iPhone, **Skip for now**). Either way you land on Today, and new matches appear in Jobs as they're found.

To change your answers later, open **Settings › Job preferences**. See [Settings](/guide/settings/#job-preferences).

## Find your way around

- **Today**: what needs you now, such as the next interview, emails to review, follow-ups and deadlines.
- **Jobs**: openings from job sites and the companies you follow, ranked by how well they fit.
- **Tracker**: every application, from saved to offer.
- **CVs**: your CVs and their versions.
- **Mail**: job emails from your connected inboxes, and the ones to review.
- **Insights**: how far your applications get and where replies come from.
- **Settings**: preferences, connections, notifications and your data.

On a Mac or Windows PC, all of them are in the sidebar, with Settings at the bottom. On iPhone, Today, Jobs, Tracker, CVs and Mail are tabs; Insights opens from the Tracker or from the bottom of Today, and Settings from your initials at the top right.

On the desktop, **Jump to…** at the top of the sidebar (<kbd>⌘</kbd> <kbd>K</kbd> or <kbd>Ctrl</kbd> <kbd>K</kbd>) opens the command palette: type a few letters of any destination, setting or action. Press <kbd>?</kbd> to see the keyboard shortcuts for the screen you're on, or read them all in [Keyboard shortcuts](/guide/keyboard-shortcuts/).

## Today

Today collects what needs your attention, in a fixed order: **Next up** (your next interview), **To review** (emails BruteForceHR wasn't sure about), **Follow-ups**, **Deadlines** and **New matches**. Empty sections stay hidden, and Today has no greeting and no streaks.

- Select an item to open it; on a wide window its details open beside the list.
- **Snooze** an item to bring it back later today, tomorrow or next week. Snoozed items wait under **Later**.
- When an email moved an application on its own, Today shows where the change came from, with **Undo**.
