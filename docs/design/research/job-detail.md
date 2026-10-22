# Research: Job detail + match explanation (core screen)

## Scope

Brief §5.3 row **"Job detail + match explanation"**. This is one of the 5 core screens for the M0 design checkpoint (§5.6).

- **iOS** (platform `ios`): job detail screen.
- **Desktop** (platform `web`, used for macOS and Windows): job detail panel (the right pane of the Jobs split view; see [`job-feed-search.md`](./job-feed-search.md)).

The screen must show (§4.3):

- the **match score 0–100**, with **"why it matches"** and **"gaps"**
- **source attribution**: every source link kept after dedupe
- the **apply CTA**
- the job actions save / dismiss.

We also studied how scores and explanations can be shown **without implying false precision**.

Method: Mobbin MCP, fixed `task_intent` ("Design a cross-platform job search, CV builder and application tracker app") and `output_destination: "code"` on every call, one screen/flow per query, `mode: "deep"`. Results were judged from the images. The user's saved Mobbin collections are website sections only (kickoff.md), so none apply here. No images were downloaded or committed.

Data this screen renders (BRIEF §6.2):

- `job { source, source_id, url, apply_url, apply_email, company, title, location, remote_type, salary range, description, posted_at }`, with all source links kept after dedupe
- `job_match { score, reasons, gaps, state, dismiss_reason }`

Matching pipeline (§4.3): hard filters → skill/keyword overlap → embedding similarity. An **LLM rationale is generated only for the top N** matches.

## References — iOS

### Job detail screen (11 examined: 10 screens + 1 flow; 4 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Glassdoor | Job detail: qualifications | https://mobbin.com/screens/921438d0-7396-4229-b2c8-c77da85b000d | A "Your qualifications for this job" card. Under "Do you have any of these qualifications?", each skill has ✓ / ✕ buttons and the list ends in "Show more". A **sticky bottom bar** holds a bookmark icon and a full-width "Apply Now". | The user can correct the match from the gap list ("I have this"). The sticky bar keeps Apply one thumb-tap away while reading. |
| Handshake | Job detail: "You're a great fit" | https://mobbin.com/screens/55662361-2d29-4c48-9eea-2eff7e407b82 | A qualitative headline ("You're a great fit — You match all qualifications") with matched chips (✓ Senior, ✓ major). Then **"Matching is based on your profile. Update profile ✎"**. The sticky bar pairs "Save" with "**Apply externally ↗**". | A label instead of a number. It discloses what the match is based on and links to change it. The external-link icon is honest about leaving the app. |
| LinkedIn | Job detail header | https://mobbin.com/screens/d3894e49-560b-4417-8fee-7a1c8171d39a | Header order: source/company logo → title → meta line ("United States · 1 month ago · Over 100 applicants") → status line → outlined chips (Remote, Contract) → primary Apply + secondary Save side by side. The description truncates with "…more". | A compact, readable header hierarchy. Chips for work mode and contract type survive translation. |
| LinkedIn | Flow: Turning on a job alert (from detail) | https://mobbin.com/flows/b730dfa2-4562-4fec-bc2c-9d7b01dd6271 | A "Set alert for similar jobs" toggle with a criteria subtitle ("Data Specialist, United States") inside the detail. Toast: "Your job alert was created. Manage alerts". | Lets the user create a saved search from a job they like without leaving the screen. We borrow only this row; the Premium upsell blocks on the same screen are rejected. |

### Match score and explanation (10 examined, 3 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Credit Karma | Build your credit: factors | https://mobbin.com/screens/f219b700-6dda-470f-acba-1f5be7c431c9 | Each factor is a card: category label ("Payment history"), a **qualitative impact tag** ("HIGH IMPACT", "MEDIUM IMPACT"), a plain-language headline, and the evidence ("You've made 45 on-time payments in a row"). The section header counts factors ("6 factors"). | The best model for "why it matches": impact buckets instead of numeric weights, and every claim backed by evidence. |
| Chime | Your credit score | https://mobbin.com/screens/99aa4c7c-4b04-4d73-9804-152654f478a1 | The number is shown with its range ("741/850"). Below it: **provenance and freshness** ("Updated 2/17/26 from Experian data"), a **segmented band bar** with a dot inside a band, and "What goes into FICO Scores? ›". | The band bar puts the number in context so it reads as "which zone", not "exact rank". The provenance line and explainer link build trust. |
| LinkedIn | Premium job match (AI) | https://mobbin.com/screens/a5106481-73be-431c-b34e-35f223acc577 | An **AI disclaimer** ("This AI feature is in beta and may make mistakes. Learn More"). A requirement count ("Matches 0 of the 13 required qualifications"), with each gap followed by **evidence in parentheses** ("(No mention of SOPs)"). | Counts plus evidence are verifiable. The disclaimer is the right honesty level for LLM output. **Rejected aspect:** the copy "you may want to … look for jobs that are a closer fit" is discouraging. Our tone must stay supportive. |

