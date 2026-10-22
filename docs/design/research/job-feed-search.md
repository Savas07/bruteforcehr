# Research: Job feed, search, filters, saved searches

## Scope

Brief §5.3 row **"Job feed, search, filters, saved searches"**:

- **iOS** (`search_screens` / `search_flows`, platform `ios`): job listings, search filters, saved searches (+ job actions from §4.3: save, dismiss with a reason, apply; deduped jobs keep every source link).
- **Desktop** (platform `web`, used for both macOS and Windows): list + detail split view, filter bar, saved searches.

The job detail panel/screen itself (match score, why it matches, gaps, source list, apply CTA) is covered in [`job-detail.md`](./job-detail.md).

Method: Mobbin MCP, fixed `task_intent` ("Design a cross-platform job search, CV builder and application tracker app") and `output_destination: "code"` on every call, one screen/flow per query, `mode: "deep"` for screen searches. Judged from the returned images. The user's saved Mobbin collections only contain website sections (kickoff.md), so none apply to this area. No Mobbin images were downloaded or committed.

Data model this has to serve (BRIEF §6.2): `job_match { score, reasons, gaps, state: new | saved | dismissed, dismiss_reason }`, `saved_search { query, filters, schedule, alert_threshold }`, `job { source, url, apply_url, … }` with every source link kept after dedupe.

## References — iOS

### Job listings (18 examined: 10 listing screens + 8 swipe-action screens; 8 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Glassdoor | Jobs feed | https://mobbin.com/screens/254e172d-67e5-4fdf-a9fc-f7d898adce3d | Row anatomy: company + title + location + salary, and a bookmark on the right. The salary carries its provenance: "(Employer provided)" vs "(Glassdoor Est.)". Age ("30d+") sits bottom-right. | Salary provenance is exactly the trust cue we need when sources disagree. The row stays scannable in four lines. |
| Upwork | Jobs: My Feed | https://mobbin.com/screens/02c385ca-44de-4aec-8a89-1f5ec7dcad24 | A search field with a saved-searches button beside it. Saved searches show as a horizontal chip row ("All", "ios designer") above the feed. Each card has a thumbs-down (dismiss) and a heart (save). | Saved searches become one-tap feed scopes. Dismiss and save are both reachable on the row without opening it. |
| LinkedIn | Jobs home | https://mobbin.com/screens/e70fd4af-f1e2-4788-af22-2319c554a7ed | An ✕ on every row for "not for me". The section header explains the ranking basis: "Based on your profile, preferences, and activity…". | Shows why the list is ordered this way, and offers dismiss as a first-class row action. |
| Handshake | Explore: good fits | https://mobbin.com/screens/a76e68b9-302e-4e6a-b6cc-455214e3d669 | Section title that names the basis ("Good fits for product designers"), plus a footer escape hatch: "Not what you're looking for? Update career interests." | A calm, supportive way to recover when the ranking is off, with no blame on the user. |
| Airtasker | Browse tasks | https://mobbin.com/screens/663aab9c-93d4-4a3f-8c62-67f7e2543f08 | A slim "Filter" and "Sort" row under the title. Card metadata uses small leading icons (location, date, time). | Gives filter and sort a minimal footprint when no chips are active. Icon-led metadata survives DE/TR length expansion better than labels. |
| Spark Mail | Swipe settings | https://mobbin.com/screens/87671ae6-77fe-4c31-880f-29efeac59e2f | Four swipe slots: short and long, in each direction. | Supports our mapping of leading = Save, trailing short = Not for me, trailing long = Not for me (full swipe). |
| GitHub | Left-swipe options | https://mobbin.com/screens/37a63823-8a0b-479b-bf6a-7354a718618d | "Save / Unsave" as a toggle swipe action. | Save is a toggle, so the same swipe undoes it. |
| Quo | Row with two trailing actions | https://mobbin.com/screens/7e60ef54-bf2f-4a54-ae6f-81111337e610 | Two trailing actions with distinct colours (Rename, Delete). | Shows that two trailing actions stay legible. We use "Not for me" plus "More…". |

