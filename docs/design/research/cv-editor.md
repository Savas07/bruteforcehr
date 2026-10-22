# CV editor, preview, templates: design research

Research date: 2026-10-22. Sources: Mobbin MCP `search_screens` and `search_flows` (`task_intent`: "Design a cross-platform job search, CV builder and application tracker app", `output_destination: "code"`). The user's saved Mobbin collections only hold website sections (see kickoff), so none apply to this area. Every reference below was judged from its screenshot(s), not its metadata. No images were downloaded or committed; open the `mobbin_url` to view.

Mobbin has no dedicated résumé-builder apps on either platform, so the patterns come from adjacent products: profile editors in job apps (LinkedIn, Glassdoor, Upwork, Mercor), structured-form-plus-live-preview editors (Mercury, Xero, QuickBooks invoices), document version history (Linear, Snowflake, Gamma), AI writing tools (WRITER, Langdock, Grab) and data-import reviews (Attio, Remote, Melio).

## Scope

Brief §5.3 row **CV editor, preview, templates**, plus the §4.5 CV Studio features the editor must host: revision history with diff/restore, variants (base + role/language), AI suggestions as accept/reject inline diffs, import review that highlights low-confidence fields, and the ATS keyword-coverage panel.

| Platform | Matrix entry / feature | Queries run (type, mode) | Examined | Kept |
|---|---|---|---|---|
| iOS | resume builder (section list) | screens: "resume builder screen" (deep); "resume editor screen with sections for experience, education and skills" (deep) | 16 | 4 |
| iOS | document editor (edit sheet) | screens: "edit item sheet with text fields and multiline description" (deep) | 7 | 4 |
| iOS | preview tab | screens: "document preview screen showing a full page with share and export actions" (deep); flow "Preview a resume" from the upload-flow query | 8 | 5 |
| iOS | template picker | screens: "template picker screen for choosing a document template" (deep) | 7 | 3 |
| iOS | revision history | screens: "version history screen with restore previous version" (deep) | 7 | 4 |
| iOS | variants (CV list, duplicate/rename/archive) | screens: "documents list screen with duplicate, rename and archive actions" (deep) | 7 | 3 |
| iOS | AI suggestions accept/reject | screens: "AI writing suggestion with accept and discard options" (deep) | 7 | 4 |
| iOS | import flow | flows: "uploading a resume" | 5 | 3 |
| iOS | import review (low confidence) | screens: "review extracted details screen after scanning a document" (deep) | 7 | 4 |
| iOS | keyword coverage | screens: "job match screen showing matched and missing skills" (deep) | 7 | 3 |
| Desktop (`web`) | document editor with live preview | screens: "resume editor with form fields next to a live document preview" (deep) | 8 | 5 |
| Desktop (`web`) | résumé editing flows | flows: "building a resume" | 4 | 3 |
| Desktop (`web`) | template gallery | screens: "template gallery for choosing a document template" (deep) | 8 | 4 |
| Desktop (`web`) | revision history with diff/restore | screens: "version history panel comparing changes with restore button" (deep) | 8 | 5 |
| Desktop (`web`) | AI inline diff accept/reject | screens: "document editor showing AI suggested edit as inline diff with accept and reject buttons" (deep) | 8 | 4 |
| Desktop (`web`) | import review (low confidence) | screens: "review imported data screen highlighting fields that need attention before confirming" (deep) | 8 | 4 |
| Desktop (`web`) | ATS keyword-coverage panel | screens: "content optimization panel showing keyword coverage score next to an editor" (deep); flow "Adding experiences" (Codecademy) from the flows query | 9 | 5 |
| Desktop (`web`) | variants (document menu, grouped list) | screens: "documents list with nested versions and duplicate, rename, archive menu" (deep) | 8 | 4 |
| Desktop (`web`) | language variants | screens: "translation editor screen showing source text next to translated language version" (deep) | 7 | 4 |
| **Total** | | | **146** | **75** |

Product requirements (§4.5): JSON Resume + `meta` (template, theme, custom sections), immutable revisions (`users/{uid}/cvs/{cvId}/revisions/{revId}`, create-only), optimistic concurrency via `version`. Desktop = structured editor next to live preview; iOS = section list → edit sheets + preview tab. Reorder sections and items, rich bullets, spell-check. AI assists (rewrite, shorten, stronger verb, translate) are suggestions the user accepts or rejects. Variants, revision history with diff and restore, duplicate, archive. ≥ 3 ATS-safe templates; theme: accent colour, font pair, density, A4/Letter. Export PDF/DOCX/JSON, default name `First-Last-CV-<Company>.pdf`. ATS check: PDF text round-trip + keyword coverage against a chosen job. UX principles: calm, trust (source + reason + Undo), speed (optimistic, keyboard-first desktop), progressive disclosure.

## References

### iOS: resume builder (section list)

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Mozi | Edit Profile | https://mobbin.com/screens/9db5d363-1ca9-423c-aed3-25e4446ffdc0 | Inset-grouped cards, one per field group; each row shows a small label ("Work"), the current value as a one-line summary ("UX Designer at Mobbin") and a chevron. Group headers ("About", "Contact"). | This is the exact "section list" shape: the user sees what each section contains without opening it, and the summary line doubles as a completeness check. |
| Glassdoor | Resume & Experience | https://mobbin.com/screens/288d0576-b987-4cb3-86d3-6cdffb5cba4e | Section header with a compact trailing "Add" button; items as bordered rows with a trailing delete icon; an empty section shows one full-width "Add a certificate or license" button instead of an empty box. | Domain match. The empty-section button is a calm empty state that tells the user what belongs there. |
| Upwork | Create Your Profile, experience cards | https://mobbin.com/screens/32222ccd-fd0d-4823-9f1c-ea7f39e40a0d | Experience items as cards (title, company · dates, location, 2-line bullet preview) with edit/delete affordances and an outlined "+ Add experience" button under the list. | Item cards inside a section give enough context to reorder and pick the right item to edit. |
| LinkedIn | Add experience, skills sub-list | https://mobbin.com/screens/14b62410-3738-4d79-bfe5-5afe517f4704 | Drag handles (≡) on the trailing edge for reordering, ✕ on the leading edge to remove; a dismissible "Suggested based on your title" chip box; sticky full-width Save. | Shows reordering and suggestions in the same list without a separate edit mode screen. The dismissible suggestion box suits keyword suggestions from the ATS check. |

### iOS: document editor (edit sheet)

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Fi | Edit Details sheet | https://mobbin.com/screens/f7aa9851-a281-471d-a4c3-aa3ebf1b5148 | Page sheet with grabber, "Cancel" / title / "Save" nav bar, floating-label fields (Title, Date, Cost). | Standard iOS edit-sheet anatomy; floating labels keep the field name visible after it's filled (important for long DE labels). |
| Mindtrip | Edit sheet | https://mobbin.com/screens/7a115fcf-daab-4743-99e7-ba99e007d673 | Labelled fields with date pickers for Start/End, a computed duration hint ("3h 30m"), a "› More" disclosure for optional fields, and a full-width Save at the bottom. | Progressive disclosure: an experience item shows Role, Company, Dates, Bullets by default; Location, Employment type, URL go behind "More". The duration hint maps to "2 yrs 3 mos". |
| Linear Mobile | New issue with formatting toolbar | https://mobbin.com/screens/36fa11ff-7dab-433e-ab6c-e2d78fff525a | Keyboard accessory bar with formatting buttons (bullets, checklist, quote) and a row of property chips above it. | Rich bullets on iOS need a keyboard accessory, not a floating toolbar. We place bullet, indent, AI assist and undo there. |
| Luma | Location Instructions full-height text sheet | https://mobbin.com/screens/adc89d9f-a056-4064-860b-9c5df10ee581 | Full-height text sheet with ✕ / ✓ and a helpful placeholder that explains what to write. | The Summary section needs a distraction-free long-text sheet; placeholder guidance ("2–3 sentences about what you do and what you're looking for") replaces a tip screen. |

### iOS: preview tab

| App | Screen / flow | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Glassdoor | Preview a resume (flow) | https://mobbin.com/flows/52a46e0f-c3a3-4451-92ae-8dfc36a9d3e4 | Rendered résumé pages with ‹ › paging, a "1 / 4" page indicator and a single "Resume options" button below. | Domain match; shows that a real page render (not a reflowed mobile view) is legible on a phone and that one options button is enough. |
| Satispay | Export preview | https://mobbin.com/screens/0f78d64c-f57e-4c3e-839c-6b022bff3440 | Page counter pill overlaid on the page ("1 of 2"), stacked Share (primary) / Download / Print buttons. | Page count matters for CVs (1–2 pages); the overlaid pill shows it without extra chrome. |
| Docusign | Preview sheet | https://mobbin.com/screens/ae192772-0789-4504-a996-b239ca5543e7 | Vertically scrolling page stack with visible page edges, one primary "Share" button pinned at the bottom. | Scrolling pages is faster than paging for a 2-page CV; one primary action keeps the screen calm. |
| Craft | PDF export sheet | https://mobbin.com/screens/b6107c11-c7f8-4135-bd01-0ca16fd08cea | Page thumbnail, Cancel, share icon in the nav bar, and a secondary "Export Options…" button. | Separates "share the PDF now" from format/paper options (PDF/DOCX/JSON, A4/Letter, file name). |
| Withings Health Mate | Review your Report + share sheet | https://mobbin.com/screens/76d50e09-c1d6-4ed7-b3fb-a63068af7de6 | "Here's what you will be sharing. Tap to zoom in." above the rendered document, then the system share sheet with file name and size. | Trust: the user sees exactly what will be sent and the file name (`First-Last-CV-<Company>.pdf`) before sharing. |