### Source attribution (8 examined, 3 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Google TV | "More services" sheet | https://mobbin.com/screens/8f6266c9-2a8b-4ece-a798-d05ac93730ad | Every service that has the same title: logo, name, "Watch now", and an **external-link icon** on each row that leaves the app. | Our dedupe "Found on" list: one job, every source, each clearly marked as an external link. |
| Linktree | "Listen on" sheet | https://mobbin.com/screens/036737b6-ee5e-46b2-9d4e-02c801254e54 | A bordered row per platform with an ↗ icon, then "Show more", then a **disclosure footnote** ("These links may earn … affiliate revenue"). | A collapsed list with "Show more", plus a footnote that explains where the links come from. |
| Roku | "Connect to watch" | https://mobbin.com/screens/3d269858-0fdb-450c-850d-f4469dce60b4 | Sources are **grouped by how you access them** ("Watch now · Free" vs "Requires subscription"). | Maps to grouping by apply route: "Direct from employer" (ATS/company site) above "Job boards" (aggregators). The direct route is preferred for applying. |

## References — Desktop (web → macOS + Windows)

### Job detail panel (10 examined, 6 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Glassdoor | Job detail panel | https://mobbin.com/screens/4efa3859-c0dc-4b63-be2d-d329909a99c2 | Header: company → title → fact chips (location, salary with "(Employer provided)"). Then a primary "**Apply on employer site**", a bookmark, and an overflow menu. A tinted "Is your resume a good match?" block follows, then a "Your qualifications for this job" two-column checklist with "Edit", then "Do you also have these qualifications?" with ✓/✕. | A layout we can adopt almost directly. The checklist with user correction is the model for "why it matches + gaps". |
| Upwork | Job detail: qualifications & activity | https://mobbin.com/screens/7073cd30-6d06-4ec6-9ad1-67844538f2c0 | "Preferred qualifications: Location: Europe, Americas" with a small red **ⓘ mismatch marker** inline. "Activity on this job" lists simple facts. | A hard-filter mismatch is flagged inline next to the fact, not in a separate alarm. |
| Contra | Job detail with right rail | https://mobbin.com/screens/48e661e0-64f0-4234-8f5c-f5c8bf8a5628 | The main column holds title, company, posted date and description. A **right rail "Details" card** holds budget, duration, a full-width Apply, and tags. Apply also appears at the top. | When the panel is wide, key facts plus Apply stay visible in a rail while the description scrolls. |
| Uxcel | Job board posting | https://mobbin.com/screens/af99aea0-7b57-49ba-8e6a-a56a3d422c97 | A dense one-line meta row ("ASMOB • New • Remote | United States, Singapore, United Kingdom Only • Contract • Junior • $60k–$85k • Just now"). "Apply Now" next to a **flag icon (report)**. A company card with "Visit website ↗". | The "Remote, but only in these countries" phrasing is critical for our TR/EU/UK/US markets. Report sits next to Apply. |
| Braintrust | Job detail: skills | https://mobbin.com/screens/54f6fa50-4236-4c13-9ff6-d872ca061136 | "Top skills / Other skills" chips, where **skills the user has get a ★ and a tint** and the others stay neutral. | Shows skill overlap at a glance without percentages. |
| Remote | Job: workplace location | https://mobbin.com/screens/938a8e45-7292-4832-9587-78ede2b065eb | Facts as plain questions: "How will they work? Remote", "Where are you hiring? +/− 2 Singapore (+08:00)", "**Visa sponsorship offered? No**", "How often is travel required? Never". | Our hard filters (remote, location/timezone, authorization) as human questions. "Not stated" can be an explicit answer. |