### Search filters (8 examined, 5 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Glassdoor | Filter jobs sheet | https://mobbin.com/screens/ffd24647-fda5-4643-988f-7196c7c4ec17 | A salary range slider with editable min/max fields, collapsible sections, and boolean rows ("Remote only"). The footer has "Clear" and a primary **"Show 73 jobs"** with a live count. | The live count prevents dead-end filters. The editable fields make the slider accessible. |
| Handshake | Filters sheet | https://mobbin.com/screens/7b360199-eda7-4176-993f-bf2fd5d5829b | Sections hold multi-select checkboxes with "Show more" and "Add locations ›". The footer pairs "Clear all" with "Show 4832 jobs". | Location is multi-select for TR/EU/UK/US/remote, so this list pattern fits our markets. |
| Upwork | Filter by sheet | https://mobbin.com/screens/555ca42b-2a16-43b9-b6be-44f15d0d58d2 | The filter button shows a badge with the active filter count ("3"). Options show per-option counts ("Hourly (6)"). | You can see filter state at a glance without opening the sheet. |
| LinkedIn | Date posted chip → sheet | https://mobbin.com/screens/c34301a3-bf08-424e-8d81-9f81f2b11396 | A horizontal chip row (Jobs ▾, Date posted ▾, Easy Apply). Each chip opens a small sheet with radios, "Reset" and "Show results". The result header reads "99+ results · How promoted jobs are ranked ⓘ". | The pattern we use on iOS: one chip, one small sheet. Ranking transparency sits next to the count. |
| Google Maps | Filters | https://mobbin.com/screens/532e2fc3-0a63-46a1-a85a-45f8e95fcbd4 | "Rating · at least" as a segmented control (Any / 3.5 / 4.0 / 4.5). | Model for our **Minimum match** filter: Any / Partial+ / Good+ / Strong. These are bands, not a fine-grained slider. |

### Saved searches (8 screens + 6 flows examined, 8 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Glassdoor | Saved › Job alerts | https://mobbin.com/screens/9701e794-4ef8-4459-98d6-7f9d7276aa21 | Each row shows query, location and cadence ("Sent weekly") with an overflow menu. The footer CTA is "Create job alert". Tabs: Saved jobs / Job alerts / Applied. | A compact management list. Cadence is visible without opening the row. |
| Handshake | Jobs with alert toggle | https://mobbin.com/screens/55e36957-fe37-482e-8f52-6762e9c7c871 | An inline banner above the results, "Notify me about new jobs like this", with a toggle. Filter chips carry count badges, the result count and sort sit on one line, and rows have ✕. | The lowest-friction way to save a search: right where the user is looking at the results. |
| eBay | Saved › Searches | https://mobbin.com/screens/ececee69-3ca4-4b20-a6ef-74f91fda15a6 | Badges for new results per saved search ("99+", "25"). A "New results only" toggle. Snackbar: "Saved search removed · **Undo**". | New-match counts per search, plus undo on delete (trust principle). |
| Realtor.com | Saved searches | https://mobbin.com/screens/a41cec67-b082-4f7d-b1db-e1e55fd4243a | The subtitle summarises the criteria in plain text ("$100–$10K, 1 to 5 beds, …"). | Users recognise a saved search by its filters, not just its name. |
| Glassdoor | Flow: Creating a job alert | https://mobbin.com/flows/b0edbc46-523b-4595-b073-aa6201dce8eb | "Create Job Alert" pinned under the results. After saving: a toast, then the slot becomes "Alert saved for this search · View". | The affordance changes state in place, so the user can't create a duplicate. |
| Handshake | Flow: Turning on job alerts | https://mobbin.com/flows/bef28020-2445-472d-9da6-226caff396b1 | Toggle on → toast "Job alert created ✕", and the list keeps its scroll position. | Saving is one tap and doesn't navigate away. |
| LinkedIn | Flow: Editing a job alert | https://mobbin.com/flows/e5e18281-aad0-4f63-aef6-72b2892adff4 | The edit screen has: alert frequency (Daily / Weekly), notification type (Email / Push / both), "Filters: On-site · Hybrid" summary, and a destructive "Delete job alert" at the bottom. The manage list shows the frequency line. | Maps 1:1 to `saved_search.schedule` and delivery channel. Deletion is separated from the other settings. |
| Upwork | Flow: Saving a job search | https://mobbin.com/flows/76930918-3f10-4b11-b65b-106a4bb66775 | "Save search" opens a sheet "Save search as [name]" prefilled with the query. Explainer: "Saving this search will save the query and all the filters that are currently applied." Followed by a toast. | Spells out that filters are included, and prefills the name. |

### Dismiss with a reason (8 examined, 3 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Zomato | Hidden restaurant + reason sheet | https://mobbin.com/screens/c6b1a787-daf5-4133-b1c0-a7e343fd1e22 | **Hide first, ask second.** An inline card says "We have hidden McDonald's. You can unhide it…" with **Undo** and "Tell us more". The reason sheet is optional. | Dismiss is instant (speed). The reason is optional (calm), and Undo is always offered (trust). |
| Grab | Reason for hiding | https://mobbin.com/screens/537b6bbb-8532-4e7c-86e6-1bfe175b69e6 | Multi-select reasons, an optional "Can you explain more?" text field, and an equal-weight **Skip** next to Submit. Includes "recommended too often". | Several reasons can apply at once (salary *and* location). Skip removes the guilt. |
| Google | Feed item "More options" | https://mobbin.com/screens/ab8449d7-b5d5-469c-b65a-e230e4d056d2 | Granularity ladder: "Not interested in this", "Not interested in a topic", "**Don't show content from [source]**", "About this source & topic". | Gives us item-level vs company-level ("Hide all jobs from Acme") vs source-level muting, plus a route to "About this source". |

