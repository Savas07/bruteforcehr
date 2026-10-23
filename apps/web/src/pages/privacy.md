---
layout: ../layouts/LegalLayout.astro
title: Privacy Policy
description: What BruteForceHR collects, why, where it's kept, and how you can download or delete it.
effective: "2026-10-23"
keyPoints:
  - "Only job-related email is kept. Other email is never stored."
  - "Nothing is sent from your email account until you've reviewed the message and pressed Send."
  - "AI is optional, gets only the text a task needs, and doesn't train on it."
  - "Your data is stored with Google Cloud in Belgium and is never sold or used for ads."
  - "You can download or permanently delete everything yourself, at any time."
---

This policy covers the BruteForceHR apps for iPhone, Mac and Windows, the servers they use, and this website. Each section starts with a short summary in plain words. The summaries help you skim; the full text under each one is what applies.

## Who runs BruteForceHR

<div class="plain-summary">

**In short:** BruteForceHR is a personal, non-commercial project run by one developer. It's free, shows no ads and sells nothing.

</div>

BruteForceHR is built and run by an individual developer, Savaş Altıntaş (GitHub: [Savas07](https://github.com/Savas07)), who is responsible for your data (the "data controller") and is referred to as "we" in this policy. It is not a company.

BruteForceHR is made for personal job searching. It is free and is currently used by a small number of invited people. To contact us, see [Contact](#contact).

## What we collect

<div class="plain-summary">

**In short:** What you put into the app, the job-related email it finds for you, and the technical details needed to run it. No analytics, no advertising IDs, no location.

</div>

- **Your account:** your email address. While you sign in, we also keep a scrambled (hashed) copy of your one-time code, which expires after 10 minutes.
- **Your profile and preferences:** your name, the roles, seniority, locations and minimum salary you're looking for, your work authorization, languages, time zone, skills, companies you've hidden, and your app settings.
- **Your CVs and documents:** CV content and its earlier versions, files you import (the original file is kept), PDFs and Word files the app creates, and cover letters. A photo or date of birth is only stored if you add one to a CV.
- **Your job search:** saved jobs, saved searches, match scores and their explanations, applications, notes, interviews, reminders, and the answers you save for application forms.
- **Contacts:** names, email addresses, companies and roles of recruiters and interviewers that you add or that come from job-related email.
- **Connected email accounts:** the provider, the address, the permissions you granted, the account's status, and the access tokens or app password that let us read and send mail. Tokens and passwords are encrypted (see [Your email accounts](#your-email-accounts)).
- **Job-related email:** see [Your email accounts](#your-email-accounts).
- **Your devices:** app version, operating system version, language, when the device last connected, and, if you allow notifications, the device's push token.
- **Server logs:** times, error codes and scrambled identifiers needed to run the service and investigate problems. They don't contain your email text, CV content or sign-in codes.

We don't collect your location, your phone's contacts or photos, advertising identifiers, or analytics. The apps contain no advertising or analytics software and don't send crash reports.

## How we use your data

<div class="plain-summary">

**In short:** Only to run the features you use. Never for advertising, and never sold.

</div>

We use your data to sign you in, find and rank jobs for you, build and export your CVs and cover letters, track your applications, recognise job-related email and update your applications from it, send the messages you approve, remind you of interviews and follow-ups, and keep the service secure.

If the EU or UK GDPR applies to you, our legal bases are:

- **To provide the service you asked for** (contract): your account, profile, CVs, jobs, applications and the features that use them.
- **Your consent:** connecting an email account, permission to send from it, sending email text to AI, and notifications. You can withdraw consent at any time in Settings; this doesn't affect what was done before.
- **Legitimate interests:** keeping the service secure and preventing abuse, for example limiting how many sign-in codes can be requested.
- **Legal obligations:** where a law requires us to keep or disclose data.

We never sell your data, use it for advertising, or use it to decide creditworthiness.

## Your email accounts

<div class="plain-summary">

**In short:** We look only for job-related email. Other email is never stored. Nothing is sent from your account until you've reviewed that message and pressed Send.

</div>

Connecting an email account is optional. You can connect Gmail, Microsoft (Outlook.com and Microsoft 365) and other providers through IMAP and SMTP.

### What we read

Once an account is connected, our servers check it for new messages about every 5 minutes, including the Spam or Junk folder, because application emails often land there. The first time, they also look back over the last 90 days (you can choose 30, 90 or 180 days).

Each message is first checked with simple rules: is it a reply to an application you sent, does it come from a known hiring system or from a company you're tracking, and does it contain job-related words? Messages that aren't job-related are not stored. We keep only the message's ID and a hash of it, so the same message isn't checked twice, and delete those when they fall outside the look-back window.

Job-related messages are sorted (for example: application received, interview invitation, assessment, offer, not selected, job alert), linked to the right application, and the useful details are picked out: company, role, dates and times, meeting links, deadlines and the contact person.

### Gmail

When you connect Gmail, BruteForceHR asks Google for:

- `gmail.readonly` — to read messages as described above. It can't change, delete or send anything.
- Your basic account information (`openid` and your email address), to know which account you connected.

Permission to send (`gmail.send`) is requested separately, only the first time you choose to send an application from that Gmail account.

### Microsoft

When you connect a Microsoft account, BruteForceHR asks Microsoft for:

- `Mail.Read` — to read messages as described above.
- `User.Read` — your account's name and email address.
- `offline_access` — to keep checking for new mail while the app is closed.

Permission to send (`Mail.Send`) is requested separately, only the first time you choose to send an application from that account.

### IMAP and SMTP

For other providers (for example iCloud Mail or Yahoo Mail), you enter the server address, port, username and an app password. They're sent to our servers over an encrypted connection, tested once, and stored encrypted. The same app password is used to read mail (IMAP) and to send the messages you approve (SMTP). We recommend an app password, which you can revoke at your provider at any time, rather than your main password.

### What we keep

For each job-related message we keep the sender, subject, date, a short snippet, the message text, its category, the details picked out of it, and its link to your application.

- **Message text and snippet:** kept while the linked application is active, then deleted 180 days after the application closes. Messages that aren't linked to an application lose their text 180 days after they arrived. You can change this period in Settings.
- **Everything else** (sender, subject, date, category and details): kept with your application until you delete the application, disconnect the account, or delete your BruteForceHR account.
- **Access tokens and app passwords:** encrypted with AES-256-GCM, readable only by our servers, and never sent to the apps.

### Sending email

BruteForceHR never sends a message without you reviewing that specific message — recipient, subject, text and attachments — and pressing Send. After you press Send you have 10 seconds to undo, and there's a daily limit on how many messages can be sent. We store the provider's ID for each sent message so replies can be recognised.

### Disconnecting

When you disconnect an account in Settings › Mail accounts, we revoke our access with Google or Microsoft, and delete the account's stored messages and its tokens or app password. For IMAP accounts, we delete the app password; to be sure it can't be used again, also delete it at your email provider. Applications, interviews and contacts that were created from that account's email stay in your tracker until you delete them.

You can also remove BruteForceHR's access from your Google or Microsoft account settings at any time.

### Google API Services: Limited Use

BruteForceHR's use and transfer of information received from Google APIs to any other app will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the [Limited Use requirements](https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes).

In particular, data from your Gmail account:

- is used only to provide the features you see in the app: tracking your applications, adding jobs from job-alert emails, and sending the messages you approve;
- is shared with others only to provide those features with your consent (for example, sending email text to AI when you've turned that on, see [AI features](#ai-features)), for security, or to comply with the law;
- is not read by any person unless you ask us to look at a specific message, it's needed for security, or the law requires it;
- is never sold, never used for advertising, and never used to train AI models.

## AI features

<div class="plain-summary">

**In short:** AI is optional. When it's on, only the text a task needs is sent to Anthropic, which doesn't train its models on it.

</div>

Some features use Anthropic's Claude models through Anthropic's API. Only our servers talk to Anthropic; the apps never hold an AI key. You can turn AI features off in Settings › AI & sending.

AI is used to:

- **Sort job-related email** and pick out its details — only if **Allow sending email text to AI** is on. When it's off, email is sorted with rules only, and messages the rules can't place go to your review list for you to sort.
- **Suggest CV and cover-letter changes** when you ask for them, such as tailoring a CV to a job, rewording a bullet, or translating. Suggestions are shown for you to accept or reject.
- **Explain job matches** for your best-matching jobs, and **read job details** from job pages.

Only the text a task needs is sent: for example the sender, subject and relevant text of one message, or your CV and the job description for a tailoring request — never your whole mailbox or account. Under Anthropic's commercial terms, Anthropic doesn't use this data to train its models, and deletes it within 30 days unless it must keep it longer to enforce its usage policy or to comply with the law. Our logs don't contain the text sent to AI.

## Job search and job sources

<div class="plain-summary">

**In short:** Job searches run on our servers. Job boards see the search, not who you are.

</div>

To find jobs, our servers search public job APIs and job boards (Remotive, Arbeitnow, Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Adzuna, Jooble, USAJOBS and Reed) and read public job pages that you share or ask to watch. These requests contain your search terms (keywords, locations and filters) and come from our servers, not your device. They don't include your name, email address or CV.

When you share a job link from another app, the link is sent to our servers so they can read the job. Results are stored in your account with their source. When you open a job or apply on another website, that website's own privacy policy applies.

## Where your data is stored and who processes it

<div class="plain-summary">

**In short:** Your data is stored with Google Cloud in Belgium. A few other services help run the app; each gets only what it needs for its job.

</div>

<dl class="service-list">
<div>
<dt>Google Cloud</dt>
<dd>Firebase: Firestore, Cloud Storage, Cloud Functions, Cloud Tasks and Secret Manager. Stores and processes your data.</dd>
<dd><span>Receives:</span> everything described in <a href="#what-we-collect">What we collect</a>.</dd>
<dd><span>Where:</span> Belgium (europe-west1).</dd>
</div>
<div>
<dt>Google</dt>
<dd>Firebase Authentication keeps you signed in; Firebase Hosting serves this website.</dd>
<dd><span>Receives:</span> your account ID, email address and IP address.</dd>
<dd><span>Where:</span> Google's global network.</dd>
</div>
<div>
<dt>Brevo</dt>
<dd>Sends the emails with your sign-in codes.</dd>
<dd><span>Receives:</span> your email address and the email with your code.</dd>
<dd><span>Where:</span> European Union.</dd>
</div>
<div>
<dt>Anthropic</dt>
<dd>Runs the AI features, if you've turned them on.</dd>
<dd><span>Receives:</span> only the text a task needs (see <a href="#ai-features">AI features</a>).</dd>
<dd><span>Where:</span> United States.</dd>
</div>
<div>
<dt>Your email provider</dt>
<dd>Google, Microsoft or your IMAP provider hosts your email account.</dd>
<dd><span>Receives:</span> requests made with the access you granted.</dd>
<dd><span>Where:</span> your provider's locations.</dd>
</div>
<div>
<dt>Apple</dt>
<dd>Delivers iPhone notifications and distributes the iPhone beta through TestFlight.</dd>
<dd><span>Receives:</span> your device's push token and the notification text.</dd>
<dd><span>Where:</span> Apple's global network.</dd>
</div>
<div>
<dt>GitHub</dt>
<dd>Hosts app downloads, app updates and support issues.</dd>
<dd><span>Receives:</span> your IP address and app version when the Mac or Windows app checks for updates (at launch and every 6 hours), and anything you post in an issue.</dd>
<dd><span>Where:</span> United States.</dd>
</div>
<div>
<dt>Job sources</dt>
<dd>Return job listings for your searches.</dd>
<dd><span>Receives:</span> search terms only.</dd>
<dd><span>Where:</span> each source's own locations.</dd>
</div>
</dl>

When data leaves the European Economic Area (for example to Anthropic or GitHub in the United States), the transfer relies on the provider's safeguards, such as the EU Standard Contractual Clauses or the EU–US Data Privacy Framework.

Notifications on iPhone pass through Apple. They contain a short summary, such as which company sent an interview invitation.

## How long we keep your data

<div class="plain-summary">

**In short:** Most data stays until you delete it. Email text and sign-in data are deleted automatically.

</div>

| Data                                                        | How long                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Your account, profile, CVs, jobs, applications and contacts | Until you delete them or your account                                             |
| Job-related email text and snippet                          | While the application is active, then 180 days (adjustable)                       |
| Other details of job-related email                          | Until you delete the application, disconnect the account, or delete your account  |
| Email that isn't job-related                                | Never stored; its ID and hash are kept only for the look-back window              |
| Sign-in codes                                               | Stored only as a hash; expire after 10 minutes and are deleted within about a day |
| Data exports                                                | The ZIP file is deleted 7 days after it's created                                 |
| Server logs                                                 | Up to 30 days                                                                     |

We don't keep separate backups of your data, so deleted data can't be restored.

## Your choices and rights

<div class="plain-summary">

**In short:** You can see, download, correct and delete everything yourself in the app.

</div>

- **Download your data:** Settings › Data & privacy › Export everything creates a ZIP file with all your data as JSON, plus your files.
- **Correct your data:** edit it anywhere in the app.
- **Disconnect an email account:** Settings › Mail accounts (see [Disconnecting](#disconnecting)).
- **Turn off AI or email text for AI:** Settings › AI & sending.
- **Turn off notifications:** Settings › Notifications, or your device's settings.
- **Delete your account:** Settings › Data & privacy › Delete account. After you confirm with a sign-in code, we revoke our access to your connected email accounts, delete all your data and files, and delete your sign-in account. This is permanent.

Depending on where you live (for example under the EU or UK GDPR, or Turkey's KVKK), you also have the right to access, correct, delete, restrict or object to the processing of your data, to receive it in a portable format, and to withdraw consent. You can also complain to your local data protection authority.

## Security

<div class="plain-summary">

**In short:** Your data is encrypted in transit and at rest, and only your account can read it.

</div>

- All connections use TLS encryption, and Google Cloud encrypts stored data.
- Email access tokens and app passwords get an extra layer of encryption (AES-256-GCM) with a key held only by our servers.
- Access rules let each signed-in account read only its own data. Server-only data, such as tokens, can't be read by any app.
- There are no passwords to leak: you sign in with one-time codes, stored only as hashes, limited to 5 attempts, and they expire after 10 minutes.
- The apps keep a copy of your data on your device so they work offline. On iPhone, your session is stored in the Keychain. Protect your devices with a passcode or password.

## This website

<div class="plain-summary">

**In short:** No cookies, no analytics, no trackers.

</div>

This website is a set of static pages served by Firebase Hosting. Google processes your IP address and request details to deliver the pages and protect the service. We don't use cookies, analytics, advertising or third-party scripts. Links to GitHub take you to GitHub, where [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) applies.

## Children

BruteForceHR is meant for people looking for work and isn't intended for anyone under 16. We don't knowingly collect data from children under 16.

## Changes to this policy

When we change this policy, we update the effective date at the top. If a change affects how we use your data, especially data from your email account, we'll tell you in the app and ask for your consent before using your data in the new way.

## Contact

<div class="plain-summary">

**In short:** Questions go through GitHub issues. Don't post personal details there.

</div>

Privacy requests are self-service in the app: Settings › Data & privacy › Export everything gives you a copy of all your data, and Delete account permanently deletes it (see [Your choices and rights](#your-choices-and-rights)). You can correct your data and disconnect accounts in the app too. For questions about this policy, [open an issue on GitHub](https://github.com/Savas07/bruteforcehr/issues/new). Issues are public, so don't include email addresses, CV content or message text.
