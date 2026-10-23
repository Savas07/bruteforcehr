# ADR 0009 — One CV renderer: `@bfhr/cv-render` (HTML everywhere, WebKit/Chromium print, DOCX, JSON)

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** Savas (owner), integration owner (M2 decisions of 2026-10-23), lead engineer agent
- **Related:** [0002-data-model.md](0002-data-model.md), [0007-native-ios-tauri-desktop.md](0007-native-ios-tauri-desktop.md), [0010-ai.md](0010-ai.md), BRIEF §2.4, §4.5, §6.5, [design/research/cv-editor.md](../design/research/cv-editor.md), [design/decisions.md](../design/decisions.md) U6, critique [design/critiques/cv-templates/r1.md](../design/critiques/cv-templates/r1.md)

## Context

CV Studio shows a live preview on desktop (Tauri, WKWebView on macOS / WebView2 on Windows) and iOS (native SwiftUI), exports PDF/DOCX/JSON, and later attaches PDFs to emails from Cloud Functions (M4). BRIEF §6.5 asks for one rendering path, so that what the user previews is what an employer's ATS parses. M0 had two previews: a React block layout on desktop and a native SwiftUI `CVPage` on iOS. They already drifted (date formats, headings).

## Decision

### One renderer, one HTML

`packages/cv-render` (pure TypeScript, no DOM) turns JSON Resume + `meta` + template + theme + paper + locale into **one self-contained HTML document**:

```ts
renderCvHtml({ resume, meta, templateId, theme: { accent, fontPair, density }, paper, locale, photo? })
  => { html, title, lang, page: { paper, widthMm, heightMm, widthPt, heightPt, marginsMm }, placeholders, outline }
```

- **ATS-safe by construction:** one column of real text in DOM reading order; `h1` name, `h2` standard section headings, `h3` entries; no tables, columns, text boxes or text in images; links are real text. Ligatures and hyphenation are off (they corrupt PDF text layers). The ATS readback check (desktop Check tab) compares the PDF text with `outline` (headings and entry titles exactly as printed).
- **Self-contained:** fonts embedded as base64 WOFF2 (Latin + Latin Extended, so Turkish and German render without system fonts), a CSP meta forbids scripts and network requests, the photo is a `data:` URL. Output is deterministic: our own month tables instead of `Intl.DateTimeFormat`, so Chromium, WebKit, JavaScriptCore and Node produce byte-identical HTML.
- **Templates:** `classic`, `modern`, `compact`. **Themes:** accent from a curated list where every colour has ≥ 4.5:1 on white (others are darkened to AA); font pairs `inter-source-serif` (default), `inter`, `source-sans-serif` (Inter, Source Serif 4, Source Sans 3; SIL OFL 1.1, licences in `packages/cv-render/fonts/`); density `compact | comfortable | spacious` (sizes, spacing, page margins).
- **Language:** headings, dates, "Present" and labels come from the CV's own language (`en | tr | de`), not the UI language. Turkish upper-casing (i → İ, ı → I) and German ß → SS are done in the text, not CSS, so the PDF text layer, DOCX and the readback agree.
- **Paper and print:** `@page` size and margins per paper + density; the same margins are returned as `page.marginsMm` for native paginators. Headings and the first item of each section share an unbreakable box, entries with ≤ 4 bullets and skill/language lists stay together, `orphans`/`widows` 3.
- **Personal details (U6):** photo and date of birth print only when `meta.personal.showPhoto` / `showDateOfBirth` is on (new optional `meta.personal` in `@bfhr/core`; absent = off). The photo file lives at `users/{uid}/cv-photos/{fileId}` (owner-only, create-only, JPEG/PNG/HEIC ≤ 5 MiB in `storage.rules`); callers pass its bytes as `photo.dataUrl` (JPEG/PNG only).
- **AI placeholders (§2.4):** `[X%]`-style gaps are wrapped in a visible `mark` (also in print and DOCX highlight) and listed in `placeholders` so the apps can warn before export.
- **Click-to-locate:** every element carries `data-cv-path` (JSON pointer into the CV content, e.g. `/work/0/highlights/1`).

### Every surface shows and prints that HTML

| Surface         | Preview                                                                                                                               | PDF                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Desktop macOS   | HTML in the webview (iframe/shadow root)                                                                                              | WKWebView `NSPrintOperation` (paged, `@page` margins, NSPrintInfo margins 0), offline |
| Desktop Windows | same                                                                                                                                  | WebView2 `PrintToPdfAsync`, offline                                                   |
| iOS             | HTML in `WKWebView`, generated on-device by `dist/cv-render.iife.js` in **JavaScriptCore** (offline); replaces the M0 SwiftUI preview | `UIPrintPageRenderer` + `viewPrintFormatter` with printable rect = `page.marginsMm`   |
| Server (M4)     | —                                                                                                                                     | headless Chromium in a Cloud Function (email attachments, parity checks)              |

