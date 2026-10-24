---
"@bfhr/desktop": patch
---

Changes from another device reach the Mac app at once again: Firestore uses long polling in WebKit webviews, where WebKit since Safari 26.4 held back a listener's last update until the server sent more (up to 30 s). CV Studio no longer shows "This CV changed on another device" right after saving: the session store mistook the editor from before its own write for a remote save.