### iOS: template picker

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Universe | Templates sheet | https://mobbin.com/screens/bc2cf77a-2df1-4571-9929-7de507988fd0 | Sheet with a 3-column grid of document-shaped thumbnails and a short label under each; "Blank" sits in the same grid. | Document-proportioned thumbnails show layout structure at a glance; that is what differs between our ATS-safe templates. |
| Givingli | Choose a template sheet | https://mobbin.com/screens/74bd4a90-2d89-4726-9bd1-be6713775417 | 2-column grid of large portrait cards inside a sheet, "Blank page" as the first card, "See all templates" link at the bottom. | With only 3–5 templates, 2 large columns let the user actually read the thumbnail. |
| Craft | Templates sheet with search and groups | https://mobbin.com/screens/5a9452fd-7a09-49d1-9a2a-a4614d0a7bdb | Search field and grouped sections with headers inside a sheet, portrait previews rendered with real content. | Grouping scales later (e.g. "Single column", "Compact"); real-content thumbnails beat wireframes. |

### iOS: revision history

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Canva | Version history | https://mobbin.com/screens/cedddc9d-109c-45cf-9e9e-f7905a0653f0 | List grouped by "Today" / "This week"; "Current version" on top with author and relative time; older rows labelled "Autosaved" with a time. | Time grouping keeps a long revision list scannable. We replace "Autosaved" with a change summary. |
| Mimo | Build / Preview + History tab | https://mobbin.com/screens/cbc37c50-daee-45b7-b2b9-f37fd14cb759 | "Current version" vs "Past versions" timeline, each entry a sentence describing the change, a restore icon on past entries. Also the **Build / Preview** segmented control at the top. | Change sentences ("Edited Experience · Acme") are more useful than timestamps. The segmented control is the model for our Edit / Preview switch. |
| Wabi | Versions as change chips | https://mobbin.com/screens/f9776c91-0b37-4d38-af76-a74b90fddbef | Each change is a row with an icon, a one-line description and a version chip (V2, V3…) with a revert glyph; "Reverting back to version 2" itself appears as a new version (V5). | This matches immutable revisions: a restore appends a new revision instead of deleting history. |
| Notion | Restore confirmation | https://mobbin.com/screens/b81ab79d-db24-4e78-b2f6-bcec25dd299e | The nav bar shows the viewed version's timestamp with "Restore" and "Done"; a confirmation dialog explains the consequence before Restore. | The timestamp in the title tells the user they're looking at the past, not the current CV. |

### iOS: variants (CV list, duplicate/rename/archive)

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Fi | Documents tab with context menu | https://mobbin.com/screens/34ca59e7-1402-4fca-99ee-46660eeabaa3 | Documents list grouped by year with an "+ Add" button in the section header; long-press context menu (Send / Edit / Delete). | Native context menu on a CV row gives Duplicate / New variant / Archive without a separate screen. |
| Dropbox | File action sheet | https://mobbin.com/screens/987ccb68-acdf-4e19-aa13-21526cab712f | Sheet headed by the file (thumbnail, name, size, modified) followed by Rename, Move, Duplicate, Delete, File activity, and a "Make available offline" toggle. | The header confirms which CV the actions apply to. "File activity" maps to Version history; offline toggle is relevant because CVs must open offline. |
| Superpower | Health Records list | https://mobbin.com/screens/91391542-d933-4f9d-a6aa-a27c4a6e47ce | Search field, an "All Files ⌄" filter, and rows with a file icon, name, date and trailing "…". | A filter menu ("All", "Base CVs", "Archived") keeps archived CVs out of the way without a separate screen. |

### iOS: AI suggestions accept/reject

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Grab | Rewrite this for me | https://mobbin.com/screens/a5456765-a7ec-4ec5-be32-895793924700 | Sheet that quotes the original text, lists alternatives as selectable rows, offers mode chips (Proofread, Shorten…) and Cancel / Apply (disabled until a choice is made). | Maps to our four assists (Rewrite, Shorten, Stronger verb, Translate). Quoting the original keeps the "before" visible. |
| GoFundMe | Our suggestions | https://mobbin.com/screens/ee4b5ef1-a4b8-4497-a9d2-5985d893abe1 | "We read your story and made some changes for you to review." Change-type tags (Spelling and grammar, Tone, Word choice), an Enhanced / Spell check only switch, Cancel / "Use this story". | Explains *what kind* of changes were made (reason), and lets the user choose a lighter edit: supportive, not overriding. |
| Structured | AI-created item with Add / Edit / Discard | https://mobbin.com/screens/2e36f6e3-a873-400a-a2ee-2a32c508290a | Per-item Add / Edit / Discard, an "Accept All" button, and a disclaimer "The AI may make mistakes… Be sure to check important tasks." | Per-bullet decisions plus a bulk accept for a whole section; "Edit" (accept then tweak) is a third option beyond accept/reject. |
| Spark Mail | +AI inserted toast with Undo | https://mobbin.com/screens/776c7236-d0fb-456c-9bea-b089ca3bdb5c | Bottom toast "Spark inserted the template with some text alterations by +AI. Use the original template without +AI." with Undo. | After accepting, the user keeps a one-tap way back (trust principle: source + Undo). |

### iOS: import flow

| App | Flow | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Upwork | Adding resume | https://mobbin.com/flows/86e15c52-ba75-4cb6-abe4-578eeb8705f9 | Two equal choices "Upload your resume" / "Fill out manually (15 min)", a reassurance line ("you can edit it before your profile goes live"), then an upload sheet stating accepted formats and size limit with a progress bar. | Time estimate + "you can edit it" lowers the stakes of importing. Formats/size up front prevents failed uploads. |
| Glassdoor | Uploading a resume | https://mobbin.com/flows/27d0b6bf-d593-4846-87e7-65248a8e3fef | After upload, a full rendered preview of the file with "Looks good" (primary), "Remove resume" and "Upload another file instead". | Lets the user confirm the right file was picked before parsing results are shown. |
| LinkedIn | Uploading a resume | https://mobbin.com/flows/aa4d1ee0-9122-44ed-8b70-018bc13fe6ea | "Upload resume" button with "DOC, DOCX, PDF (5MB)" under it, the uploaded file as a row with "Uploaded on …" and a "…" menu, and a plain-language data-use notice. | The "original file stays attached" requirement needs exactly this row; the data-use note supports trust (our file goes to Firebase Storage + Claude for parsing). |

### iOS: import review (low-confidence fields)

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| GoPay | Split bill details after scan | https://mobbin.com/screens/465e2773-660b-4a11-b7af-fb9747fef87e | Scan thumbnail with "Rescan", extracted rows, and one row tinted amber with an info icon and "Make sure this amount is correct"; Confirm at the bottom. | The best match for "highlight low-confidence fields": only the uncertain field is tinted, with a gentle instruction instead of an error. |
| Lloyds Mobile Banking | Have we read your ID correctly? | https://mobbin.com/screens/f7a27995-e8c7-4923-b1e6-9d53cd1e3559 | Question as the title, extracted fields in a grouped card, "Yes, this is right" / "No, try again". | The question framing puts the user in charge of the result and is calm in tone. |
| Splitwise | Confirm items | https://mobbin.com/screens/ba220c78-9ede-4bd0-ba41-16c6476716fa | "Add, delete, or modify" instruction, source image thumbnail next to totals, editable rows, "+ Add item", Next. | Shows that extracted items (jobs, schools) can be edited, removed or added on the review screen itself. |
| eBay | We found your card | https://mobbin.com/screens/2437b966-bc35-4f82-b5d0-3ea451897036 | "Your scan" next to the matched result, both expandable; "Match to a different card" as the fallback. | Side-by-side source vs parsed result; on iOS we show the original page on tap to compare a flagged field. |

### iOS: keyword coverage

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Glassdoor | Is your resume a good match? | https://mobbin.com/screens/4dfaf62a-6270-4008-8db6-87d2a1c996a8 | "Your qualifications for this job" list where the user confirms each with ✓ / ✕, plus "Show more". | Keyword extraction is imperfect; letting the user mark "I have this" turns a verdict into a conversation. |
| LinkedIn | Job match details (Premium AI) | https://mobbin.com/screens/a5106481-73be-431c-b34e-35f223acc577 | Count framing "Matches 0 of the 13 required qualifications", each missing item with a reason in parentheses ("No mention of SOPs"), beta disclaimer at the top. | Count + reason per item is the right content. We keep the structure but drop the "Job match is low" verdict (see rejected list). |
| Upwork | Suggested skills chips | https://mobbin.com/screens/439b682c-8a22-4c12-9e5c-208a0097a3de | "+ Skill" chips the user taps to add, with copy "Add or remove the ones we've suggested… It's up to you." | Missing keywords become one-tap "+ Add to Skills" chips; the user decides. |