### Dedupe: one job, several sources (row level; 8 examined, 1 kept here, the rest in job-detail.md)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Skyscanner | Select a booking site | https://mobbin.com/screens/07abae0c-52a1-40c5-8778-7b4ba603b1b8 | "All 5 deals include: …" states what is common, then lists each provider row with its own logo, rating and action. | The model for a deduped job: shared facts once, then per-source rows. On the list row this collapses to a "3 sources" indicator. The full per-source list lives in the detail view (see job-detail.md). |

## References — Desktop (web → macOS + Windows)

### List + detail split view (10 examined, 4 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Glassdoor | Jobs: For You, split | https://mobbin.com/screens/b3c0eea2-d650-4faf-b589-1891c3ffb24d | A narrow list (about 35%) and a wide detail card. The selected row gets a filled bookmark. The detail header has "Apply on employer site" and Save. Salary provenance appears on both sides. | The closest job-domain match to our layout. "Apply on employer site" is honest about where the user ends up. |
| Mercor | Explore opportunities, split | https://mobbin.com/screens/db3c0878-3d38-4b6c-a469-c9c776872bef | The list column has tabs, search, sort ("Newest"), "Filter" and active filter chips ("Pay Rate", "Domain", "Clear"). The selected card gets an accent outline. The detail pane has collapse («) and expand (⤢) controls and a sticky bottom CTA. | Keeps the filter state inside the list column. The detail pane can be collapsed or popped out, which suits Snap layouts on Windows. |
| Juicebox | PeopleGPT search, split | https://mobbin.com/screens/e53d5ba3-df8d-4f8e-b8d1-32ddc9deeab0 | The query is restated as chips ("Backend Engineer in San Francisco with 2 to 5 years … +9 more filters · Edit Filters"). Rows carry an AI summary with **matched terms highlighted**. The right panel has prev/next arrows and close. A "Quick Find ⌘K" hint sits in the sidebar. | Highlighting the evidence inside list rows explains the ranking without opening each job. Prev/next in the panel supports J/K keyboard flow. |
| Workable | Candidates list + profile | https://mobbin.com/screens/cedaea50-43d3-4d1c-80ba-f36cd320a29e | A small score ring on each list item. Below the detail header, a collapsible "How Cindy matches this job · AI" section. | Confirms the list shows a compact score, while the explanation lives in the detail behind progressive disclosure. |

### Filter bar (12 examined, 6 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Remote | Job seekers: jobs | https://mobbin.com/screens/831b0387-e58d-4de3-bbbd-dcea5c907593 | Search field, then an **"Apply my job preferences"** toggle, then icon pills (Full-time +1 more, Workplace, Country or timezone, Seniority, Pay, Travel) and "Clear all". Popovers have their own search and "Clear". An "All jobs / Saved" segment and a "Most recent" sort sit above the list. Row tags like "remote · GMT+6 to GMT+10 only". | Its filter dimensions match ours almost exactly (remote type, timezone/country, seniority, pay). The preferences toggle maps to "use my profile hard filters". |
| Turo | Filter pill popover | https://mobbin.com/screens/bf0c492a-c136-4c60-a3ca-b829d0e6b74e | Active pills turn filled/dark and show their value ("Under $93", "Vehicle type (3)"). Each popover has radios, "Reset" and a primary **"View 39 results"**. The leading "(5)" pill opens all filters. | Active vs inactive is clear without a separate chip row. The live count sits in the popover. |
| Mercor | Domain filter popover | https://mobbin.com/screens/49782c05-c119-437f-8af4-fde46431657c | Active filters sit as small removable chips under the search, with a "Clear" text button. The popover has a trash icon to remove that filter. | A compact pattern that fits inside a 380 px list column. |
| Juicebox | Filter bar with counts | https://mobbin.com/screens/e2634742-d0df-4b79-9049-0e00e6243c1c | Pills show selection counts ("Software Engineer (9)", "Python (1)"), and "More Filters" is the primary button. The popover offers chip multi-select with "Clear all". | Count-in-pill shows multi-select filters (locations, sources) without long labels. That matters for DE. |
| Unity Asset Store | Results with active chips | https://mobbin.com/screens/d009669f-31a0-46ce-b29d-b44645c4a924 | A chip row of key:value pairs ("Price: Free ×", "Rating: ★5 ×", "Clear") plus "Results 1–6 of 6". | Readable chip labels for screen readers ("Remote: Yes, remove"). |
| Airtasker | Browse tasks (web) | https://mobbin.com/screens/e2636eae-28ad-426f-b7f4-38e5f460abc8 | A single-line bar: search, category ▾, "Remote tasks only ▾", "$5 – $500 ▾", "Other filters (1) ▾", "Sort ▾". | Proves the whole bar fits on one line at desktop widths, with an overflow pill for the rest. |