### Match explanation panel (12 examined: 10 + 2 from the split-view query; 5 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Workable | "How Cindy matches this job · AI" | https://mobbin.com/screens/16a43e2d-47e6-40f8-9aef-43b70ca53116 | A collapsible section with a small score ring and an "AI" tag. One line explains the basis: "AI Screening Assistant identified the following matching **job criteria from the job description**". Criteria are grouped (Education / Experience / Skills), with ☑ for met and ☐ for not met. A footer reads "Criteria not relevant? Edit". | Gaps and matches live in **one checklist** grouped by kind. The source of the criteria is named, and it's collapsible (progressive disclosure). |
| Juicebox | "Why we matched this profile" | https://mobbin.com/screens/21dff3ec-2d97-4c0d-b1ed-7bfa944d86d6 | Each criterion is a bold statement with a "👍 Good Match" tag and a **one-paragraph evidence** quote from the profile. The right rail has "Profile 1/236" with ← → navigation and Skip. | Evidence per reason makes the AI output checkable. Prev/next supports keyboard triage. |
| Wrangle | Candidate card with criteria | https://mobbin.com/screens/6c237e82-6834-432d-87f5-17ea5ed042e6 | Criteria are grouped by **importance** ("Very important" / "Important"), each expandable to its evidence. The card ends with a **Hide | Shortlist** action pair. | Importance groups convey weight without numbers. Our hard filters map to "Must have" and skills to "Important". |
| Braintrust | "Invite matched talent": match label | https://mobbin.com/screens/4c9b09e2-da0b-444d-943d-3e5d4a904e12 | A **"Great match ▾" label pill** instead of a number, with matched skill chips (★). | Confirms that a label-first presentation works in a dense list or header. |
| Employment Hero | Candidates with match-score legend | https://mobbin.com/screens/353dde78-9c66-419b-8168-01b61f9fa722 | Scores are bucketed into **coloured ranges** (100–51 %, 50–26 %, 25–0 %) shown as a legend. | Supports banding. **Rejected aspects:** colour as the only cue (fails WCAG 1.4.1), "%" (reads as a probability), and three uneven buckets. |

### Source attribution (8 examined, 3 kept)

| App | Screen / flow | mobbin_url | What we borrow | Why |
|---|---|---|---|---|
| Tripadvisor | Hotel: "View prices" by provider | https://mobbin.com/screens/3274a3af-5813-4595-8a9d-4e845c9bccfa | One row per provider (logo, condition, price, "View deal"), then "**View all 9 deals from $122 ▾**", then a footnote: "Prices are provided by our partners … Please see our partners for more details." A separate "**Visit hotel website**" link sits in the header. | The direct route (employer/ATS) is separate from aggregators. The collapsed "View all N" keeps the panel short. The footnote explains that details may differ. |
| KAYAK | Hotel: Prices tab | https://mobbin.com/screens/7449881d-c5fc-4fdd-9766-11d622f9729d | Variants show per provider (Expedia, priceline) with their own price and "View deal", plus "Show 6 more deals". | When sources disagree on a field (salary, location wording), show the field **per source row** instead of hiding the conflict. |
| Klarna | Offers from several stores | https://mobbin.com/screens/4786a4a1-77e7-42a0-a794-792120c9c20f | Per-seller rows show seller name, listing title, shipping and price. Sellers with official status carry an **"Apple Authorized" badge**. | A badge for the authoritative source: "Direct from employer" on ATS and company-site rows. |

## Findings: showing a score without false precision

What the references show (judged from the images):

- **Bare big numbers mislead.** These present a single large percentage as the result: Deezer "65 %", Ahead "84 %", User Interviews "100% match", Uxcel's coloured 25 / 94 / 47 table. They read as probabilities or exam grades and invite 1-point comparisons. All are rejected (below).
- **Trustworthy scores carry context.** Chime pairs the number with its range (/850), a band bar, its data source and an update date. Credit Karma drops the total entirely in favour of factor cards with impact tags.
- **Labels beat numbers in lists.** Braintrust ("Great match"), Handshake ("You're a great fit") and Juicebox ("Good Match" per criterion) use words. Workable shows a small ring but puts the reasons one click away.
- **Counts are honest.** "Matches 0 of the 13 required qualifications" (LinkedIn) and Workable's checklist are countable, verifiable facts. The score summarises them; it doesn't replace them.
- **AI output is labelled.** LinkedIn ("in beta and may make mistakes") and Workable ("AI" tag + "criteria not relevant? Edit") label it and let the user correct it.

Our rules (both platforms):

