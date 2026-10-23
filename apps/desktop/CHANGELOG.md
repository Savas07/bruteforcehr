# @bfhr/desktop

## 0.2.2

### Patch Changes

- d5b8fc0: Release fix: the ATS check test waits long enough for the real PDF read-back on loaded CI runners.
- @bfhr/api@0.2.2
  - @bfhr/core@0.2.2
  - @bfhr/cv-render@0.2.2
  - @bfhr/ui-tokens@0.2.2

## 0.2.1

### Patch Changes

- 4e69e6c: Release fixes: the CV renderer reads its version from package.json (version bumps no longer break the build), the iOS release job builds the renderer bundle before archiving, and the secret scan allowlists the public Firebase web key.
- Updated dependencies [4e69e6c]
  - @bfhr/cv-render@0.2.1
  - @bfhr/api@0.2.1
  - @bfhr/core@0.2.1
  - @bfhr/ui-tokens@0.2.1

## 0.2.0

### Minor Changes

- 981fa3a: CV Studio works on your real CVs: create one (empty or from your profile), import a PDF, Word file, JSON Resume or LinkedIn export and review what was read, edit with a live preview that is exactly the exported PDF, pick a template, accent and fonts, and export PDF (made on this computer), Word or JSON with a `First-Last-CV-Company.pdf` name. Each editing session saves one version; version history compares and restores, and edits made on another device at the same time ask which version to keep. The ATS check reads your exported PDF back and compares it with a pasted job description, and "Improve with AI" suggests rewrites you accept one by one (placeholders like [X%] must be filled first).
- d9dc095: Sign in with your email, no password: enter your address, then open the link we email you on this computer. It takes you back to the app and signs you in. If you asked for the link on another device, the app asks for your address once. Expired, used or broken links get a clear message and a way to send a new one. Gmail, Outlook and other webmail addresses get an "Open …" button. "Sign Out" is in the app menu (macOS) or File (Windows) and in the command palette.

### Patch Changes

- Updated dependencies [f679cc3]
- Updated dependencies [6eb122d]
- Updated dependencies [54a2f4b]
  - @bfhr/core@0.2.0
  - @bfhr/api@0.2.0
  - @bfhr/cv-render@0.2.0
  - @bfhr/ui-tokens@0.2.0

## 0.1.1

### Patch Changes

- 59856f2: Jobs list: a salary like "€65,000–€78,000 a year · employer" now fits on one line in a 1280-pixel-wide window. The posting date and the saved mark sit beside the title only, so the salary line uses the row's full width.
- @bfhr/api@0.1.1
  - @bfhr/core@0.1.1
  - @bfhr/ui-tokens@0.1.1

## 0.1.0

### Minor Changes

- a952e6e: First release of BruteForceHR: the desktop app for macOS and Windows, with automatic updates signed by the BruteForceHR release key.

### Patch Changes

- @bfhr/api@0.1.0
  - @bfhr/core@0.1.0
  - @bfhr/ui-tokens@0.1.0