### Saved searches on desktop (6 flows examined, 4 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Zillow | Flow: Saving a search | https://mobbin.com/flows/79a22f98-b3a9-41b5-b8fe-ec29e7cf005f | "Save search" is the primary button at the right end of the filter bar. Clicking it **saves immediately**, then opens a popover "Search saved! — Name your search / Frequency [Instant ▾] / Update". Toast: "Your search was updated!". | Optimistic save first, details second. One click, and the defaults are good enough. |
| Glassdoor | Flow: Creating job alert (web) | https://mobbin.com/flows/a6752569-9550-4b7a-a66f-f1a34d2ed45e | "Create job alert" sits top-right of the results and then reads "Alert saved for this search · View". A dialog summarises the criteria and cadence with "Edit" and "View all job alerts". Active filters show as green removable chips. | In-place state change. The summary card is the same component as the saved-search row. |
| Zillow | Flow: Saving a search (filters), no results | https://mobbin.com/flows/2fbef786-4d39-4aa3-b50a-a2c2671510c3 | Zero-results state: "No matching results. Edit or remove these filters for best results." Removable chips show counts ("Keywords (12) ×", "A/C (4) ×") and there is a "Remove all filters" link. You can still save the search. | The right empty state for a narrow search: tell the user which filter to relax. A zero-result search is still worth saving for alerts. |
| Perplexity | Flow: Creating a scheduled search | https://mobbin.com/flows/3572f5b2-1041-4701-b948-1b3cbf29e32c | Schedule = cadence + time ("Daily · 9:00 PM"), an optional **expiration date**, and a notification channel (In-app, Email, Mobile). The list row reads "… · Daily 10:00 PM". | Maps to `saved_search.schedule` and the "optional daily digest" (§4.3). The expiry fits job searches that end. |

### Row actions & dismiss on desktop (examined within the 10-result "candidate fit score panel" query; 3 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Wrangle | Sourcing list + candidate card | https://mobbin.com/screens/6c237e82-6834-432d-87f5-17ea5ed042e6 | Tabs "Sourcing (200) / Shortlisted (0) / **Hidden (0)**". Each card ends with a **Hide | Shortlist** pair. | Dismissed jobs stay recoverable in a counted "Hidden" view. Save and dismiss get equal weight. |
| Pin | Candidate list (compact view) | https://mobbin.com/screens/df5484d2-1528-41d6-ab83-2a791577e05b | Each row has an action cluster (Comment, Outreach, Shortlist, **Decline**) and inline criteria checks with evidence. | Row-level actions on desktop. Criteria-on-row is the expanded "dense" mode for power users. |
| Remote | Candidates table | https://mobbin.com/screens/d7ce628e-0974-48d4-a5ed-7b1b5591aca6 | A **Source** column ("Sourced", "Applied", "AI match") next to stage and dates. | A plain-text provenance column, used in our optional table density. |

## Examined but rejected