### Desktop (`web`): document editor with live preview

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Mercury | Invoice details with live preview | https://mobbin.com/screens/32882676-91fa-4afb-88e6-7306bfff6dbf | Form column on the left (sections, "+ Add Line Item"), rendered page on the right updating as you type, tabs above the preview (Invoice / Payment link). | The cleanest form-next-to-page split; the page sits on a tinted canvas so it reads as "the output". |
| Xero | New branding theme | https://mobbin.com/screens/2e574693-39f7-49a0-aa6e-f6cf8e1d5b71 | Accordion sections in the left panel ("Your business details", "Brand and styling"), brand colour + font selects, preview with zoom (− 100% +) and desktop/mobile toggle, "Save theme". | Accordion sections keep a long CV form navigable; zoom control is needed for A4 vs Letter checks. Theme controls (accent, font) live in the same panel. |
| QuickBooks | Customize form style | https://mobbin.com/screens/44e8ebbe-ed26-4a82-9c0d-980fbeb7e5fd | Design / Content / Emails tabs above the form, per-field checkboxes to show/hide lines on the document, "Preview PDF" + "Done" in the footer. | Design vs Content tabs separate theme from data. Show/hide toggles map to optional fields per variant (e.g. hide photo/date of birth for UK/US, show for DE if the user wants). |
| Teachable | Certificate editor | https://mobbin.com/screens/f26835b4-1101-493a-acb5-97e0a862012a | Content / Design tabs in a narrow left panel, "• Saved" autosave indicator in the top bar, Preview and Finish buttons. | Autosave indicator replaces a Save button (optimistic UI); the indicator is where we surface sync/conflict state. |
| Polywork | Edit Position with live page | https://mobbin.com/screens/c823f212-83de-461d-9fce-883ac8ac2384 | Editing one item (position) in the left panel with "Done" while the page on the right shows it in context; Delete as a quiet text button. | Item-level editing with the whole document still visible is the desktop counterpart of the iOS edit sheet. |

### Desktop (`web`): résumé editing flows

| App | Flow | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Behance | Creating a resume | https://mobbin.com/flows/afc83e99-6ba3-43f4-aa84-1f4afc1e4b3b | Left section nav (Basic Information, About Me, Work Experience, Links, "+ Add a custom section"), stacked section cards, a "Your changes have been saved" bar, and a rendered résumé view with "Print Resume". | Section nav + "Add a custom section" maps to JSON Resume `meta` custom sections. |
| Mercor | Updating a resume | https://mobbin.com/flows/636e78b0-8b2d-46d0-a2ed-3b5d43b6e406 | Each experience as an inline form block headed "Role at Company" with "✕ Remove"; skills and languages as removable chips with a search-to-add field; toast "… updated successfully". | Inline item forms with a readable header keep many items editable without modals. |
| Uxcel | Adding work experiences | https://mobbin.com/flows/ece769b8-0113-4ecf-95b0-5d72cfc1c155 | Empty sections with a guidance line and "Add" link; "Add Work Experience" dialog with required markers, month/year selects and "I'm currently working here"; toast "Work experience has been added." | Month/year selects and "currently working here" are the right date inputs for CVs; the guidance line is a calm empty state. |

### Desktop (`web`): template gallery

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Kit | Choose your template | https://mobbin.com/screens/bd6154e0-0a57-4b93-a4e9-0e66c3c4a171 | Large preview cards with two explicit buttons, "Preview" and "Choose"; category filter on the left. | Explicit buttons (not hover-only) are keyboard- and touch-friendly and make "look first" a first-class action. |
| PandaDoc | Template gallery modal | https://mobbin.com/screens/24cf9d2e-ec3d-440b-9131-b5ea95b31f15 | Modal over the document list with search + category list on the left; hovering a card reveals "Use template" and "Preview". | A modal keeps the user's context (they came from the CV) and closes back into it. |
| HubSpot | Select a template | https://mobbin.com/screens/21a81e53-91f6-481c-bcc6-44448b9843ef | "Start from blank" as the first card in the same grid as templates, with a "Choose template" overlay on focus. | Blank start and templates are one decision, not two screens. |
| Contractbook | Create a draft | https://mobbin.com/screens/ff6ceb9c-9514-43ad-81dc-e4b45f69aa0c | "Language: English ⌄" selector above the category list; applied-filter chip; preview eye icon per card; "Go to documents" escape. | Template language matters for us (section headings in EN/TR/DE). The selector belongs in the gallery. |

### Desktop (`web`): revision history with diff/restore

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Linear | Version history modal | https://mobbin.com/screens/6c14e085-9ff5-4e61-9a21-b04f1b0a3433 | The document rendered with additions highlighted and deletions struck through; a "Highlight changes" toggle with "1 of 3" ↑/↓ change navigation; timeline on the right grouped "Today" / "1 week ago" with a "Latest" tag; Close / "Restore version". | The closest match to diff + restore in a prose document, and fully keyboard navigable. |
| Snowflake | Version history compare | https://mobbin.com/screens/f2d4c240-0102-46d8-bc60-342bea100097 | "Compare with current version" checkbox switching to side-by-side; restore confirmation naming the exact timestamp and author ("This will restore the past version July 26, 2026 at 9:16:34 PM…"). | Side-by-side is useful when a bullet was rewritten heavily; naming the timestamp prevents restoring the wrong version. |
| Zoom | Field-level version history | https://mobbin.com/screens/681304f3-411a-41b5-a477-e523e844709c | Table of changes per author/time with Field · Before → After columns. | Our CV is structured data; a field-level "Before → After" view (e.g. "Experience › Acme › End date: — → 2026-09") is clearer than a prose diff for dates, titles, links. |
| Gamma | Snapshots | https://mobbin.com/screens/ce22f342-a787-4724-ab0a-63cc5b446426 | Header "8 snapshots over the last 18 minutes"; left list with "Latest"; large preview of the selected snapshot; Cancel / "Restore" split button. | The rendered preview answers "what did my CV look like then?" (template/theme changes are visual, not textual). |
| Lovable | Revert to this version | https://mobbin.com/screens/94b4bb69-45ad-4ca0-934b-a03e1e33a880 | "Back to latest" + "Viewing: …" banner while previewing an old version; confirmation copy "Recent changes after this point stay in the chat and can be reapplied anytime." | Reassuring restore copy: nothing is lost. Exactly what immutable revisions guarantee. |

### Desktop (`web`): AI inline diff accept/reject

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Langdock | Canvas with inline suggestion | https://mobbin.com/screens/879416cc-ee0b-42c9-999b-3f829c041b12 | Old sentence in red, new sentence in green directly in the document, with small ✓ / ✕ buttons at the end of the change. | Literal "inline diff with accept/reject" in place; the change is decided where it is read. |
| WRITER | Rewrite popover + suggestions rail | https://mobbin.com/screens/86221de5-38b0-48df-965e-9adbd7b302ac | Popover under the selected text with a mode dropdown ("Simplify"), alternatives with word-level changes highlighted, ✓ to apply, "Show more"; right rail lists suggestions grouped by category with counts and each card shows strike-through → replacement. | Mode dropdown = our Rewrite / Shorten / Stronger verb / Translate. The grouped rail gives a section-wide queue to work through with the keyboard. |
| Contractbook | Tracked suggestion + comments panel | https://mobbin.com/screens/968997b3-cd88-45df-ba9d-a67c15c5c18e | Strike-through original + coloured replacement inline, a marker in the margin, and a side panel entry "Replace: 'both Parties' with: 'by both of the Parties involved'". | The side-panel sentence form ("Replace X with Y") is an accessible text alternative to colour-only diff. |
| GitBook | Changes view + version history | https://mobbin.com/screens/d8307789-31af-4bdd-b7cf-dab69a87dd95 | Editor / Changes / Preview modes; "Show only changed pages" toggle; changed blocks marked with a coloured bar in the gutter. | Gutter bars show where pending suggestions are in a long CV without colouring every line. |

### Desktop (`web`): import review (low-confidence fields)

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Attio | Import: Review values | https://mobbin.com/screens/60a1cfe5-3788-49e3-b3ae-3da62a33f7ee | Stepper (Upload file → Map columns → Review values → Preview import); left list of columns with an orange dot on the ones that need review; "Needs review 3" group; Raw data → Mapped value rows with inline edit and a revert icon. | Raw text → parsed field is exactly what the user needs to judge a low-confidence parse; the dot tells them where to look. |
| Remote | Review your team's time off data | https://mobbin.com/screens/d04c9f64-c644-4b9c-8e43-93de5b2fdbc0 | Stepper chips; summary card "1 record can't be added… You can fix them or proceed"; toggles "Show only rows with errors"; cell tooltip with the reason; "Save as draft" / "Continue with 1 record". | Filter-to-flagged plus "save as draft" lets the user finish later. |
| Melio | Review vendor details | https://mobbin.com/screens/997a8e01-8187-42f8-9c77-cc7fc6fb5303 | Info banner "2 of 10 vendors are ready… You can import them now or resolve errors"; inline red helper under the bad value; "Re-upload file" next to the primary action. | Proceed-or-fix framing; the user is never blocked by a parser's doubt. |
| 7shifts | Import preview | https://mobbin.com/screens/6b45f042-7f89-46f1-b46f-8270604842b8 | Amber banner with explanation and "Re-upload your file"; only the problem cell tinted, "hover or click the red cells to view the recommended quick fix". | Cell-level highlight with a suggested fix on focus = our "low confidence: did you mean …?". |

### Desktop (`web`): ATS keyword-coverage panel

