---
"@bfhr/functions": patch
"@bfhr/core": patch
"@bfhr/desktop": patch
---

Sending from a Microsoft account now asks Microsoft only for permission to send (`Mail.Send`), as the privacy policy says; it no longer asks to change your mailbox. Each email goes out in one request with one copy in Sent Items, and follow-ups still reply in the same conversation. Because of that, a Microsoft account can attach about 2.9 MB in total; BruteForceHR tells you before sending if the CV and cover letter are larger.