| App | mobbin_url | Reason |
|---|---|---|
| ANZ Plus | https://mobbin.com/screens/25800d52-6ceb-4453-bb87-974729d40433 | An occupation picker, not a listing. No result metadata. |
| Nutmeg | https://mobbin.com/screens/d2d61b19-f9d7-4798-b74d-2cf07e376fd3 | A taxonomy list with no job rows. |
| Fiverr | https://mobbin.com/screens/2f5eede9-3c6a-467a-ab24-06f067502cf2 | Image-led marketplace cards. Jobs have no hero image, and the cards waste vertical space. |
| Dave | https://mobbin.com/screens/33b61cbf-c31b-4203-aaa6-eda196c3e345 | A decorative hero pushes the results below the fold, and the rows have no salary or actions. |
| Insight Timer | https://mobbin.com/screens/836fddb8-1d95-44fb-8ab7-bfdd82cf36a3 | Photo cards, one per screen: too low-density for triage. |
| Deel (iOS filters) | https://mobbin.com/screens/c940a777-1eb2-40b7-9879-8544107f1955 | Every section is collapsed, so the current values are invisible and there's no live count. |
| Behance | https://mobbin.com/screens/b0777e8f-b761-46a9-8a1a-28084470ebc2 | An availability-preferences form, not a search filter. |
| Opendoor | https://mobbin.com/screens/ba93ea1d-fea3-4ef7-bbff-71b112d98c74 | Range sliders that only say "No min / No max", with no numeric input or result count. |
| Airtasker (alerts) | https://mobbin.com/screens/fbbfca99-6d17-4632-8c1a-495eedd47837 | Wordy explanatory blocks and settings indirection ("View settings" twice). |
| LinkedIn (preferences) | https://mobbin.com/screens/fd74a7e4-6ec0-410b-99cc-859116fbbd41 | Alerts are buried in a generic preferences list. |
| Booking.com | https://mobbin.com/screens/d93fdb5c-f655-4431-80ca-f13f5942b4cd | The alerts tab is mostly a loyalty upsell. |
| Fidelity | https://mobbin.com/screens/5373f46c-f4fd-4b9b-980d-0bf08156d66f | Active/Expired alert split adds a mode we don't need, and rows lack criteria summaries. |
| LinkedIn flow (collection alert) | https://mobbin.com/flows/41f7c47f-f6cf-4fef-b0e7-4fdf1009c6ac | A blue banner over the tab bar duplicates Handshake's pattern but covers content, and it's weekly-only. |
| Twitch | https://mobbin.com/screens/49975464-6e82-4ddf-93ff-4aa8958e8a7b | A bare reason list with a disabled "Done" and no Skip or Undo. Feels abrupt. |
| Coffee Meets Bagel | https://mobbin.com/screens/2f19b60c-a179-4644-bd5b-256c9ba398df | Reason taxonomy is tied to dating and safety reporting. The "anonymous" reassurance is irrelevant for a personal tool. |
| Walmart | https://mobbin.com/screens/1a5af906-374e-4227-9194-379d655d9726 | An eight-option survey with a required comment for "Other": too heavy for a dismissal. |
| Slopes | https://mobbin.com/screens/5cde573c-aa5b-4442-a45a-8bdb16def1a0 | An error-report form, not a dismissal. |
| Withings Health Mate | https://mobbin.com/screens/bff0dd47-1283-4aa4-a0d0-14a43c5913e2 | "We're sorry to see you leave": guilt-tinged exit-survey tone that conflicts with our calm principle. |
| The Atlantic | https://mobbin.com/screens/e97a2ae1-ef94-4f8d-bdfb-f85b325a9936 | One destructive swipe only (Delete). We need save and dismiss. |
| Notion Mail | https://mobbin.com/screens/991c9208-8165-4f58-b43d-735cdd52865a | User-configurable swipe actions are overkill for v1. |
| MyFitnessPal | https://mobbin.com/screens/72032ea6-066e-4745-90a6-3b0c9ad9a885 | An edit-mode delete with minus buttons is not a triage gesture. |
| Letterboxd | https://mobbin.com/screens/10b09d4a-e9f0-4be6-8d5f-5c10c4e1f276 | Reorder plus delete edit mode isn't relevant. |
| Apple Watch | https://mobbin.com/screens/29aca241-54ef-486d-ab84-51e091982fe8 | Same as above. |
| Turo (split) | https://mobbin.com/screens/606829fa-81ae-42a5-acc6-d6ae87370a51 | Map + photo split. Jobs aren't map-first (remote-heavy markets). Its filter bar is kept separately (bf0c492a). |
| folk | https://mobbin.com/screens/125f7304-26d5-4b07-adfd-8e3ff3022fc2 | CRM table with an editable record drawer: field editing dominates, not reading. |
| Upwork (web list) | https://mobbin.com/screens/2ce19bba-0cb5-46e4-bffc-c329417fb8f8 | Single-column long cards with no detail pane, so each item needs a page round-trip. We still borrow its thumbs-down/heart idea via the iOS reference. |
| User Interviews | https://mobbin.com/screens/a58bddf2-71b1-40c6-be3d-6eccb69497fd | The overlay drawer covers the list, so you can't triage with J/K while reading. |
| Employment Hero (split) | https://mobbin.com/screens/447d4cd4-d9a1-4152-bcc3-e9dc06b0aa8a | An ATS pipeline header eats vertical space. Its score-bucket legend is studied in job-detail.md. |
| Preply | https://mobbin.com/screens/a830f90b-5e12-4415-af31-1afb3cf9c338 | Two rows of large boxed selectors plus a full-page chip dump on zero results is heavy. Zillow's zero-result chips do the same in one line. |
| Apollo (filters) | https://mobbin.com/screens/99a38775-12b9-4612-aa7a-cb8130a6b934 | Onboarding filter builder for lead lists, not a results filter bar. |
| Dribbble | https://mobbin.com/screens/d762742e-e14e-4207-92df-7fa868424f21 | Duplicates the Juicebox count-in-pill pattern, with image-grid results. |
| Employment Hero (filters) | https://mobbin.com/screens/5c49b197-4bf4-4320-b047-9bf058f20e26 | Admin-table filter chips ("Status: Open ×") inside a nested tab frame. Unity's chip row is cleaner. |
| Deel (web filters) | https://mobbin.com/screens/4b6dc5fb-4585-428a-8849-9b58967d709c | A right drawer of collapsed accordions where you can't see values. Same issue as the iOS version. |
| Apollo flow | https://mobbin.com/flows/2326fb98-9c2a-4099-a3cb-7fa64c8e2609 | Saved-search settings live in a drawer, with alert cadence in a nested modal: two layers to set one value. |
| Zillow flow (footer link) | https://mobbin.com/flows/498716ff-10bf-438a-b60f-383fd193d340 | Same popover as 79a22f98. The end-of-list "Save this search" text link is too easy to miss. |
| Glassdoor inline "Enhance your jobs" card | https://mobbin.com/screens/b3c0eea2-d650-4faf-b589-1891c3ffb24d | Kept for the split layout, but **its inline profile-question card in the list is rejected for v1**. It interrupts triage and shifts row positions under the keyboard cursor. |