| App | Screen / flow | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Semrush | Content Optimizer panel | https://mobbin.com/screens/47b3a583-3685-4dfd-8fb7-604128bde422 | Collapsible right panel beside the editor; target keywords highlighted in the text; "Improvements (by importance)" list with counts per group; "Edit target" link; "Did you find these improvements helpful?" feedback. | The panel-beside-editor layout and in-text highlighting are exactly the ATS panel. "Edit target" = change the selected job. |
| Base44 | SEO score with findings | https://mobbin.com/screens/09670809-c6b5-4e8c-9a6c-eefafcb9615b | Filter chips "All 38 · Urgent 1 · Recommended 9 · Done 25", expandable findings with an explanation and a direct fix action, "Scan again". | Filter chips with counts (we use All / Missing / Covered) and fix actions next to each finding. |
| Squarespace | SEO / AIO summary cards | https://mobbin.com/screens/7b8f21c8-f6cf-4ae0-afa0-b6522853139b | Fraction cards "Pages with metadata 2 / 10 · 8 missing" with an arrow to the detail. | Fractions ("12 of 18 keywords", "6 of 6 sections read back") are factual, unlike a grade. |
| Manus | SEO analysis checklist | https://mobbin.com/screens/a403e910-40a2-43c4-a408-4e7459cae958 | Per-criterion rows with a status icon (✓ / ⚠ / !) and a one-line explanation ("The H1 heading length looks good."). | Template for the ATS round-trip result: one row per check with a plain explanation. |
| Codecademy | Job-readiness checker (flow) | https://mobbin.com/flows/7608045e-0962-49cb-9fa4-b4d04c1ba589 | Paste a job posting URL → "Get report"; saved reports tab; a Tips column ("Use resume keywords to explain how you contributed to projects"). | Choosing the job: pick a saved job or paste a URL/description. Tips framed as how-to, not as failure. |

### Desktop (`web`): variants (document menu, grouped list)

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Linear | Document overflow menu | https://mobbin.com/screens/ea0c3b2c-ecb7-4f3a-8c91-4b96acbec446 | Menu with shortcuts: Move to, Duplicate, Rename… (⇧R), "New template from document", Copy, Version history, Delete. | Keyboard shortcuts shown in the menu; Duplicate and Version history in one place. |
| Skiff | Document menu | https://mobbin.com/screens/8092463f-b8bb-4bfd-88d4-da69ad036e8c | View history, Use template, Duplicate, Export ▸ submenu, Trash (red, last). | Export as a submenu (PDF / DOCX / JSON) keeps the main menu short. |
| Origin | Grouped documents list | https://mobbin.com/screens/d52a81bd-1009-4ca3-852b-175a33d8c772 | Documents grouped under labelled headers ("Estate plan documents", "Supporting documents"), status pill per row, row menu, "Download all". | Base CV as the group header with its variants beneath; a pill shows variant kind/language. |
| HoneyBook | Files table | https://mobbin.com/screens/0d83e6c4-96d0-4925-802b-bcb2062ae273 | Filter selects (All Files / Draft / This month), columns File name · Last edited (sortable) · Status · Project · Actions. | Desktop CV list needs Last edited and "Used in N applications" columns; filters for archived. |

### Desktop (`web`): language variants

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Etsy | Languages and translations | https://mobbin.com/screens/3a3422a5-b3ce-4ace-8cc3-f8dc4ef57336 | Per section, the original text on the left and a "Write in German…" field on the right; "Edit original (English)" link per section; Discard / Save changes. | Field-by-field source vs translation is exactly a language variant of a structured CV. |
| Arcade | Translations AI | https://mobbin.com/screens/35876cc2-3566-486f-b26a-98877bfc3d19 | Default-language column next to a target-language column ("JA Japanese") with a "✦ Translate" button and "Add language"; toast "Japanese translations generated successfully." | AI translate is one action per language; the result is still editable field by field. |
| Ditto | Base text + variants | https://mobbin.com/screens/ab6b67e5-5ff0-42ae-875b-a5da506f5c1f | "Base text" with "Add variant", a language variant card ("Japanese · ja") with Translate and a status ("In Review"). | Base + variant with an explicit status is our variant model; status can show "Base changed since translation". |
| Framer | Localization table | https://mobbin.com/screens/cab90995-61cb-40c7-be45-0a5ba01dee45 | Source and target columns side by side, grouped by page/section, a status badge per row ("NEW"), filter "All ⌄". | Per-row status badges flag strings that changed in the base after the variant was made. |

## Examined but rejected