- **IIFE bundle** `pnpm --filter @bfhr/cv-render build` → `dist/cv-render.iife.js` sets `globalThis.BFHRCvRender` (all exports incl. `buildCvDocxBase64`). It needs no DOM, timers, `TextEncoder`, `atob`/`btoa` or `URL`: esbuild injects fallbacks for the two free identifiers docx/JSZip use (`TextEncoder`, `setTimeout` → microtask). The build also writes `cv-render.iife.inputs.xcfilelist` and `.inputs.sha256` so the Xcode build phase fails on a stale bundle.
- **DOCX** from the same document model with the `docx` package: Word Title/Heading 2/Heading 3 styles, real numbered-list bullets, a right tab stop for dates, paper size and margins as in HTML, no tables. Fonts are named (Cambria/Calibri, installed with Office), not embedded.
- **JSON export** = the JSON Resume document with our `meta` extension in JSON Resume's open `meta` object (lossless re-import).
- **File name:** `exportFileName()` → `First-Last-CV-<Company>.pdf` (`First-Last-CV.pdf` without a company), ASCII-folded (Turkish letters dropped to ASCII, German umlauts spelled out).

### Engine quirks the renderer absorbs (found in the critique)

- **WebKit print scale.** WebCore's `PrintContext` lays the page out at 1.25× the paper width in CSS px, so in WebKit prints 1 CSS px = 0.8 pt (Chromium: 0.75 pt) and CVs came out 6.7 % larger with different page breaks. The stylesheet applies `zoom: 0.9375` to `.cv` in print, inside `@supports (-webkit-nbsp-mode: space)` (WebKit only). Exporters must not scale on their own.
- **Turkish `locl` in CoreText.** With `lang="tr"`, CoreText swaps `i` for the font's `i.TRK` glyph, which Quartz writes without a ToUnicode entry ("Deniz" extracts as "Den$z"). `-webkit-locale: "en"` on `body` (CoreText ignores `font-feature-settings: "locl" 0`, which covers Chromium); `lang` stays the CV language for assistive technology.
- **`break-after: avoid`** is ignored by WebKit, hence the heading-plus-first-item keep box.

## Alternatives considered

- **Typst (or another typesetter) compiled to WASM.** Excellent pagination and PDF/A, but a second layout engine: the live preview (HTML in a webview) and the PDF would diverge again, it adds a multi-MB WASM to iOS and desktop, and Typst's PDF text layer for Turkish/German and its DOCX story would be separate work. Rejected for M2; revisit only if print quality needs features browsers lack (e.g. PDF/UA tagging beyond Chromium's).
- **Server-only Chromium for every PDF.** One engine and the simplest parity, but export would need a connection and a server round trip every time (research open question 5: offline), costs Cloud Run time per export, and the preview would still render HTML locally. Kept only for server-side needs (M4 email attachments, parity checks).
- **Native previews (SwiftUI on iOS, React layout on desktop) + server PDF.** The M0 state: three implementations of the same layout drifted within a milestone. Rejected (BRIEF §6.5).
- **Embedding a JS engine with DOM on iOS (e.g. a hidden WKWebView running the ESM).** Works, but the renderer would depend on a web view's lifecycle for a pure string transformation. JavaScriptCore runs the bundle synchronously and offline.

## Parity plan

1. **Same bytes:** `iife.test.ts` runs the IIFE in a bare `node:vm` context (only ECMAScript built-ins, like a `JSContext`) and asserts its HTML is byte-identical to the ESM build; it also builds DOCX there.
2. **ATS round trip (CI):** `ats.test.ts` prints 3 templates × A4/Letter × EN/DE/TR (plus an every-section CV with photo, date of birth and a placeholder) in headless Chromium, extracts text with pdf.js and requires every heading and entry of `outline` in order, the name, contact and dates, and the embedded font faces loaded (no fallback). CI installs Chromium for it.
3. **WebKit (macOS, during critique):** `pnpm --filter @bfhr/cv-render critique` additionally prints every case with WKWebView + `NSPrintOperation` (same `NSPrintInfo` as the desktop exporter) and checks readback, page count and broken glyphs. Result on 2026-10-23: 24/24 cases read back completely in both engines with the same page count; font sizes and positions within 0.5 pt.
4. **Apps:** DesktopCv's `cargo test --test print_pdf` (macOS) and WebView2 CI job, and IosCv's UIPrintPageRenderer test, run the readback against `outline` on their real exporters.
5. **Server (M4):** the Cloud Function renders the same HTML with Chromium; a scheduled parity job compares its text layer with the client's for a sample CV.

## Consequences

- The package is ~860 KiB minified as IIFE (fonts ≈ 420 KiB base64, docx + JSZip ≈ 400 KiB); each HTML embeds only its font pair (~200–300 KiB). Acceptable for a local webview and email-size PDFs (fonts are subset by the print engines).
- Templates are CSS + a small markup switch; adding one means a template id, its CSS block, snapshot updates and a critique round.
- Font updates go through `pnpm --filter @bfhr/cv-render fonts` (a test fails when `src/fonts.generated.ts` or the OFL texts are stale).
- `docx` is pinned to `~9.13.0`: 9.14.0 was inside pnpm's `minimumReleaseAge` on 2026-10-23.
- DOCX visual fidelity (fonts, right tabs) is verified structurally in tests and with macOS Quick Look only; a check in Microsoft Word is an owner task.