## Decision — iOS

**Jobs tab (native stack, large title "Jobs").**

1. **Search**: native `.searchable`-style search field in the navigation bar (query = keywords/title). Location is a filter, not a second field, to keep one input on small phones (iPhone 17e).
2. **Saved-search scope row**: a horizontal chip row under the title, in this order: `All matches` · each saved search (name + new-count badge, as on eBay) · `+`. Selecting a chip scopes the feed and loads its filters (Upwork pattern). Long-press on a chip opens a context menu: Edit, Alert settings, Delete (with an Undo toast).
3. **Filter chip row** (LinkedIn/Handshake): the first chip is the filter button with an active-count badge (Upwork). Then come `Location`, `Remote`, `Salary`, `Seniority`, `Posted`, `Match`, `Source`, each showing its value when active ("Remote: Yes"). Each chip opens a **form sheet at the medium detent** with a live **"Show N jobs"** primary button and "Reset" (Glassdoor, Handshake). The filter button opens the full sheet with every section (large detent).
   - `Match` uses a segmented control: Any / Partial+ / Good+ / Strong (Google Maps "at least"). There is no 0–100 slider (see job-detail.md on false precision).
   - `Salary`: range slider **plus** numeric min/max fields, and a currency picker (TRY / EUR / GBP / USD). Also a toggle "Hide jobs without a stated salary" (off by default).
4. **Result header**: "128 jobs · Best match ▾" (sort menu: Best match, Newest). An ⓘ next to "Best match" explains the order in one sheet: "Sorted by match band, then newest. Scores are a rough guide."
5. **Save-search banner** (Handshake): when the query or filters differ from every saved search, an inline row appears above the results: "🔔 Get alerts for this search [toggle]". Turning it on **saves immediately** with defaults (daily digest, notify for Good+ matches, name = query + location) and shows a toast "Search saved · Edit" (Zillow/Glassdoor). Edit opens the saved-search editor: name, filter summary, alert cadence (As they arrive / Daily digest / Weekly / Off), notify threshold band, delete at the bottom (LinkedIn).
6. **Job row** (Glassdoor anatomy):
   - Line 1: title (2 lines max).
   - Line 2: company · location · remote type (icon-led, as on Airtasker).
   - Line 3: salary with provenance ("€60–75k · employer" vs "not stated").
   - Trailing column: match band pill (e.g. "Good match"), age ("3 d"), bookmark.
   - When deduped: a small "3 sources" stack indicator. If an application already exists: an "Applied" status chip instead of the bookmark.
7. **Actions**:
   - **Leading swipe**: Save / Unsave (toggle, as on GitHub).
   - **Trailing swipe**: "Not for me" (full swipe allowed) + "More".
   - **Context menu**: Save, Not for me…, Hide all from {company}, Open original posting, Share.
   - Dismissing collapses the row, and an inline undo row replaces it: "Hidden · Undo · Tell us why" (Zomato).
   - "Tell us why" opens the **reason sheet** (Grab): multi-select reasons (Location, Salary, Seniority, Role/skills, Company, Already applied, Duplicate/expired, Other + optional note), with **Skip** and **Save reason** at equal weight.
   - A light haptic fires on dismiss and save.
   - Apply is in the job detail (sticky bar). It isn't a row action, because applying needs the Apply sheet (§4.4).
8. **Detail navigation**: tapping a row pushes Job detail on the native stack. Prev/next isn't offered on iOS (back-swipe is the native idiom).
9. **Saved searches management**: Jobs → toolbar "Saved searches" opens a list styled like Glassdoor job alerts. Each row has name, criteria summary (Realtor.com), cadence ("Daily digest · Good+"), and a new-match badge. Swipe to delete, with an Undo toast (eBay).
10. **Dismissed jobs** stay recoverable: Saved searches screen → "Hidden jobs" list, with an unhide swipe.