1. **Band first, number second.** There are four bands, with provisional thresholds (see Open questions):
   - **Strong match** (80–100)
   - **Good match** (65–79)
   - **Partial match** (45–64)
   - **Stretch** (< 45)

   Lists show the band pill. The integer appears in the accessibility label and tooltip, and in the dense desktop mode. The detail shows "72 of 100" as a secondary caption.
2. **Never use "%"**, never show decimals, never animate a count-up, never use a hero gauge. "of 100" makes clear it's a scale, not odds.
3. **Use a segmented band bar** (Chime) with a marker inside the band. Every segment has a text label so colour isn't the only cue.
4. **Show the basis and freshness** under the score: "Based on CV 'Product Designer (EN)' and your preferences · updated 2 h ago · Change CV". This matters because the score is computed against the selected CV (§4.3).
5. **Explain the score with counts and evidence, not weights.** Example: "Requirements: 4 of 5 met · 1 not stated". Skills show as matched/unmatched chips. Factors carry "Matters most / Matters some" tags (Credit Karma, Wrangle). Each LLM reason or gap includes a short evidence quote from the posting or the CV (Juicebox, LinkedIn).
6. **"Not stated" is not a gap.** If the posting doesn't mention salary or visa status, show it as "Not stated", neutral and separate (Remote's Q&A facts).
7. **Gaps are actionable and correctable.** Use "I have this" (it updates the profile and triggers a re-score, as in Glassdoor ✓/✕ and Workable "Edit") and "Add to CV…" (opens CV Studio). Never suggest adding a skill the user doesn't have; that's the user's call.
8. **The AI summary is labelled** ("AI summary · can be wrong") and has 👍 / 👎 feedback. Jobs outside the top N get no AI summary. Their computed factors still show, with a line: "A written summary is created for your top matches."

## Examined but rejected

