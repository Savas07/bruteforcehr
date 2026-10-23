---
"@bfhr/desktop": patch
---

CV Studio no longer shows "This CV changed on another device" right after saving: the session store mistook the editor from before its own write (re-read before Firestore's snapshot of that write arrives) for a remote save.