| App | `mobbin_url` | Reason |
|---|---|---|
| Handshake (Add resume) | https://mobbin.com/screens/707c7dc4-7ee7-4a10-802e-ec73a05eb93c | Title + file picker only; stores a file, no structured editing. |
| Plum (Employment details) | https://mobbin.com/screens/f18045c9-218f-41aa-a6f8-c27f8e95d5d8 | Onboarding form with icon per field; not a section list. |
| Upwork (Specialized profile step 3/5) | https://mobbin.com/screens/858fb349-d4bd-4859-9e5a-e694b5609744 | One-question-per-screen wizard; too slow for editing an existing CV. |
| Neo Financial (job title step) | https://mobbin.com/screens/eada250b-46dd-4b18-b5a9-e042ef9a192c | Onboarding question, not an editor. |
| Artsy (Add your profession) | https://mobbin.com/screens/cd4ca019-a60f-44f4-8bdc-ca9944d58e99 | Wizard step; no section structure. |
| Hinge (Where do you work?) | https://mobbin.com/screens/b49a3978-73f8-4b02-915d-96e8fdf1516c | Dating-profile wizard, playful tone. |
| Superpower (What do you do for work?) | https://mobbin.com/screens/ba73eeb3-4bb4-482a-80dc-a8bc2f1c9292 | Web-view questionnaire step. |
| Gusto Mobile (Job and Pay) | https://mobbin.com/screens/91a05a82-6071-4fae-835e-fe5052b7eaa6 | Read-only HR record; no editing or reordering. |
| Yubo (Your profile) | https://mobbin.com/screens/88d707a7-9674-4286-84c9-e13badd9279e | Loud tag colours and emoji; tone doesn't fit a CV. |
| BFF (Basic info) | https://mobbin.com/screens/e3134e4b-15f4-4890-bf07-28920feed212 | "Add +" pill per field wastes rows; social-profile fields. |
| Asana (Edit profile) | https://mobbin.com/screens/80b7ebf0-2ada-4e65-97af-f8c6d688af23 | Flat field list without sections or item lists. |
| Eight Sleep (Autopilot profile) | https://mobbin.com/screens/84083135-86bc-4657-80eb-e3867e6753bf | Settings-style label/value rows; same idea as Mozi, less suited to multi-line summaries. |
| Shopify (Description sheet) | https://mobbin.com/screens/762e9378-9959-4f4b-828f-1786036face1 | Empty text sheet with no guidance or formatting; Luma covers it better. |
| Hypelist (item sheet) | https://mobbin.com/screens/d4bd402f-ad6d-4d40-bb46-143b505c75b4 | Free-form note with chip row; no labelled fields. |
| Mesh (note sheet) | https://mobbin.com/screens/139825d0-071e-443d-9eb0-9848946ca37d | Quick-capture note; no structure. |
| Freeform (PDF preview) | https://mobbin.com/screens/7f043849-bae9-4eba-aa12-a476604485de | Menu covers the page; floating controls obscure content. |
| Linktree (PDF card) | https://mobbin.com/screens/1556454c-72a0-4899-b19f-be47547b3bf5 | Tiny page thumbnail inside a card; unreadable. |
| Apple Wallet (statement) | https://mobbin.com/screens/1f5c6d07-9672-4606-bd4e-e9f55350ff62 | Same page-counter idea as Satispay but floating toolbar overlaps the page content. |
| Canva (Templates sheet, iOS) | https://mobbin.com/screens/219f8efe-69a9-4c78-b308-149e6e5ae0b2 | Image-heavy marketing templates and a prompt bar; we have 3–5 text templates. |
| Unfold (Templates) | https://mobbin.com/screens/784e63e6-2ad8-40a7-ba55-c26648be26b6 | Social-story visuals, horizontal carousels; not document templates. |
| Canopi (Template picker) | https://mobbin.com/screens/b7a0c8b1-739c-42db-90e5-b5d3ee81302a | Tilted stacked cards; decorative, hard to compare. |
| GitHub (Choose Template) | https://mobbin.com/screens/8317356d-1429-4d39-aece-56a45ec7d023 | Text-only list; no preview. |
| Squarespace (Deleted pages) | https://mobbin.com/screens/6d2f83d1-3ad8-41d5-aaaa-e79478063ed2 | Trash restore, not version history; harsh uppercase confirm dialog. |
| Speechify (Deleted) | https://mobbin.com/screens/0f02f37f-2ade-46ba-a6a2-6d5922d53d4b | Trash list; no versions. |
| Journal (Recently deleted) | https://mobbin.com/screens/fdba7994-abac-4388-8b66-5e3348906adb | Countdown "28 Days Remaining" adds pressure; trash, not history. |
| Docusign (Add Documents action sheet) | https://mobbin.com/screens/aa423ae6-3f7e-48ed-aad4-e23dbfb4ab20 | Only Rename/Delete; no duplicate or context. |
| Speechify (multi-select) | https://mobbin.com/screens/669226fb-c40a-49ef-81c7-c966c7a254f6 | Bulk-select trash; "Delete Forever" in red as primary is too destructive for CVs. |
| Fabric (Timeline) | https://mobbin.com/screens/323f6ed1-9e2b-4b33-b39d-b95ab098fd48 | Mixed media grid; bottom action bar cramped. |
| Riveo (video actions) | https://mobbin.com/screens/1e8944fa-0473-4569-b5f5-91cdd0920f33 | Legacy action sheet over loud thumbnails; Dropbox's header sheet is clearer. |
| Opera (Ask AI) | https://mobbin.com/screens/a02a45bc-50ae-4100-8b7a-76afcac4a240 | Chat result modal; no original vs suggestion. |
| CapCut (Scripts for you) | https://mobbin.com/screens/faaaa08e-c857-41d4-806a-293f4c296e6b | Generates new text from scratch; nothing to compare against. |
| Instagram (Write with Meta AI) | https://mobbin.com/screens/fdcddfb0-a056-4a3a-9b64-050526878ddf | Alternatives without the original visible; emoji-heavy. |
| Dropbox (scan pages) | https://mobbin.com/screens/564d678a-2987-4512-9277-24da01770e96 | Capture step, no extracted data. |
| Freeform (scan page) | https://mobbin.com/screens/c4d02877-3a9b-49c2-ae23-364b7ef3b2cb | Image adjustment, no extraction review. |
| Quizlet (Here's what we scanned) | https://mobbin.com/screens/2c66cb2e-4d24-4048-a31f-e096aebc990a | Single text blob; no per-field confidence. |
| Handshake (Adding a resume flow) | https://mobbin.com/flows/e7bda3b8-0bda-45bb-9942-24cf88e808f9 | File attachment only; no parsing or review. |
| LinkedIn (Resumes and application data flow) | https://mobbin.com/flows/1c93a3b3-9b63-491f-afad-408edba063f1 | Settings navigation to the same screen as the kept LinkedIn flow; nothing new. |
| Coursera (job role picker) | https://mobbin.com/screens/be7f7ba4-11d5-486e-acfb-67dd69e9e596 | Role selection, not coverage. |
| Headway (Test results %) | https://mobbin.com/screens/2a586cdd-26d3-4afa-81e9-05ade3a1b8bb | Personality percentages; scoring the person, not the document. |
| How We Feel (strengths chips) | https://mobbin.com/screens/7b6a09b8-f554-4bb8-b1ed-afe721fd3680 | Self-description chip cloud; no relation to a job. |
| Brilliant (level picker) | https://mobbin.com/screens/96f26805-9a1c-4cdc-84ac-dcb72fde2164 | Onboarding level choice. |
| PandaDoc (document editor) | https://mobbin.com/screens/d3abf5fc-95b0-4ecf-82e5-4a91aa8e5439 | WYSIWYG fields placed on the page; free layout breaks ATS-safe structure; extension clutter. |
| Bonsai (proposal editor) | https://mobbin.com/screens/58642a00-15bf-450a-af98-f78d478b139c | Edit-on-page with a style panel; style panel idea is covered by Xero/QuickBooks, and on-page editing conflicts with the structured model. |
| Langdock (agent form builder) | https://mobbin.com/screens/361f4f42-759c-4064-82b6-10ffbee345ca | Form builder, not document editing. |
| Replit (Building a screen flow) | https://mobbin.com/flows/67377c52-da03-415a-994d-8b21812d42ef | Generative canvas; unrelated. |
| Bonsai (template gallery) | https://mobbin.com/screens/15cad151-c9ae-4787-803c-8674bfb1269e | Paginated grid with heavy cover images; pagination unnecessary for a few templates. |
| Canva (Create a design) | https://mobbin.com/screens/cff834f5-3d68-4cd9-801e-724ce4f12577 | Mixed document types and decorative templates; too broad. |
| Manus (Choose a template) | https://mobbin.com/screens/3b3b64a8-5449-4948-a352-a044cec3c9d3 | Illustration-driven slide themes; not comparable layouts. |
| HoneyBook (Template Gallery) | https://mobbin.com/screens/ba0cbd1e-73b8-46fb-8fef-db2e082b7baf | Marketing-style large cards with long descriptions; 2 per row wastes space. |
| Customer.io (Version history) | https://mobbin.com/screens/84f221e8-ac47-4a9c-8690-0b9caabe833a | Raw code diff; unreadable for CV content. |
| Confluence (Versions table) | https://mobbin.com/screens/b405410d-7a2d-4bd6-b44d-4efa934e0dec | Table of versions + modal with a warning icon and red OK; alarming for a safe action. |
| Adaline (History) | https://mobbin.com/screens/c53724d7-9387-4a81-8a96-bc74baddd24c | JSON diff; developer-oriented. |
| Graphite (Apply changes) | https://mobbin.com/screens/88f81a55-bfa9-450c-b106-2ffd76e94f6a | Code diff with a single "Apply changes"; no per-change decision. |
| Cofounder (Agent workspace) | https://mobbin.com/screens/0ceae398-141b-4ec2-a4b0-1741d57bb8b1 | Chat-driven edits; changes aren't shown in place. |
| Mintlify (side-by-side code) | https://mobbin.com/screens/75a194a1-ad5f-44e0-b8eb-6f78bd5598ee | Line-based code diff. |
| Devin (Review) | https://mobbin.com/screens/e48cb198-fd26-4a92-b17a-a988aa5cbef8 | PR review UI; far too dense. |
| Fresha (Preview client list) | https://mobbin.com/screens/2d5e41af-fe36-493e-a2e3-0e1b0306d8a0 | "Data Error" red pills and jargon reasons ("Has invalid format"); not supportive. |
| Twenty (Validate data) | https://mobbin.com/screens/926346f6-2cfd-4a24-893b-50902b2c21ba | Plain table; no highlighting of what needs attention. |
| Workable (Errors detected in the CSV) | https://mobbin.com/screens/31a95cb9-c8c9-4f6d-bcd8-2cc09d10894e | Blocking modal with "!" icon before the user sees the data. |
| QuickBooks (Import leads) | https://mobbin.com/screens/cf8ed259-e9cc-4a61-8fbc-fab397a4ee85 | Checkbox table for bulk rows; a CV is one record with nested items. |
| Profound (Content Optimization) | https://mobbin.com/screens/ba3540c7-9a1e-4c1d-87a6-9efdf036748e | Setup/empty state only; shows input choices (URL/Text/File), which Codecademy covers. |
| Ditto (Selected text editing) | https://mobbin.com/screens/2cc58a73-8580-465f-94d1-79d2d7144ff1 | Copy workflow (assign, status); the variants tab of the same app is kept instead. |
| Lovable (Publish + star summary) | https://mobbin.com/screens/ffab5d4d-65c1-420f-befc-05fd2e9bb2de | Star ratings for quality; gamified scoring. |
| Grammarly (Performance) | https://mobbin.com/screens/1743d2bb-74a2-4347-91a5-d873442873d2 | Compares the user against "other Grammarly users"; comparative scoring adds pressure. |
| Proton Drive (file menu) | https://mobbin.com/screens/f57f7d3e-f415-4f92-978a-2b474a4d6b0a | Generic file grid; no document semantics. |
| Grammarly (Documents) | https://mobbin.com/screens/b0dc3fe4-b737-4da1-96cf-b809ae37e5b4 | Red issue-count circles on every card; guilt signal. |
| Zoho CRM (Documents menu) | https://mobbin.com/screens/a53780ce-39c1-499f-ada9-45e42d13a83b | Overloaded context menu with nested submenus. |
| Midday (Documents table) | https://mobbin.com/screens/975c0ea4-58a5-442e-bea9-cd42f360fd5d | Raw file table; no grouping or status. |
| Descript (translation) | https://mobbin.com/screens/d2e60b0e-4c20-4b64-a45c-1a2288464067 | Interleaved source/translation paragraphs; hard to scan; upsell banner. |
| Mistral AI (translated canvas) | https://mobbin.com/screens/0eeb44a8-8b19-4afa-8a92-a1521e778e45 | Whole-document translation in chat; no field mapping back to the source. |
| ElevenLabs (Dubbing) | https://mobbin.com/screens/a9a9128a-7790-4f2c-8e38-9dd63d3cce9d | Audio dubbing timeline; unrelated beyond the source → target arrow. |

## Decision — iOS

**Entry:** `CVs` tab (§4.1). Large title "CVs", trailing "+" menu: **Import a file**, **Start from scratch**, **From a template**. The list groups each **base CV** with its variants beneath (Origin-style grouping, inset-grouped `List`); a variant row shows a kind pill ("Role: Frontend" / "Deutsch") and "Edited 2 days ago". A filter menu in the nav bar ("All", "Archived") replaces a separate archive screen (Superpower). Long-press / context menu and the trailing "…" open the CV action sheet headed by the CV's name and last edit (Dropbox): **Duplicate**, **New role variant**, **New language variant**, **Rename**, **Version history**, **Export…**, **Archive**. No destructive delete in v1 menus; archive is reversible from the filter.

**CV screen:** native stack, inline title = CV name, segmented control **Edit | Preview** at the top (Mimo Build/Preview). The toolbar holds **Check against a job** (opens the coverage sheet), **Template** (opens the picker) and "…" (same actions as the list). The autosave/sync state shows as a quiet subtitle under the title, using the shared `SyncStatus` strings from `states.md` ("Saved · just now" / "Saving…" / "Saved on this device" / "Couldn't save · Try again").

**Edit segment (section list → edit sheets):**
- Inset-grouped sections (Mozi): **Header** (name, headline, contact, links), **Summary**, **Experience (n)**, **Education (n)**, **Skills**, **Languages**, **Projects**, **Certificates**, plus custom sections from `meta`. Each section row shows a one-line summary of its content; an empty section shows a full-width "Add experience" button with a one-line hint (Glassdoor, Uxcel).
- Tapping a list section (Experience) pushes a list of item cards (Upwork): title, company · dates, first bullet. "Edit" in the nav bar enables drag handles and delete for items (LinkedIn ≡). Sections themselves reorder via an "Edit sections" mode on the CV screen (same handles; Header is pinned first).
- Tapping an item opens a **page sheet, large detent** (Fi): Cancel / item title / Save; floating-label fields; month/year pickers with "I currently work here" (Uxcel); a computed duration hint ("2 yrs 3 mos", Mindtrip); optional fields behind "More" (Mindtrip). Swipe-to-dismiss with unsaved changes asks "Discard changes?" (system confirmation).
- Bullets: one text field per bullet in a reorderable list; **keyboard accessory bar** (Linear Mobile) with: new bullet, indent/outdent, **✦ Improve** (AI), undo/redo. System spell-check and autocorrect stay on, language follows the CV's language (`basics.language` / variant language).
- Summary uses a full-height text sheet with guidance placeholder (Luma).

**AI suggestions (accept / reject):** ✦ Improve on a bullet or Summary opens a **medium/large-detent sheet** (Grab):
1. The original text quoted at the top.
2. Mode chips: **Rewrite**, **Shorten**, **Stronger verb**, **Translate…** (target language picker).
3. Result shown as an inline diff: removed words struck through, added words underlined + tinted (colour is never the only cue; VoiceOver reads "removed: …, added: …"). Up to 3 alternatives as selectable rows.
4. A reason line per change type (GoFundMe tags: "Shorter", "Stronger verb", "Fixed grammar").
5. Actions: **Keep mine** (secondary) / **Use suggestion** (primary, disabled until one is selected), plus **Edit** (accept into the field and keep editing, Structured).
6. Footer note: "Suggested by Claude. Check names, numbers and dates before you use it." (Structured disclaimer).
After accepting, a toast "Suggestion applied · Undo" (Spark Mail). Section-level "Improve all bullets" produces a queue with per-item decisions and "Use all" (Structured "Accept All"). Every accepted suggestion creates a revision with source `ai` and the mode.

**Preview segment:** the real `cv-render` HTML for the current template/theme, rendered in a WebView as paged A4/Letter pages (Glassdoor, Docusign), scroll vertically, pinch to zoom, page indicator pill "1 of 2" (Satispay). Bottom bar: **Share** (primary) and **Export options…** (Craft): format (PDF / DOCX / JSON), paper size, file name prefilled `First-Last-CV-<Company>.pdf` when opened from an application. Before sharing, the user sees the rendered file and name (Withings). Tapping a section on the page jumps to Edit and opens that section (progressive; see open question 6).

**Template picker:** sheet with a **2-column grid** of portrait thumbnails rendered with the user's own CV (Givingli/Craft; never sample people), name + "ATS-safe" caption under each, checkmark on the current one. Below the grid, theme rows: **Accent colour** (swatches), **Font pair**, **Density** (Comfortable / Compact), **Paper** (A4 / Letter; default A4 for TR/DE/EU, Letter for US). Choosing updates the Preview segment immediately; "Done" commits (one revision for the theme change), "Cancel" reverts.

**Revision history:** from the "…" menu. List grouped by day (Canva) with **Current** pinned on top (Mimo). Each row is a change sentence + time + source glyph: "Edited Experience · Acme", "Applied AI suggestion (Shorten) · Summary", "Imported from CV_2025.pdf", "Restored version from 14 Oct" (Wabi: restores appear as new entries). Tap a row → the revision opens read-only with the timestamp as the title (Notion) and a segmented **Changes | Page**: *Changes* = field-level list "Experience › Acme › End date: — → Sep 2026" (Zoom), *Page* = rendered preview of that revision. **Restore this version** → confirmation: "Your current version stays in history, so you can switch back anytime." Restore writes a new revision and updates `cvs/{cvId}` with the expected `version` (optimistic concurrency; a version mismatch raises the conflict banner below).

**Version conflict → Compare (§6.3; banner copy and actions owned by `states.md`: "Keep this version / Use the other version / Compare"):** **Compare** pushes a full-screen view titled "Compare versions" with a segmented **Changes | Page** control, reusing the revision viewer. *Changes* (default) is the field-level list (Zoom Before → After), grouped by section, with each row labelled "This device" vs "{device}, {time}" instead of before/after, so the user sees whose value is whose. *Page* shows the two renders as a horizontal pager with a "This device · 1 of 2" pill (Satispay page pill; side by side doesn't fit an iPhone). The bottom bar repeats the two banner actions; neither discards anything, because the losing side is written as a revision first (Lovable: "stays in history").

**Variants:** **New role variant** duplicates the base and asks for a label (e.g. "Frontend") and optionally a target job; **New language variant** asks for the language (EN/TR/DE) and offers "Translate with AI" or "Start with the original text". A variant header banner shows "Variant of *Base CV* · Deutsch" and, when the base changed after the variant was created, "The base CV changed in 2 places. Review" (opens a Changes list with per-change "Apply to this variant" / "Skip").

**Import (Upwork + Glassdoor + LinkedIn flows):** "+" → Import a file → document picker (PDF, DOCX, JSON Resume, LinkedIn export ZIP; size limit shown under the button) → upload/parse progress sheet ("Reading your CV… usually under a minute") → **Import review** screen (title "Did we read your CV correctly?", Lloyds):
- Same section list as Edit, prefilled. A summary row on top: "3 fields to check" with a "Show only fields to check" toggle (Remote/Melio).
- Low-confidence fields get an amber tint, an info glyph and a short reason ("We weren't sure about this date"), never red (GoPay). Tapping opens the normal edit sheet with a **View in original** button that shows the source page region (eBay "Your scan").
- Items can be added/removed right here (Splitwise).
- Primary **Create CV** is always enabled (the user can proceed with flagged fields; they stay flagged in Edit until opened or confirmed); secondary **Try another file**. The original file stays attached and appears under "…" → "Original file" (LinkedIn row: name, "Uploaded on …").

**Keyword coverage (ATS check) sheet:** "Check against a job" → pick from saved jobs (search) or paste a description. Result, large detent:
- Header fact line: "Covers 12 of 18 keywords from *Senior Frontend Engineer · Acme*" with a neutral progress bar (no gauge, no grade words).
- Segmented **Missing (6) | Covered (12)**. Each missing keyword row: keyword, where it appears in the job ("Mentioned 3 times"), and actions **+ Add to Skills** (Upwork chip) / **Work it into a bullet** (opens ✦ Improve with the keyword as context) / **I don't have this** (Glassdoor ✓/✕; hides it and excludes it from the count).
- **Readable by ATS** block (Manus checklist): "All 7 sections read back from the PDF" or, per failed section, "Skills didn't read back. Try the Single column template." Disclaimer: "Keyword checks are a guide, not a guarantee." (LinkedIn beta note).

## Decision — Desktop (macOS + Windows)

**Entry:** sidebar `CVs` (⌘4 / Ctrl+4 following the sidebar order). Three panes, resizable, each collapsible:

1. **CV list pane** (240–320 px): base CVs as group headers with variants indented beneath (Origin), kind/language pill, last edited. Filter select "All / Archived" (HoneyBook). Row overflow and right-click menu (Linear/Skiff) with shortcuts: Duplicate ⌘D, New role variant, New language variant, Rename ⇧R / F2, Version history ⌘⌥H / Ctrl+Alt+H, Export ▸ (PDF ⌘E / DOCX / JSON), Archive. Collapses to icons below 1280 px window width.
2. **Editor pane** (min 420 px): structured form. Top bar: CV name, autosave indicator "Saved" (Teachable), Undo/Redo, **Template** button. Sections as accordion cards (Xero) with a section jump list at the top (Behance nav) and "+ Add section" at the end (custom sections). Inside list sections each item is an inline form block headed "Role · Company" with drag handle and "Remove" (Mercor), month/year selects + "I currently work here" (Uxcel). Skills/languages as removable chips with type-to-add (Mercor). Optional fields under "More fields" (progressive disclosure). Keyboard: Tab/Shift+Tab through fields, ⌥↑/⌥↓ (Alt+↑/↓) move item or section, ⌘⏎ add item below, ⌘. collapse/expand section, ⌘F find in CV.
3. **Live preview pane** (Mercury/Xero): `cv-render` HTML on a tinted canvas, real page breaks, zoom (− 100% +, ⌘+/⌘−), page indicator, A4/Letter toggle. Updates on every keystroke (debounced ~150 ms). Clicking text in the preview scrolls the editor to that field and focuses it (Xero); focusing a field highlights its block on the page. Below 1100 px window width the preview becomes a toggle (⌘⇧P / Ctrl+Shift+P "Show preview"; ⌘P stays Print/Export by OS convention) so Snap/half-screen layouts still work.

**Right inspector** (toggle `⌘\` / `Ctrl+\`; not ⌘⌥I, which Electron reserves for DevTools), tabs: **Design** (template + theme), **Check** (keyword coverage + ATS round-trip), **Suggestions** (AI queue), **History**. One inspector at a time keeps the screen calm; it overlays the preview when the window is narrow.

**Template gallery:** opened from "Template" or on new CV creation; **modal over the editor** (PandaDoc) with a left column: language for section headings (EN/TR/DE, Contractbook), paper size. Grid cards rendered with the user's CV; first card "Start from blank" only when creating (HubSpot). Each card has explicit **Preview** and **Use template** buttons (Kit), arrow keys move focus, Space previews, Enter uses. Preview opens full-size pages inside the modal with ‹ › between templates. Theme controls (accent, font pair, density, paper) live in the inspector's **Design** tab with live preview (Xero/QuickBooks Design tab).

**AI inline diff (accept / reject):** select text or place the caret in a bullet → ⌘J / Ctrl+J or the ✦ button → popover under the field (WRITER) with a mode select (Rewrite / Shorten / Stronger verb / Translate to…) and up to 3 alternatives showing word-level diffs. Choosing one puts the suggestion **inline in the field** as tracked change: deletion struck through, insertion underlined + tinted, with ✓ / ✕ at its end (Langdock) and a gutter bar in the editor (GitBook). Keys: ⌘⏎ accept, Esc reject, ⌥] / ⌥[ next/previous suggestion. The **Suggestions** inspector tab lists all pending suggestions grouped by type with counts and sentence-form descriptions ("Replace 'Responsible for' with 'Led'") (WRITER rail, Contractbook panel), plus "Accept all in section". Footer note as on iOS. Accepted suggestions write a revision with source `ai`; toast "Suggestion applied · Undo ⌘Z".

**Revision history:** inspector **History** tab lists revisions (grouped Today / Yesterday / Earlier, "Latest" tag, change sentence, source glyph). Selecting one opens a **large modal** (Linear): left = the revision rendered with "Highlight changes" toggle and "1 of 3" ↑/↓ change navigation; a view switch **Page | Fields** (Fields = Zoom Before → After table, best for dates/links); "Compare with current" checkbox for side-by-side (Snowflake). While open, a banner "Viewing version from 14 Oct, 10:42 · Back to latest" (Lovable). **Restore this version** → confirmation naming the timestamp (Snowflake) with the reassurance line (Lovable). Restore = new revision.

**Version conflict → Compare (§6.3; banner copy and actions owned by `states.md`: "Keep this version / Use the other version / Compare"):** **Compare** opens the same large modal in conflict mode: **side-by-side by default** (Snowflake "Compare with current version", left = "This device", right = "{device} · {time}"), with changed blocks highlighted and "1 of n" ↑/↓ change navigation (Linear). A **Page | Fields** switch: *Fields* is the Zoom-style table with columns Field · This device · Other version and a per-row choice, so the user can merge field by field ("Use this" on each row). The footer holds "Keep this version" / "Use the other version" / "Save merged version" (the last only once a row choice differs from both sides). Whatever isn't kept is written as a revision first, so nothing is lost (Lovable copy). Keys: J/K next/previous difference, 1 / 2 pick left/right for the focused row, ⌘⏎ save.

**Variants:** role variant = duplicate + label + optional target job; the Check tab pre-selects that job. Language variant opens a **two-column translation view** in the editor pane (Etsy/Arcade): source field (read-only, "Edit original" link) | target field, per section; toolbar **✦ Translate section** / **Translate all**; each field has a status (Translated / Edited / Base changed) (Ditto/Framer). When the base changes after a variant was made, the variant's header shows "Base changed in 2 places · Review" → Fields diff with per-row "Apply to this variant" / "Skip".

**Import review:** full-window step view (Remote/Attio stepper: **Upload → Review → Done**). Left: section list with an amber dot on sections that contain low-confidence fields and a "3 fields to check" group (Attio). Middle: the parsed CV as the editor form; flagged fields show amber tint + reason + "Did you mean …?" quick fix when the parser has an alternative (7shifts), and a revert-to-parsed icon (Attio). Right: the **original file** rendered (PDF pages / DOCX conversion) with the source region highlighted for the focused field. Summary banner: "We read 42 fields. 3 need a quick look. You can fix them now or later." (Melio). Toggle "Show only fields to check" (Remote). Footer: **Re-upload file**, **Save as draft**, **Create CV** (always enabled). Keyboard: J/K next/previous flagged field, ⌘⏎ confirm field.

**ATS keyword-coverage panel (Check tab, Semrush):**
- Job selector at the top: saved jobs (search) or paste a URL/description (Codecademy); "Change job" link (Semrush "Edit target").
- Fact line + neutral bar: "Covers 12 of 18 keywords" (Squarespace fractions). No gauge, no letter grade, no "low/high".
- Chips **All 18 · Missing 6 · Covered 12** (Base44). Each keyword row expands to show where it appears in the job and actions **Add to Skills**, **Work it into a bullet** (opens the AI popover with the keyword as context), **I don't have this** (removes from the count).
- Covered keywords are highlighted in the editor and preview while the panel is open (Semrush highlighting); hovering a row scrolls to its first occurrence.
- **Readable by ATS** block (Manus checklist): one row per section from the PDF text round-trip with ✓ or a plain explanation + suggested fix; "Check again" after edits (Base44 "Scan again").
- Feedback line "Was this helpful?" (Semrush) is omitted in v1 (personal tool, no telemetry).

## Components needed

| Component | Platforms | Notes |
|---|---|---|
| `CvList` (base groups + variant rows, kind/language pill, archived filter) | iOS, desktop | iOS inset-grouped list with context menu; desktop pane with keyboard focus + right-click. |
| `CvActionsMenu` (Duplicate, New role/language variant, Rename, Version history, Export ▸, Archive) | both | iOS action sheet with CV header (Dropbox); desktop menu with shortcut glyphs. |
| `SectionList` / `SectionRow` (label, one-line summary, chevron, empty-state button) | iOS | Reorderable in edit mode; Header pinned. |
| `SectionAccordion` + `SectionJumpNav` | desktop | Accordion cards with jump list; "+ Add section". |
| `ItemCard` (title, org · dates, first bullet) with drag handle | both | iOS list row; desktop inline form header. |
| `ItemEditSheet` (iOS page sheet) / `ItemInlineForm` (desktop) | iOS / desktop | Floating-label fields, `MonthYearPicker`, "I currently work here", `DurationHint`, "More fields" disclosure, discard confirmation. |
| `BulletListEditor` + `KeyboardAccessoryBar` (iOS) | both | One field per bullet, indent, reorder, spell-check in CV language. |
| `ChipInput` (skills, languages; type-to-add, removable) | both | Shared with job filters. |
| `CvPreview` (paged render, zoom, page pill "1 of 2", A4/Letter) | both | Wraps `packages/cv-render` HTML; iOS WebView, desktop webview/iframe; click-to-locate. |
| `ExportOptions` (format, paper, file name) | both | Default name `First-Last-CV-<Company>.pdf`. |
| `TemplatePicker` (iOS sheet, 2 columns) / `TemplateGallery` (desktop modal with filters, Preview / Use) | iOS / desktop | Thumbnails rendered from the user's CV; "ATS-safe" caption. |
| `ThemeControls` (accent swatches, font pair, density, paper) | both | Desktop inspector "Design" tab; iOS rows under the picker grid. |
| `SaveStatus` → use the shared `SyncStatus` from `states.md` ("Saved · {relative}" / "Saving…" / "Saved on this device" / "Couldn't save · Try again") | both | Defined in `states.md`; listed here only because the editor toolbar/nav bar hosts it. |
| `ConflictCompare` (conflict mode of `RevisionViewer`: side-by-side on desktop, Changes list + paged renders on iOS, per-field pick, "Save merged version") | both | Opened from the `states.md` conflict banner's Compare action. Reuses `FieldDiffTable` and `InlineDiff`. |
| `AiAssistSheet` (iOS) / `AiAssistPopover` (desktop) | iOS / desktop | Original quote, mode chips/select, alternatives, reason tags, Keep mine / Use suggestion / Edit, disclaimer. |
| `InlineDiff` (word-level strike/underline with text alternative) | both | Used by AI suggestions, revision Page view, base→variant review. Colour never the only cue. |
| `TrackedChange` (in-field pending suggestion with ✓ / ✕ + gutter bar) | desktop | Keyboard: ⌘⏎ / Esc / ⌥] ⌥[. |
| `SuggestionQueue` (grouped list with counts, accept all in section) | both | Desktop inspector tab; iOS section-level queue. |
| `RevisionList` (day groups, current/latest tag, change sentence, source glyph) | both | Reads `cvs/{cvId}/revisions`. |
| `RevisionViewer` (Page / Fields switch, highlight toggle, change navigator, compare with current, Restore) | both | iOS pushed screen with segmented control; desktop large modal. |
| `FieldDiffTable` (Field · Before → After) | both | Also used by conflict dialog and base→variant review. |
| `RestoreConfirm` | both | Names timestamp; reassurance copy. |
| `TranslationColumns` (source and target per field, Translate section/all, status) | desktop (iOS: one field at a time with "Original" disclosure) | Language variants. |
| `VariantBanner` ("Variant of … · Deutsch", "Base changed in N places · Review") | both | |
| `ImportPicker` + `ParseProgress` | both | Formats + size limit shown; time estimate. |
| `ImportReview` (flagged-only toggle, summary banner, stepper on desktop, original file pane) | both | Uses `ConfidenceField`. |
| `ConfidenceField` (amber tint, info glyph, reason, "Did you mean…", View in original, revert) | both | Never red; confirmed on edit or explicit ✓. |
| `OriginalFileRow` / `OriginalFileViewer` | both | Attached file from Storage. |
| `JobPicker` (saved jobs search + paste URL/description) | both | Shared with Apply. |
| `KeywordCoverage` (fact line, neutral bar, Missing/Covered chips, keyword rows with actions, highlight-in-document) | both | iOS sheet; desktop inspector "Check" tab. |
| `AtsReadbackChecklist` | both | Per-section ✓ / explanation + fix; "Check again". |
| `UndoToast` | both | Shared app-wide. |

Data mapping (paths from kickoff): `users/{uid}/cvs/{cvId}` holds the JSON Resume document + `meta` + `version`; every accepted change set writes `cvs/{cvId}/revisions/{revId}` (create-only) with `source` (`user` | `ai` | `import` | `restore` | `variantSync`), a change summary and the full snapshot or patch (see open question 2). Rendered exports go to `users/{uid}/renderedFiles/{id}`. The original import file is stored in Cloud Storage and referenced from the CV. Low-confidence flags come from the parser output and are stored on the CV until confirmed (open question 3).

## Copy notes

Tone: calm, specific, supportive. The CV is the user's; the app suggests, never judges. No grades, no "weak/low/poor", no red for uncertain parsing, no exclamation marks. AI is named as the source ("Suggested by Claude"). TR uses informal "sen", DE informal "du" (same as Today research; pending the ux-copy pass).

| Key | EN | TR | DE | Note |
|---|---|---|---|---|
| Segments | Edit · Preview | Düzenle · Önizleme | Bearbeiten · Vorschau | DE ~+40 %; segmented control must size to content, not equal fixed widths. |
| Save status | (see `states.md` `save.*` keys: Saved · {relative} / Saving… / Saved on this device / Couldn't save · Try again) | | | Owned by `states.md`; not redefined here. |
| Compare title | Compare versions | Sürümleri karşılaştır | Versionen vergleichen | Opened from the conflict banner (`cv.conflict` in `states.md`). |
| Compare column labels | This device · {device}, {time} | Bu cihaz · {device}, {time} | Dieses Gerät · {device}, {time} | `{time}` locale-formatted. |
| Merge action | Save merged version | Birleştirilmiş sürümü kaydet | Zusammengeführte Version speichern | DE is the longest; footer buttons wrap/stack. |
| Empty section | Add your first role. Start with the most recent. | İlk pozisyonunu ekle. En yenisinden başla. | Füge deine erste Position hinzu. Beginne mit der aktuellsten. | |
| AI assist modes | Rewrite · Shorten · Stronger verb · Translate | Yeniden yaz · Kısalt · Daha güçlü fiil · Çevir | Umformulieren · Kürzen · Stärkeres Verb · Übersetzen | Chips wrap; "Stärkeres Verb" is the longest. |
| AI actions | Keep mine · Use suggestion · Edit | Benimkini koru · Öneriyi kullan · Düzenle | Meine Version behalten · Vorschlag übernehmen · Bearbeiten | DE ~2× EN; buttons stack vertically when they don't fit side by side. |
| AI disclaimer | Suggested by Claude. Check names, numbers and dates before you use it. | Claude önerisi. Kullanmadan önce isimleri, sayıları ve tarihleri kontrol et. | Vorschlag von Claude. Prüfe Namen, Zahlen und Daten, bevor du ihn übernimmst. | Always visible under suggestions. |
| Applied toast | Suggestion applied · Undo | Öneri uygulandı · Geri al | Vorschlag übernommen · Rückgängig | |
| History entry examples | Edited Experience · Acme / Applied suggestion (Shorten) · Summary / Restored version from 14 Oct | Deneyim düzenlendi · Acme / Öneri uygulandı (Kısalt) · Özet / 14 Eki sürümü geri yüklendi | Berufserfahrung bearbeitet · Acme / Vorschlag übernommen (Kürzen) · Profil / Version vom 14. Okt. wiederhergestellt | Dates from `Intl.DateTimeFormat`. |
| Restore confirm | Restore the version from 14 Oct, 10:42? Your current version stays in history, so you can switch back anytime. | 14 Eki, 10:42 sürümü geri yüklensin mi? Mevcut sürümün geçmişte kalır, istediğin zaman geri dönebilirsin. | Version vom 14. Okt., 10:42 wiederherstellen? Deine aktuelle Version bleibt im Verlauf, du kannst jederzeit zurückwechseln. | Primary "Restore" / "Geri yükle" / "Wiederherstellen". |
| Import review title | Did we read your CV correctly? | CV'ni doğru okuduk mu? | Haben wir deinen Lebenslauf richtig gelesen? | |
| Import summary | We read 42 fields. 3 need a quick look. You can fix them now or later. | 42 alan okuduk. 3 tanesine kısaca göz atman iyi olur. Şimdi ya da sonra düzeltebilirsin. | Wir haben 42 Felder gelesen. 3 solltest du kurz prüfen. Du kannst sie jetzt oder später korrigieren. | Never "errors". |
| Low-confidence reason | We weren't sure about this date. | Bu tarihten emin olamadık. | Bei diesem Datum waren wir uns nicht sicher. | Amber, info glyph. |
| Flagged filter | Show only fields to check | Yalnızca kontrol edilecek alanları göster | Nur zu prüfende Felder anzeigen | |
| Import CTAs | Create CV · Try another file · Save as draft | CV oluştur · Başka dosya dene · Taslak olarak kaydet | Lebenslauf erstellen · Andere Datei versuchen · Als Entwurf speichern | |
| Coverage fact | Covers 12 of 18 keywords from this job | Bu ilandaki 18 anahtar kelimeden 12'sini içeriyor | Enthält 12 von 18 Schlüsselwörtern aus dieser Stelle | TR suffix after numbers ('sini) needs ICU-aware plural/ordinal handling; build with `Intl.PluralRules` + message format, not concatenation. |
| Keyword actions | Add to Skills · Work it into a bullet · I don't have this | Yeteneklere ekle · Bir maddeye yerleştir · Bende yok | Zu Kenntnissen hinzufügen · In einen Stichpunkt einbauen · Habe ich nicht | |
| ATS readback ok | All 7 sections read back from the PDF. | 7 bölümün tamamı PDF'ten okunabiliyor. | Alle 7 Abschnitte sind im PDF lesbar. | |
| ATS readback issue | Skills didn't read back. The Single column template usually fixes this. | Yetenekler bölümü okunamadı. Tek sütun şablonu genellikle bunu çözer. | Kenntnisse waren nicht lesbar. Die einspaltige Vorlage behebt das meist. | Says what to do, no blame. |
| Coverage disclaimer | Keyword checks are a guide, not a guarantee. | Anahtar kelime kontrolü bir rehberdir, garanti değildir. | Die Schlüsselwortprüfung ist eine Orientierung, keine Garantie. | |
| Variant banner | Variant of Base CV · Deutsch. The base changed in 2 places. Review | Temel CV'nin varyantı · Deutsch. Temel CV 2 yerde değişti. İncele | Variante von Basis-Lebenslauf · Deutsch. Die Basis hat sich an 2 Stellen geändert. Prüfen | Language names in their own language (Deutsch, Türkçe, English). |
| Template caption | ATS-safe | ATS uyumlu | ATS-geeignet | |

Layout rules from length expansion: no fixed-width buttons or segments; paired buttons stack on iOS when either label exceeds half the width; section headers allow 2 lines; month names and dates come from `Intl.DateTimeFormat` in the CV's language (the CV language can differ from the UI language: a German variant edited in an English UI shows German month names in the preview only). CV section headings in templates come from a per-language dictionary (EN "Experience", TR "Deneyim", DE "Berufserfahrung").

## Open questions

1. **Variant data model.** Separate `cvs/{cvId}` documents with `meta.baseCvId` + `meta.variant: { kind: "role" | "language", label, language }` (fits the kickoff layout, each variant has its own revisions) vs. a single CV with overlays. *Recommendation:* separate documents; base→variant change review computed from base revisions since `meta.baseRevisionId`. Needs an ADR.
2. **Revision granularity and payload.** Immutable revisions on every keystroke would explode the subcollection. *Recommendation:* coalesce edits into one revision per editing burst (sheet Save on iOS; 60 s idle or blur of section on desktop), always a separate revision for AI accept, import, restore, template/theme change. Store full snapshots (CVs are small, < 50 KB) so restore and diff need no replay. Confirm in the data-model ADR.
3. **Confidence source and threshold.** The parser (Claude + deterministic PDF/DOCX extraction) must emit per-field confidence; what threshold flags a field (proposed < 0.8), and where do flags live (proposed `meta.importReview.flags[fieldPath]`, cleared on edit/confirm)?
4. **Keyword extraction.** Deterministic (job-description term extraction + synonym list per language, TR/DE stemming) vs. Claude-extracted keyword list cached on the job. *Recommendation:* Claude extraction cached in `jobs/{jobId}` with deterministic matching against the CV text, so coverage updates live while typing without new AI calls.
5. **iOS preview rendering offline.** WebView rendering of `cv-render` HTML works offline if fonts are bundled; PDF export on iOS needs either on-device HTML→PDF (WKWebView `createPDF`) or the Cloud Function Chromium path (§6.5 says Chromium everywhere). Which is used offline?
6. **Click-to-edit from preview on iOS.** Tapping a block in Preview to jump to its edit sheet is proposed; it needs `cv-render` to emit field-path data attributes. Confirm with the cv-render owner (M2/M3).
7. **Template thumbnails before any CV exists.** Thumbnails must not use invented sample people (no mock data in production). Proposed: before the first CV exists, show structural skeleton thumbnails labelled with the template's properties ("Single column · Serif headings"); afterwards render with the user's data.
8. **Photo / personal-data fields per market.** DE CVs often include a photo and date of birth; UK/US CVs should not. Proposed: optional fields hidden by default with a per-variant toggle (QuickBooks show/hide pattern) and a neutral note on market conventions. Needs product confirmation.
9. **AI translate scope.** Translate a whole variant at creation, per section, or per field on demand? Proposed: offer "Translate all" once at creation, then per section; every translated field is marked so the user reviews it.