| App | mobbin_url | Reason |
|---|---|---|
| Upwork (iOS detail) | https://mobbin.com/screens/50bdddfb-021b-4b1a-9600-694b81066a54 | Marketplace currency noise ("Connects") dominates the header. The sticky Apply/Save bar is already covered by Glassdoor and Handshake. |
| Airtasker (task detail) | https://mobbin.com/screens/89320b33-8943-470e-98a5-8a5d3449aff8 | A status stepper and price hero suit a gig marketplace, not a job posting. |
| Jobber | https://mobbin.com/screens/1717a0a9-386f-4bfc-a4f6-3d9550db0778 | A field-service work order (invoices, signatures), not a posting. |
| Coursera (career page) | https://mobbin.com/screens/eeff9249-5d32-4384-affc-c2e16cedcd96 | A career-path marketing page with gradient banners and course upsell. |
| Apple Books (edition details) | https://mobbin.com/screens/06c1cbd3-818a-40fa-862c-9864c45939ac | A nice icon + label metadata list, but its full-sheet presentation hides the parent. Remote's Q&A facts cover the same need with job semantics. |
| Expensify | https://mobbin.com/screens/a11073eb-a41e-4a0f-980a-200663ca29ee | A settings overview, not relevant. |
| Peerspace | https://mobbin.com/screens/791bc888-96a7-4032-9fb5-79bf79883afc | A description editor, not a reader. |
| Paired | https://mobbin.com/screens/0c0db80e-08a9-4640-8bf8-182e748af0fe | A decorative heart gauge with no scale or explanation. |
| Ahead | https://mobbin.com/screens/061ce41f-838f-469a-aec3-f1509357c2e2 | A hero "84 %" with no context: false precision. |
| ChatGPT (quiz score) | https://mobbin.com/screens/b8a33273-2ac1-4d6f-b901-0e27d77cbc0e | An exam grade ("8 / 10") framing. Job matching must not feel like a test the user failed. |
| Riot Mobile | https://mobbin.com/screens/b4116f8d-3f99-42c1-a796-619c5652c061 | A game stats table that's competitive in tone. |
| Coursera (quiz results) | https://mobbin.com/screens/3c98d923-55ce-45a4-b972-b1ef6d3104e1 | Correct/Incorrect cards: a judgemental red/green verdict. |
| Deezer | https://mobbin.com/screens/9ae16e4b-afdb-477f-b48a-5958e520c1be | A hero "65 %" with jokey copy: false precision, wrong tone. |
| Crypto.com | https://mobbin.com/screens/1c57b956-5cc1-4478-8ade-3e0eb835cff7 | Quiz review with ✕/✓: same issue as Coursera. |
| Zocdoc, Setel, Careem, Angi, Mercedes-Benz, Google Health, Agoda | https://mobbin.com/screens/673214b0-cade-48bc-90ba-aa18f1a3152b · https://mobbin.com/screens/fc006999-955b-4705-b221-d1fd99d5bb98 · https://mobbin.com/screens/4444f177-3491-4ae7-b84d-b488d80c81f9 · https://mobbin.com/screens/79459363-9904-465d-9499-c4cd10d104a3 · https://mobbin.com/screens/c9b8e5a3-bcdf-4416-8661-bf827c54e512 · https://mobbin.com/screens/832aa4e6-0928-4571-a9b3-aa01bcca8c2e · https://mobbin.com/screens/171b3f99-a0b3-4e02-a2fc-e11f0187b5f3 | Provider *choosers* for different offerings, not one item available from several sources. (Skyscanner, from the same query, is kept in job-feed-search.md.) |
| Prime Video, Tubi, Sonos, Orbit, Weverse | https://mobbin.com/screens/7092ac4b-348f-4d63-934d-3e2512179425 · https://mobbin.com/screens/3cfb8876-7c4a-4e24-bc5a-d199a19557bf · https://mobbin.com/screens/09abd5fa-e34b-4e71-92b9-6fe42efe1bc4 · https://mobbin.com/screens/a759f7af-d765-4ebd-acaa-43018378b1c9 · https://mobbin.com/screens/07a741f9-218f-4150-989e-800533542fac | Purchase options, device casting, or account connection, not source attribution. |
| Care.com | https://mobbin.com/screens/83492096-4242-44ef-8822-a68e57e4d8f9 | Employer-side edit view. Checkmarks show requirements, not the user's match. |
| Wellfound | https://mobbin.com/screens/1849d727-5a1d-456e-a12c-85637418373f | Employer listing management with promotion upsell and a gamified "87 % complete" ring. |
| Workable (job preview modal) | https://mobbin.com/screens/5de525e6-9fb0-44eb-9291-187da3b48d5e | A modal preview blocks the list, which breaks keyboard triage in the split view. |
| Mercor (detail with application checklist) | https://mobbin.com/screens/db3c0878-3d38-4b6c-a469-c9c776872bef | Kept for the split layout in job-feed-search.md. Its application-progress checklist belongs to the Apply flow, not job detail. |
| Mercor ("Check candidate fit" modal) | https://mobbin.com/screens/cc76e01c-5d2e-4547-96ee-7790faf4ce1a | A celebratory "Great match!" modal for a referral programme. Modal interruption, no evidence. |
| User Interviews | https://mobbin.com/screens/f96f209f-76b9-44ec-93a9-064c73d448ee | "100% match" as a bare field: maximum false precision. |
| Uxcel (screening table) | https://mobbin.com/screens/77c59f96-3d72-4179-90e3-7d7ead5acd11 | Raw coloured numbers (25 / 94 / 47) with no explanation. Colour-only meaning. |
| Pin (criteria rows) | https://mobbin.com/screens/df5484d2-1528-41d6-ab83-2a791577e05b | Kept for list rows in job-feed-search.md. As a detail layout it repeats the list without hierarchy. |
| Turo, Workable (job boards), Expedia, Preply, Relevance AI | https://mobbin.com/screens/748110d0-2bd8-43e4-a66f-137f77c442e7 · https://mobbin.com/screens/cb95c66d-a842-4e73-bf64-656fdc2dd720 · https://mobbin.com/screens/0acc80e5-9379-414f-a883-e4fb5920ccbe · https://mobbin.com/screens/2bc08d44-af44-4514-84e8-23a31de91eeb · https://mobbin.com/screens/ce0e3dc8-63e0-494b-8a90-9749de7aeec3 | Not multi-source listings of one item: map results, a paid job-board catalogue, add-ons, tutor cards, a marketing comparison. |

## Decision — iOS

The job detail is **pushed on the Jobs native stack** (also reachable from Today, Tracker and push notifications).

