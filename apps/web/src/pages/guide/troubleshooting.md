---
layout: ../../layouts/GuideLayout.astro
---

## Installing and updating

**macOS says it can't check BruteForceHR for malware.** The Mac app isn't notarized by Apple yet. Select **Done**, open **System Settings › Privacy & Security**, and select **Open Anyway** under **Security** within an hour. See [Install on Mac](/guide/getting-started/#install-on-mac).

**Windows shows "Windows protected your PC".** The installer isn't code-signed yet. Select **More info**, then **Run anyway**.

**I can't find the iPhone app.** It's in a private TestFlight beta, by invitation only. See [Install on iPhone](/guide/getting-started/#install-on-iphone).

**An update didn't install.** Your current version keeps working. Choose **Try again** in the update card, or download the latest version from the [Download page](/download/) and install it over the old one; your data is in your account, not in the app.

**The app says "Update required".** That version is no longer supported. Restart when the download is ready, or choose **Download from the website**. Your data stays safe in your account.

## Signing in

**The sign-in email doesn't arrive.** It comes from noreply@bruteforcehr.firebaseapp.com and usually takes under a minute. Check your spam or junk folder and the spelling of your address, then choose **Send again** (you can send a new link a minute after the last one). If it says too many links were requested, wait a few minutes.

**"BruteForceHR is invite-only for now".** Your address isn't on the list yet, so no account was created. Ask the owner to add it, then send yourself a new link.

**"This sign-in link has expired" or "doesn't work".** A link works once, for a limited time, and only the newest one works. Send yourself a new link and open the latest email.

**The app asks me to confirm my email.** You opened the link on a different device from the one that asked for it. Enter the address you requested the link with, or request a new link on this device.

**I opened the link on my computer and nothing happened.** The link opens in your browser, which hands it to BruteForceHR. Make sure the app is installed, then allow the browser to open it when asked.

## Connecting email

**"We couldn't sign in with this password".** Use an app password, not your regular password, and check it was copied in full without spaces at the ends. See [App passwords](/guide/mail/#app-passwords-for-other-providers).

**"IMAP access is turned off for this account".** Turn on IMAP (or "access for other programs") in your provider's settings, then try again.

**"We can't reach this server" or the certificate can't be verified.** For **Other (IMAP)**, check the server names, ports and security setting with your provider.

**Google says it hasn't verified this app.** That's expected for this personal build. Choose **Advanced**, then continue to BruteForceHR.

**"Your organization needs to approve BruteForceHR".** Your work or school account needs your IT admin's approval. Ask them, or connect a personal account.

**Outlook doesn't accept an app password.** Microsoft no longer allows app passwords for Outlook.com. Connect with **Sign in with Microsoft**.

**An account says "Needs reconnecting".** BruteForceHR paused checking it, usually after a password change or when access expired. Choose **Reconnect** in **Settings › Mail accounts**; it picks up where it left off.

**An email was sorted wrongly.** Open it in Mail and choose **Change…**, or **Not job mail**. If it moved an application, choose **Undo**.

## Sending an application

**"This account can't send yet".** It's connected for reading only. Use **Reconnect** to add its outgoing server or allow sending. Your draft is saved.

**"Daily limit reached".** You can send more tomorrow; the draft is saved.

**The attachments are too large.** Try a shorter CV or leave out the cover letter. Microsoft accounts accept about 3 MB of attachments per email.

**I sent it from my own mail app.** Choose **I sent it** in the composer, or move the application to **Applied** in the Tracker, so your history is complete.

## Jobs

**A search finds nothing new.** Check **Settings › Job sources**: a source may be paused or not set up yet. Try a broader role, fewer filters or **Search job sites** again later.

**A link can't be read.** Some sites block automatic reading or need a sign-in. Choose **Enter it yourself**; the link is kept.

## Offline and sync

The apps work offline: what you change is saved on the device and syncs when you're back online. On Mac and Windows, the line at the bottom of the sidebar shows the sync state. Things that need a server, such as searching job sites, reading a link, AI suggestions, sending email and exports, wait until you're online.

If you changed the same CV on two devices while one was offline, BruteForceHR asks which version to keep; the other stays in the version history.

## Still stuck?

Ask on the [Support page](/support/). Support runs on public GitHub issues, so don't include email addresses, CV content, message text or screenshots that show personal details. Mention your device and the version from **Settings › General** (Mac and Windows) or **Settings › About** (iPhone).
