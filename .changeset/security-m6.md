---
"@bfhr/functions": minor
"@bfhr/core": minor
"@bfhr/api": minor
"@bfhr/desktop": minor
"@bfhr/web": patch
---

Security fixes from the M6 review. Connecting Gmail or Outlook now finishes in the app that started it: the mailbox is saved only for your account, the app shows which address was connected, and Microsoft always asks for consent. New accounts are by invitation for now. Mail from Spam, or mail whose sender can't be verified, no longer changes your applications automatically; it waits in Review. Followed careers pages must use https. Daily limits protect PDF making, email connect attempts and AI help; the website sends stricter security headers.