## Decision — Desktop (macOS + Windows)

**Layout:** app sidebar (Jobs selected) | **list column** (min 340 px, default 400 px, resizable) | **detail panel** (flex, min 480 px). At window widths under ~980 px (half-screen Snap on 1920 px), the detail becomes a pushed view with a back button (Mercor's collapse/expand controls inform the toggle). The list keeps its scroll position and selection.

1. **Sidebar**: under "Jobs", saved searches appear as nested items with new-match counts (eBay), plus a "Hidden" item with a count (Wrangle). They're reorderable, and right-click opens Edit / Alert settings / Delete.
2. **Filter bar** (spans list + detail, one line at ≥ 1200 px, wraps to two lines below):
   - Left to right: search field (`/` or ⌘F / Ctrl+F) · "Use my preferences" toggle (Remote) · pills `Location`, `Remote`, `Salary`, `Seniority`, `Posted`, `Match`, `Source` · `More filters (n)` · `Clear all` · right-aligned **`Save search`** primary (Zillow).
   - Active pills are filled and show value or count ("Remote: Hybrid", "Location (3)") (Turo/Juicebox).
   - Each pill opens a **popover** with search where lists are long (country/timezone, as on Remote), "Reset", and a live **"Show 42 jobs"** button (Turo). Esc closes; Enter applies.
3. **Save search** saves immediately. The button turns into "Saved · Edit alert", and a popover opens with Name, Alert cadence and Notify threshold (Zillow/Glassdoor). The saved-search editor also offers digest time and an optional end date (Perplexity).
4. **List column**: header "128 jobs · Sort: Best match ▾". Rows use the same anatomy as iOS, with a selected-row accent outline (Mercor). An optional "Dense" view mode shows one-line evidence ("Matches: React, TypeScript · Missing: German B2") with matched terms highlighted (Juicebox/Pin).
5. **Row actions** on hover and focus: Save, Not for me, Open original ↗. "Not for me" hides the row optimistically and shows a toast "Hidden · Undo · Why?" (6 s). "Why?" opens a reason popover anchored to the toast: number keys 1–8 toggle reasons, Enter saves, Esc skips.
6. **Keyboard** (every shortcut listed in the native menu bar and the shortcuts sheet; ⌘ on macOS, Ctrl on Windows):

   | Key | Action |
   |---|---|
   | J / K or ↓ / ↑ | Move selection |
   | Enter | Focus detail |
   | S | Save / unsave |
   | D or ⌫ | Not for me |
   | Shift+D | Not for me with reason |
   | A | Apply (opens Apply sheet) |
   | O | Open original posting |
   | ⌘/Ctrl+Z | Undo last hide/save |
   | ⌘/Ctrl+S | Save search |
   | F | Focus filter bar |
   | / | Focus search |

7. **Zero results** (Zillow): "No jobs match all of these filters." The active filters appear as removable chips with the count each would add back (when the backend can compute it cheaply), plus "Remove all filters". Saving the search stays available ("Get alerts when jobs like this appear").
8. **Platform styling**:
   - **macOS**: selection uses the system accent in the list (source-list style) and the hidden-inset title bar, with the filter bar in the toolbar region.
   - **Windows**: Fluent-style pills, Segoe UI Variable, and a title bar overlay with the filter bar directly below it.

## Components needed

- `JobRow` (comfortable / dense variants; states: default, selected, saved, applied, hidden-undo placeholder, loading skeleton)
- `MatchBandPill` (band label + optional numeric; shared with job-detail)
- `SourceStackIndicator` ("3 sources", tooltip listing the source names)
- `SalaryText` (range + currency + provenance: employer / source estimate / not stated)
- `SearchField` (iOS native search bar; desktop field with `/` hint)
- `SavedSearchScopeChips` (iOS) / `SidebarSavedSearchItem` (desktop, with count badge)
- `FilterChip` (iOS: opens sheet) / `FilterPill` (desktop: opens popover); `FilterSheet` / `FilterPopover` with `ShowResultsButton` (live count) and `Reset`
- `SegmentedBandPicker` (Minimum match), `RangeSliderWithInputs` (salary), `MultiSelectList` with search (location, timezone, source)
- `ActiveFilterSummary` (removable chips + Clear all; reused in zero-results)
- `SaveSearchBanner` (iOS toggle) / `SaveSearchButton` + `SaveSearchPopover` (desktop)
- `SavedSearchEditor` (name, criteria summary, cadence, threshold, digest time, end date, delete)
- `SavedSearchRow` (management list)
- `DismissReasonSheet` (iOS, medium detent) / `DismissReasonPopover` (desktop, number-key toggles)
- `UndoToast` / inline `HiddenRowPlaceholder`
- `SwipeActions` config (leading save, trailing not-for-me + more), `RowContextMenu`
- `SplitView` with resizable divider, collapse/pop-out, narrow-width push fallback
- `ResultHeader` (count + sort menu + ranking ⓘ)
- `EmptyResults` (zero-result with relaxable filters)
- `KeyboardShortcutHint` (desktop tooltips + shortcuts sheet entries)

## Copy notes

Tone: calm and supportive. Never "rejected", "failed" or "you don't qualify". Dismissal is the user's choice about fit, not a verdict on them.

| Key | EN | TR (draft) | DE (draft) | Note |
|---|---|---|---|---|
| Dismiss action | Not for me | Bana uygun değil | Passt nicht für mich | DE is about 40% longer than EN. Swipe actions need icon + short label; fall back to the icon when it doesn't fit. |
| Dismiss toast | Hidden. Undo · Why? | Gizlendi. Geri al · Neden? | Ausgeblendet. Rückgängig · Warum? | Keep "Why?" optional. Never prompt modally. |
| Reason sheet title | What didn't fit? | Ne uymadı? | Was hat nicht gepasst? | The subtitle explains the benefit: "We'll use this to tune your matches." |
| Reasons | Location · Salary · Seniority · Role or skills · Company · Already applied · Duplicate or expired · Something else | Konum · Maaş · Kıdem · Rol veya beceriler · Şirket · Zaten başvurdum · Kopya veya süresi dolmuş · Başka bir şey | Ort · Gehalt · Erfahrungsstufe · Rolle oder Skills · Unternehmen · Schon beworben · Doppelt oder abgelaufen · Etwas anderes | The enum must match `dismiss_reason` in `packages/core`. |
| Save search banner | Get alerts for this search | Bu arama için bildirim al | Benachrichtigungen für diese Suche | — |
| Saved toast | Search saved · Edit | Arama kaydedildi · Düzenle | Suche gespeichert · Bearbeiten | — |
| Cadence options | As they arrive · Daily digest · Weekly · Off | Geldikçe · Günlük özet · Haftalık · Kapalı | Sofort · Tägliche Übersicht · Wöchentlich · Aus | — |
| Threshold | Notify me for: Strong matches / Good and above / All | Bildirim: Güçlü eşleşmeler / İyi ve üstü / Tümü | Benachrichtigen bei: Sehr passend / Gut und besser / Alle | — |
| Zero results | No jobs match all of these filters. Try removing one. | Bu filtrelerin hepsine uyan ilan yok. Birini kaldırmayı deneyin. | Keine Stellen passen zu allen Filtern. Entferne einen davon. | Address the user as du/sen. To be confirmed by ux-copy review (open question). |
| Filter apply | Show 42 jobs | 42 ilanı göster | 42 Stellen anzeigen | Pluralisation via ICU (TR has no plural inflection on the noun). |
| Ranking info | Sorted by match, then newest. Scores are a rough guide, not a prediction. | Önce eşleşmeye, sonra tarihe göre sıralı. Puanlar kabaca bir rehberdir, tahmin değildir. | Nach Passung, dann Datum sortiert. Werte sind eine grobe Orientierung, keine Vorhersage. | — |

General:

- Pills and chips must wrap or truncate with a tooltip. No fixed widths.
- Test DE in the filter bar at 1280 px, and in the iOS chip row with the largest Dynamic Type size.
- Dates are relative ("3 d", "3 g", "3 T") with the absolute date in the tooltip / accessibility label.

## Open questions

1. **Band thresholds and the "Best match" sort.** This proposal sorts by band, then recency inside a band, so 1–2 point differences don't reorder results. Needs agreement with the matching implementation in `packages/core` (CoreDomain / M4).
2. **`dismiss_reason` taxonomy.** Is it multi-select (an array) or a single value? The Grab pattern argues for an array. Company-level mute ("Hide all from Acme") also needs a profile-level blocklist field that isn't in §6.2 yet.
3. **Live result counts** in filter sheets/popovers need a cheap count query against `users/{uid}/jobs`. Firestore `count()` aggregation per keystroke may be costly. Fallback: count on popover open plus on debounce.
4. **Zero-result relax hints** ("+12 if you remove Salary") need per-filter counts. Ship v1 with plain removable chips if that's too expensive.
5. **Saved-search push threshold default** (Good+?) and the digest time default (09:00 local?), to be confirmed with the user at the M0 design checkpoint.
6. **Inline profile questions in the feed** (Glassdoor "Do you have this skill?") were rejected for v1. Revisit if match quality needs more signal.
7. **Hidden jobs retention:** how long do dismissed jobs stay recoverable, and do they still count toward the dedupe fingerprint (so they don't resurface from another source)?
