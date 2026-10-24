---
layout: ../../layouts/GuideLayout.astro
---

## What Mail does

Connect the inbox you use for job hunting and BruteForceHR looks for application confirmations, interview invites, assessments, offers and replies from employers. When it's sure what an email means, it updates the application and tells you why, with **Undo**. When it isn't sure, it asks you first.

- It only keeps emails about your job search. Other emails are skipped, and their content is never stored.
- It also checks Spam or Junk, because employers' emails often land there.
- After the first scan, it checks for new mail every few minutes.

## Connect an email account

1. Open **Settings › Mail accounts** and choose **Add email account**. (You can also start from Mail or Today when no inbox is connected yet.)
2. Enter your email address so BruteForceHR picks your provider, or choose the provider yourself.
3. Under **Look back**, choose how far back the first scan goes: 30, 90 or 180 days.
4. Choose **Continue**, then follow the steps for your provider below.

You can connect several accounts. Each one is listed in **Settings › Mail accounts** with its status, the folders checked and how many job emails are stored.

## Gmail and Outlook

**Gmail and Google Workspace** connect with **Sign in with Google**, and **Outlook.com and Microsoft 365** with **Sign in with Microsoft**. BruteForceHR opens your browser (on iPhone, a sign-in sheet); sign in and allow access, then come back to the app.

- Allow reading your email when asked; without it, BruteForceHR can't find your applications. Permission to send is asked separately, the first time you [apply by email](/guide/apply/#apply-by-email) from that account.
- Google may say it hasn't verified this app. That's expected for this personal build: choose **Advanced**, then continue to BruteForceHR.
- A work or school Microsoft account may need your IT admin to approve BruteForceHR first. If it does, connect a personal account instead.

<div class="guide-note">

**If Google or Microsoft sign-in isn't switched on yet**, the app says so. Gmail works now with an app password: see the Gmail steps below. Microsoft no longer accepts app passwords for Outlook.com, so Outlook connects once Microsoft sign-in is switched on.

</div>

## App passwords for other providers

iCloud Mail, Yahoo Mail, Yandex Mail, GMX, WEB.DE and most other providers connect over IMAP with an **app password**: a separate password you create for BruteForceHR at your provider. Your regular password usually won't work, and you can delete the app password at any time to cut off access.

The app shows these steps next to the password field, with a link to your provider's settings.

| Provider                   | How to create the app password                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gmail** (without Google sign-in) | Turn on 2-Step Verification in your Google Account. Open [App passwords](https://myaccount.google.com/apppasswords), create one named BruteForceHR, and paste the 16-letter password. |
| **iCloud Mail**            | Sign in at [account.apple.com](https://account.apple.com) and open **Sign-In and Security**. Choose **App-Specific Passwords**, create one named BruteForceHR, and paste it (it looks like xxxx-xxxx-xxxx-xxxx). |
| **Yahoo Mail**             | Open **Account security** in your Yahoo account, choose **Generate app password**, name it BruteForceHR, and paste it.                                                                         |
| **Yandex Mail**            | In Yandex Mail settings, allow access from mail clients (IMAP). Then in **Yandex ID › Security**, create an app password for Mail and paste it.                                                |
| **GMX**, **WEB.DE**        | In your mail settings, open **POP3 & IMAP** and turn on access for other programs. If you use two-factor sign-in, create an app password under **Security**; otherwise use your mail password. |
| **Other (IMAP)**           | Ask your provider for the IMAP and SMTP server names, ports and security (SSL/TLS or STARTTLS), and an app password if they offer one.                                                        |

Choose **Test and connect**. BruteForceHR sends the password once over an encrypted connection, tests it, and stores it encrypted; it never shows it again. For **Other (IMAP)**, leave the outgoing (SMTP) server empty to connect for reading only; you can add it later with **Reconnect** if you want to apply by email from that account.

## The first scan

Right after connecting, BruteForceHR checks the period you chose: it finds job-related emails, matches them to companies and roles, and prepares your review. This can take a few minutes; you can keep using the app, and the results show up in Mail.

When it's done, it tells you how many applications and interview invites it found. Applications you'd sent before you started using BruteForceHR are collected in **Inbox scan** in Mail, where you choose which ones to add to your Tracker. Job alert emails it found send their postings to [Jobs](/guide/jobs/).

To scan again later, open the account in **Settings › Mail accounts** and choose **Scan again**.

## Review job emails

Mail has a few views, in the sidebar on Mac and Windows and as chips on iPhone:

- **To review**: emails BruteForceHR wasn't sure about. The Mail tab and sidebar show how many.
- **Updates**: changes BruteForceHR made from your email, each with **Undo**.
- **All job mail**, **Categories** (such as Interview invite, Assessment, Offer, Decision, Recruiter) and one view per inbox.

Each email shows what BruteForceHR understood: its category, the application it belongs to, and the stage change it suggests, with a quote from the email. Then:

- **Confirm** (<kbd>C</kbd>) applies it. Confirming an interview invite also adds the interview round with its date and time.
- **Change…** (<kbd>M</kbd>) lets you pick another category, application or stage.
- **Not job mail** (<kbd>N</kbd>) removes it; BruteForceHR won't keep that email.
- **Review later** (<kbd>H</kbd>) brings it back later today, tomorrow, next week or on a day you pick.
- **Open original** (<kbd>O</kbd>) opens the email in your inbox.

## Undo an automatic change

When an email moves an application on its own, you see it in Today, in Mail's **Updates** and in the application's timeline, always with the email it came from. Choose **Undo** to put the application back. If you've changed the application again since, Undo tells you instead of overwriting your change.

## Reconnect, check now or disconnect

In **Settings › Mail accounts**, each account has:

- **Check now**, to look for new mail right away.
- **Reconnect**, when the status says **Needs reconnecting**: for example after you changed your password, deleted the app password or Google's access expired. Enter a new app password or sign in again, and BruteForceHR picks up where it left off.
- **Disconnect…**: BruteForceHR stops checking that inbox, removes its access at your provider, and deletes the job emails it stored from it. Your applications and their history stay. For an account connected with an app password, also delete the app password at your provider.

## Email and AI

By default, emails are sorted with rules. In **Settings › AI**, **Allow sending email text to AI** lets Anthropic's Claude sort them instead, so fewer emails ask for your review. Only the text needed to sort a message is sent, and Anthropic doesn't use it to train its models. See [Data & privacy](/guide/data-and-privacy/).
