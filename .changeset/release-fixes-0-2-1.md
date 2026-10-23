---
"@bfhr/cv-render": patch
"@bfhr/desktop": patch
---

Release fixes: the CV renderer reads its version from package.json (version bumps no longer break the build), the iOS release job builds the renderer bundle before archiving, and the secret scan allowlists the public Firebase web key.
