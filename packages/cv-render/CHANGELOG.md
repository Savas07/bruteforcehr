# @bfhr/cv-render

## 0.4.0

### Patch Changes

- Updated dependencies [1f1c8d2]
- Updated dependencies [bcb03f2]
- Updated dependencies [0905d17]
- Updated dependencies [01435f6]
- Updated dependencies [1b35770]
- Updated dependencies [fc77c88]
- Updated dependencies [257f97a]
  - @bfhr/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [1c3a3aa]
- Updated dependencies [ffcd3ed]
- Updated dependencies [fad8a90]
  - @bfhr/core@0.3.0

## 0.2.2

### Patch Changes

- @bfhr/core@0.2.2

## 0.2.1

### Patch Changes

- 4e69e6c: Release fixes: the CV renderer reads its version from package.json (version bumps no longer break the build), the iOS release job builds the renderer bundle before archiving, and the secret scan allowlists the public Firebase web key.
- @bfhr/core@0.2.1

## 0.2.0

### Minor Changes

- 6eb122d: CV PDFs now look the same whether they are made on a Mac, on Windows or by the server: line spacing, page margins and page breaks match across print engines. The server can make a PDF of your CV too (used later for email attachments and the iPhone app).
- 54a2f4b: Three CV templates (Classic, Modern, Compact) that applicant tracking systems read correctly, with accent colours, font pairs, density and A4/Letter. Section headings and dates follow the CV's language (English, Turkish, German). Export to PDF, Word and JSON Resume, named `First-Last-CV-Company.pdf`. German and Turkish CVs can add a photo and date of birth; both are off unless you turn them on.

### Patch Changes

- Updated dependencies [f679cc3]
- Updated dependencies [6eb122d]
- Updated dependencies [54a2f4b]
  - @bfhr/core@0.2.0