1. **Navigation bar**: back, then the Share button and a "More" (•••) menu: Not for me…, Hide all from {company}, Open original posting, Report a problem (wrong details / expired / looks like a scam; Uxcel's flag). The title collapses into the bar on scroll.
2. **Header** (LinkedIn order):
   - company logo (or monogram)
   - **title** (Dynamic Type Title 2, wraps)
   - company · location · posted ("3 d ago")
   - outlined chips: work mode, employment type, seniority
   - salary with provenance ("€60–75k · from employer"; "Salary not stated" in secondary text).
3. **Match card** (progressive disclosure):
   - Band pill ("Good match"), the **segmented band bar** with its marker, and the caption "72 of 100".
   - Basis line: "Based on CV 'Product Designer (EN)' · updated 2 h ago" with a **Change** button. Change opens a CV picker sheet and re-scores optimistically, with a "Recalculating…" state.
   - **Summary counts**: "4 of 5 requirements met · 6 of 9 skills · 2 gaps".
   - Top 3 "Why it matches" lines and top 2 "Gaps to consider" lines, each one sentence with an impact tag.
   - **"See full breakdown"** opens a sheet (large detent) with:
     - **Requirements**: location, remote, work authorization, salary, seniority. Each is ✓ met / ○ not stated / △ outside your preferences, with the posting phrase as evidence (Upwork inline marker, Remote Q&A).
     - **Skills**: matched chips tinted with a check, unmatched chips neutral (Braintrust).
     - **AI summary** (top N only): a paragraph plus evidence quotes, labelled "AI summary · can be wrong", with 👍 / 👎.
     - **Gaps** with "I have this" and "Add to CV…".
     - A "What goes into this score?" link (Chime) to a short explainer.
   - **Score pending**: skeleton plus "Working out your match…". It never shows 0.
   - **No CV selected**: "Pick a CV to see how this fits" with a CV picker.
4. **Facts** (Remote Q&A style, a list with leading SF Symbols): Work mode · Where they hire (countries/timezones, "Remote · EU only") · Visa sponsorship · Relocation · Employment type · Salary · Last seen (when the job was last confirmed live at a source). Unknowns read "Not stated".
5. **Description**: plain text from the posting, truncated to about 12 lines with "Show more" (LinkedIn). Headings and lists from the source are kept.
6. **Found on** (sources):
   - Grouped as **"Direct from employer"** (ATS/company site, with a badge; Klarna/Roku) above **"Job boards"**.
   - Each row: source name/logo, posted date at that source, any field that differs (e.g. a different salary, as on KAYAK), and an ↗ external link (Google TV).
   - Collapsed after 3 rows: "Show all 5 sources" (Linktree/Tripadvisor).
   - Footnote: "Collected from public job sites. Details can differ between sources."
   - The row used for applying carries a "Used for Apply" tag.
7. **Similar jobs alert**: a "Get alerts for similar jobs" toggle with a criteria subtitle (LinkedIn flow). It creates a saved search; the toast reads "Alert created · Edit".
8. **Sticky bottom bar** (Glassdoor/Handshake): a bookmark toggle (Save, with haptic) and a full-width primary **Apply**. Apply opens the Apply sheet (§4.4). The button label reflects the route:
   - "Apply" (email / in-app prep)
   - "Apply on company site ↗"
   - "Apply on {board} ↗"
   - If an application exists, the bar becomes **"Applied · 12 Oct — View in Tracker"**.
   - Dismissed state: a banner "Hidden from your feed · Undo".

Accessibility:

- The match card's VoiceOver label reads like "Good match, 72 of 100. 4 of 5 requirements met. 2 gaps."
- The band bar is decorative to VoiceOver.
- Impact tags are text, not colour-only.
- The bottom bar respects the safe area and the largest Dynamic Type size (the label wraps to 2 lines, the bar grows).

## Decision — Desktop (macOS + Windows)

The **detail panel** is the right pane of the Jobs split view. It can also pop out into its own window (⌘/Ctrl+Shift+O), following Mercor's ⤢ control.

1. **Panel top bar**: ↑/↓ (prev/next, also J/K), pop-out, and close-detail (Esc returns focus to the list) (Juicebox, Mercor).
2. **Header** (Glassdoor):
   - Company → title → fact chips (location/remote scope as in Uxcel "Remote · EU only", employment type, seniority, salary + provenance).
   - Action row: **Apply** (primary, `A`; label reflects the route, as on iOS) · Save (`S`) · Not for me (`D`; toast with Undo + Why?) · Open original ↗ (`O`) · ••• (Hide company, Report a problem, Copy link).
   - Tooltips show the shortcuts. The native menu bar lists them under "Job".
3. **Two-column body when the panel is ≥ 760 px** (Contra):
   - **Main column**: match section → description → company.
   - **Right rail** (280 px, sticky): a Details card (salary, work mode, where they hire, visa, relocation, employment type, last seen; "Not stated" explicit), the **Found on** list, and a second Apply button.
   - Below 760 px the rail folds into a facts grid under the header, and Found on moves to the end.
4. **Match section** (Workable collapsible, open by default for Strong/Good and collapsed to its summary line for Partial/Stretch):
   - Summary row: band pill, segmented band bar, "72 of 100", basis line with a CV switcher dropdown, and summary counts.
   - **Requirements** checklist in two columns (Glassdoor), each item with an evidence tooltip.
   - **Skills** chips (Braintrust ★ tint).
   - **Why it matches** factor cards with impact tags (Credit Karma), each with an evidence quote (Juicebox). The AI summary has its label and 👍 / 👎.
   - **Gaps to consider** with "I have this" / "Add to CV…" buttons.
   - "What goes into this score?" link.
   - Optional "Highlight my skills in the description" toggle (Juicebox highlighting), off by default.
5. **Found on**: the same grouping and rows as iOS, inside the rail. Each row's link opens in the default browser (`shell.openExternal`), never inside Electron.
6. **States**: loading skeleton for header + match; score pending; no CV; source-unreachable notice on a source row ("Couldn't reach this source on 21 Oct. The listing may have closed."); applied state (the action row shows "Applied · View in Tracker"); hidden state (banner with Undo).
7. **Platform styling**:
   - **macOS**: panel background uses the window background with a hairline divider. Optional vibrancy in the rail.
   - **Windows**: Mica on the shell only; the panel stays opaque for legibility. Focus rings are visible on every action (keyboard-first).

## Components needed

- `JobDetailHeader` (logo/monogram, title, meta line, `FactChip`s, `SalaryText`)
- `DetailActionBar` (desktop) / `ApplyBar` (iOS sticky; states: default, applied, hidden, offline-disabled with reason)
- `ApplyButton` (label from the apply route: email / company site / board; ↗ when external)
- `MatchSummaryCard` (band pill, `MatchBandBar`, numeric caption, basis line + CV switcher, summary counts, pending/no-CV states)
- `MatchBandBar` (4 labelled segments + marker; decorative to assistive tech)
- `MatchBandPill` (shared with the feed `JobRow`)
- `MatchBreakdown` (iOS sheet / desktop inline section)
- `RequirementChecklist` (met / not stated / outside preferences + evidence)
- `SkillChips` (matched / unmatched)
- `FactorCard` with `ImpactTag` ("Matters most" / "Matters some")
- `AISummaryBlock` (label, disclaimer, evidence quotes, 👍/👎 feedback)
- `GapRow` ("I have this", "Add to CV…")
- `ScoreExplainer` (sheet/popover: "What goes into this score?")
- `FactsList` (Q&A style; "Not stated")
- `DescriptionText` (sanitised source HTML → native text, Show more, optional skill highlighting)
- `SourcesList` + `SourceRow` (group headers "Direct from employer" / "Job boards", direct badge, differing-field note, "Used for Apply" tag, ↗) + `SourcesFootnote`
- `SimilarJobsAlertToggle`
- `ReportProblemMenu`
- `DetailPanelNav` (prev/next, pop-out, close) and `DetailRail` (desktop)
- `HiddenBanner` (Undo)

## Copy notes

Tone: calm, supportive, honest. The score is a **fit estimate against your CV and preferences, not a prediction of your chances**, and the copy must say so where the number appears. Gaps describe the posting versus the CV and never judge the person.

| Key | EN | TR (draft) | DE (draft) | Note |
|---|---|---|---|---|
| Band: strong | Strong match | Güçlü eşleşme | Sehr passend | — |
| Band: good | Good match | İyi eşleşme | Gut passend | — |
| Band: partial | Partial match | Kısmi eşleşme | Teilweise passend | — |
| Band: stretch | Stretch | Biraz uzak | Eher entfernt | Never "Low", "Poor" or "Weak". Needs native review. |
| Score caption | 72 of 100 | 100 üzerinden 72 | 72 von 100 | No "%". |
| Score explainer | A rough guide to how this job fits your CV and preferences. It isn't a prediction of your chances. | İlanın CV'nize ve tercihlerinize ne kadar uyduğuna dair kabaca bir rehber. Şansınızın tahmini değildir. | Eine grobe Orientierung, wie gut die Stelle zu deinem Lebenslauf und deinen Wünschen passt. Keine Vorhersage deiner Chancen. | — |
| Basis line | Based on CV "{name}" · updated {time} · Change | "{name}" CV'sine göre · {time} güncellendi · Değiştir | Basierend auf Lebenslauf „{name}“ · aktualisiert {time} · Ändern | DE uses „…“ quotes. |
| Section | Why it matches | Neden uygun | Warum es passt | — |
| Section | Gaps to consider | Göz önünde bulundurulacaklar | Mögliche Lücken | Avoid "Missing" and "Eksik" as headings. |
| Gap item | Not in your CV yet: {skill} | Henüz CV'nizde yok: {skill} | Noch nicht in deinem Lebenslauf: {skill} | — |
| Gap actions | I have this · Add to CV… | Bu bende var · CV'ye ekle… | Habe ich · Zum Lebenslauf hinzufügen… | DE "Zum Lebenslauf hinzufügen" is about 2.2× EN. Buttons must wrap or stack. |
| Requirement | Not stated | Belirtilmemiş | Nicht angegeben | — |
| Requirement | Outside your preferences: {detail} | Tercihlerinizin dışında: {detail} | Außerhalb deiner Wünsche: {detail} | — |
| Impact tags | Matters most · Matters some | En önemli · Biraz önemli | Wichtigster Faktor · Teilweise wichtig | — |
| AI label | AI summary · can be wrong | YZ özeti · hatalı olabilir | KI-Zusammenfassung · kann Fehler enthalten | — |
| Non-top-N note | A written summary is created for your top matches. | Yazılı özet en iyi eşleşmeleriniz için hazırlanır. | Eine schriftliche Zusammenfassung gibt es für deine besten Treffer. | — |
| Pending | Working out your match… | Eşleşme hesaplanıyor… | Passung wird berechnet… | — |
| Sources | Found on {n} sites | {n} sitede bulundu | Auf {n} Seiten gefunden | ICU plural. |
| Sources group | Direct from employer · Job boards | Doğrudan işverenden · İş ilanı siteleri | Direkt vom Arbeitgeber · Jobbörsen | — |
| Sources footnote | Collected from public job sites. Details can differ between sources. | Herkese açık iş sitelerinden toplandı. Ayrıntılar kaynağa göre değişebilir. | Aus öffentlichen Jobseiten gesammelt. Details können je nach Quelle abweichen. | — |
| Apply | Apply · Apply on company site · Apply on {board} | Başvur · Şirket sitesinde başvur · {board} üzerinden başvur | Bewerben · Auf der Firmenseite bewerben · Über {board} bewerben | — |
| Applied | Applied {date} · View in Tracker | {date} tarihinde başvuruldu · Takipte gör | Beworben am {date} · Im Tracker ansehen | — |
| Hidden | Hidden from your feed · Undo | Akışınızdan gizlendi · Geri al | Aus deinem Feed ausgeblendet · Rückgängig | — |

Formality: TR uses **siz** and DE uses **du**, consistent with job-feed-search.md. Confirm in the ux-copy pass.

## Open questions

1. **Band thresholds** (80 / 65 / 45 proposed) need calibrating against real score distributions once matching lands (M4). Should the numeric score appear on list rows at all, or only in detail and dense mode? The current proposal is detail and dense mode only.
2. **Structured reasons and gaps:** the brief's `job_match.reasons` / `gaps` need a structured shape for this UI: `{ kind: requirement | skill | experience | other, label, status: met | not_stated | outside_prefs | gap, impact: most | some, evidence?: { from: posting | cv, quote } , source: rule | ai }`. To be agreed with CoreDomain in `packages/core` zod schemas.
3. **Explanations outside the top N:** should non-top-N jobs offer an on-demand "Write a summary" (one LLM call per tap, user's Anthropic key)? The brief only specifies top-N generation. The default proposal is no on-demand call in v1.
4. **"I have this"** writes to which profile field (skills list on `users/{uid}` vs the selected CV)? Re-scoring cost and latency need confirming.
5. **Per-source differing fields** (salary, location wording, posted date) require keeping per-source snapshots after dedupe. Confirm the `users/{uid}/jobs/{jobId}` shape supports `sources[]` with per-source fields and `last_seen_at`.
6. **Apply route preference order** (direct ATS → company site → `apply_email` → aggregator): needs confirming with the Apply research (ResearchApply).
7. **Visa sponsorship / relocation facts** are often unstated or only in free text. Is LLM extraction acceptable here, with an "AI" marker on the fact?
8. **Jobs that fail a hard filter** (reachable via search or a deep link): show them with an "Outside your preferences" notice (proposed) or keep them hidden?
