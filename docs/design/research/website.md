# Website: design research

Research date: 2026-10-22. Sources: the user's saved Mobbin collections (`get_collection_contents`, sections) and Mobbin MCP `search_sections` (`task_intent`: "Design a cross-platform job search, CV builder and application tracker app", `output_destination: "code"`). Every reference below was judged from its image. No images are committed; open the `mobbin_url` to view.

## Scope

Brief §5.3 row **Website** (`search_sections`): hero, features, how it works, download CTA, FAQ, changelog, footer, legal page. Pages planned from §4.10: **Home, Features, Download, Changelog, Privacy Policy, Terms, Support**. One extra query covers the Support page's contact block.

| Matrix entry | Query | Examined | Kept |
|---|---|---|---|
| hero | "hero section for a productivity app with download buttons" | 8 + 2 saved | 5 + 2 saved |
| features | "features section" | 8 + 5 saved | 4 + 5 saved |
| how it works | "how it works section with numbered steps" | 8 + 1 saved | 4 + 1 saved |
| download CTA | "download section with platform options for Mac, Windows and iPhone" | 8 | 5 |
| FAQ | "FAQ section" | 8 | 5 |
| changelog | "changelog section with release notes" | 8 | 5 |
| footer | "footer" | 8 | 3 |
| legal page | "privacy policy page with table of contents" | 8 | 5 |
| support (extra) | "contact section with support options" | 6 | 3 |

Product requirements (§4.10): Astro static site sharing the app's design tokens; Download detects the OS, links directly to the latest release assets **with checksums** and includes the TestFlight link; Changelog is rendered from GitHub Releases; the Privacy Policy must describe mail data handling accurately (Google OAuth consent screen and App Store both link to it); rebuilt on every release; Lighthouse ≥ 90 in all four categories. Kickoff: hosted on Firebase Hosting at `bruteforcehr.web.app`; binaries in the public `Savas07/bruteforcehr-releases` repo; Windows builds are **unsigned** for now (SmartScreen warning accepted); iOS ships through **TestFlight internal** testing; languages EN / TR / DE.

### User saves (outrank search results)

All 11 saved items are website sections tagged "Features"; none carry comments. Mapping to our page sections:

| Collection | Site · section | `mobbin_url` | Maps to |
|---|---|---|---|
| FEATURES SECTION | Apple · iPhone Duo product hero (centered title, subtitle, availability line, dark + outline CTA pair, device photo) | https://mobbin.com/sites/sections/1821ad0f-876c-4aeb-b42a-508e791d98a3 | **Home hero** |
| FEATURES SECTION | Apple · "Whatever shape your day takes." feature cards with bold lead-in captions under each image | https://mobbin.com/sites/sections/b53be87c-ff28-4814-8d2d-7d2427af674f | **Features page** spotlight captions |
| FEATURES SECTION | Apple · "Get the highlights." card carousel with pager + play control | https://mobbin.com/sites/sections/b19b0a8e-541f-40a9-b4a7-83fc32c3c86c | **Home** highlights strip (pattern only; see Decision for the carousel caveat) |
| FEATURES SECTION | Beside · "And it's all one system" 3 × 4 icon + title + one-line grid, "Soon" badge | https://mobbin.com/sites/sections/f343155a-ddb6-4225-b3fd-34179e696fb7 | **Home / Features** capability grid |
| FEATURES SECTION | Berd · left copy block + stacked, overlapping cards on the right | https://mobbin.com/sites/sections/46db817d-12e1-4e7f-afd0-e802294027f3 | **Features page** CV-variants spotlight (stacked CV cards) |
| FEATURES SECTION | Calendly · eyebrow + centered two-line heading + row of product cards with icon labels and a short bold-lead caption | https://mobbin.com/sites/sections/c4e62478-feca-4e26-b52d-ae0a6d56f212 | **Home** "pillars" row (Jobs · CVs · Tracker · Mail) |
| DESIGN | Givingli · editorial display type, small caps eyebrow, three-column mini-feature row split by hairlines, mono numerals in a card, dark pill CTA | https://mobbin.com/sites/sections/895ec2d9-c97f-4779-9772-4103531eb470 | Visual language: type scale, hairline dividers, mono figures |
| DESIGN | Agentcard · 3 × 2 grid of big mono "fact" headings ("10 min", "0 calls") + title + description, ruled cells | https://mobbin.com/sites/sections/216b089f-9491-498c-a4d6-eaab0e230cd4 | **Home** trust facts grid |
| MENU BAR | Serus · floating pill nav (logo, dropdown menus, Log in, primary pill CTA) above a centered hero and a phone / desktop / watch bento | https://mobbin.com/sites/sections/7fd02b57-a187-4d62-86bf-9c8fb0764f72 | **Site header** on every page; device bento for the Home hero media |
| ANIMAÇÕES | Cloudstudio · "Our toolkit" drag-and-throw physics tags in a dark canvas | https://mobbin.com/sites/sections/e7cc2489-78f8-41fa-8d70-f8d239a2a8f7 | Motion: one playful, optional moment (job-source chips) |
| EFEITOS ROLAGEM | Cloudstudio · "01 — 02 — 03" scroll chapters with side dot nav, copy left, diagram right | https://mobbin.com/sites/sections/681234c7-3cdc-4509-bf5f-e6303ef87379 | **How it works** scroll chapters |

## References

The website has one platform (Mobbin `search_sections`); each table lists search results kept alongside the saves above.

### Hero

| App | Section | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Apple (saved) | Product hero | https://mobbin.com/sites/sections/1821ad0f-876c-4aeb-b42a-508e791d98a3 | Centered name + one-sentence value line + small availability line + primary/secondary pair, then product media full width. | User save. Short centered stack survives 375 px without reflow tricks and leaves room for TR/DE. |
| Serus (saved) | Hero under pill nav | https://mobbin.com/sites/sections/7fd02b57-a187-4d62-86bf-9c8fb0764f72 | Device bento below the hero (phone, desktop, plus one detail tile), each with a small label chip. | User save. We ship on iPhone + Mac + Windows; a bento shows all three without a carousel. |
| Spline | Download-first hero | https://mobbin.com/sites/sections/3bf8e20b-ba8a-464a-a774-bb107f225557 | One OS-detected primary button ("Download for Mac") plus a quiet text link "Also available for Windows". | One decision, not three equal buttons; the other OS is still one click away. |
| ClickUp | Desktop hero | https://mobbin.com/sites/sections/bfe2a759-6322-49ef-bb82-c3c344d7ed87 | Primary download button with the OS glyph, "or" divider, and a secondary path below. | Maps to "Download for Mac — or — Get it on iPhone (TestFlight)". |
| Notion | "Notion for Mac & Windows" | https://mobbin.com/sites/sections/cb72bb32-3166-4fa2-ae6c-55819d0f5108 | Two OS screenshots overlapping (macOS + Windows window chrome). | Shows Windows users the app is native for them too. |
| heyclicky | App hero | https://mobbin.com/sites/sections/094777f8-c8ee-470a-a7e3-00914f5aec3e | The small requirement line under the buttons ("100% free. sonoma 14.2 or higher"). | Sets expectations before the click; we use "Free · macOS 13+ · Windows 10/11". |
| Granola | Closing CTA in window frame | https://mobbin.com/sites/sections/19b2aff3-28e8-4855-98c9-588e9085e307 | Calm closing CTA ("Ready for calmer … meetings?") with Mac + Mobile buttons inside a framed window. | Closest tone match: supportive, not hype. Used as the Home closing CTA. |

### Features

| App | Section | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Beside (saved) | Icon grid | https://mobbin.com/sites/sections/f343155a-ddb6-4225-b3fd-34179e696fb7 | 3-column icon + title + one line; a "Soon" badge for later milestones. | User save. Scannable overview of ~12 capabilities; collapses to 1 column at 375. |
| Calendly (saved) | Product cards row | https://mobbin.com/sites/sections/c4e62478-feca-4e26-b52d-ae0a6d56f212 | Icon label above each card, mini UI vignette, bold-lead caption. | User save. Four pillars (Jobs, CV Studio, Tracker, Mail) each get one card. |
| Apple (saved) | Captioned feature cards | https://mobbin.com/sites/sections/b53be87c-ff28-4814-8d2d-7d2427af674f | Caption pattern "**Bold lead.** Explanation." under media. | User save. Lead-ins make each spotlight skimmable. |
| Berd (saved) | Copy + stacked cards | https://mobbin.com/sites/sections/46db817d-12e1-4e7f-afd0-e802294027f3 | Overlapping stack of cards beside a short copy block. | User save. Natural metaphor for CV variants (one base CV, several tailored versions). |
| Agentcard (saved) | Mono fact grid | https://mobbin.com/sites/sections/216b089f-9491-498c-a4d6-eaab0e230cd4 | Large mono headline per cell + title + sentence, hairline grid. | User save. Lets us state trust facts plainly ("0 messages sent without you", "3 languages"). |
| Linear | "An experience you'd expect from a professional tool." | https://mobbin.com/sites/sections/940a02f4-40af-4d1c-a41e-0a4d48d9ecf4 | Icon + title + two-line description cards: "Works offline", "Keyboard first design", "Light and dark UI". | Same product qualities we promise (offline outbox, ⌘K, dark mode). |
| Linear | Bento with mini visuals | https://mobbin.com/sites/sections/2754727c-0d9b-426e-8f87-f3bf560afda4 | 3 × 2 cards, each with an abstract UI fragment above the label. | Gives Features page density at 1440 without screenshots that go stale. |
| Notion | Feature pairs | https://mobbin.com/sites/sections/a77697bc-0916-488e-b7af-8bc3b303c68d | 2-column vignette + title + one line, then a centered "And yes, we have …" add-on. | Pattern for the "Save from anywhere" (share sheet / paste URL) add-on. |
| Intercom | Feature list + preview | https://mobbin.com/sites/sections/fe15fe44-d336-4234-9780-e70800155eb1 | Left list of features with an active marker, preview pane on the right. | Features page at 1440: Tracker / Mail / CV sub-features without a carousel. Becomes stacked sections at 375. |

### How it works

| App | Section | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Cloudstudio (saved) | Scroll chapters | https://mobbin.com/sites/sections/681234c7-3cdc-4509-bf5f-e6303ef87379 | "01 — 02 — 03" chapter indicator, copy left, diagram right, side progress dots. | User save. The three-minute onboarding is literally three chapters: sign in with a code → import CV → connect mail / pick sources. |
| Railway | Vertical numbered steps | https://mobbin.com/sites/sections/35a42526-d3b6-4e26-abf7-47667d6e7479 | Circled numbers joined by a vertical line, title + one sentence each. | The static fallback for the chapters (375 px, reduced motion, no JS). |
| Beside | Mono-numbered columns | https://mobbin.com/sites/sections/2cfd3169-f61f-4ca5-bd2a-67627febbc84 | Mono "01/02/03" labels, short title, one-line explanation, three columns. | Same family as the saved Beside grid; the 768 layout. |
| Clay | Step cards with CTA | https://mobbin.com/sites/sections/28c16d19-1b1c-4c38-b06e-660c77901cbc | "[1]…[4]" cards in a row with one CTA under the heading. | Keeps a single "Get started" action next to the steps. |
| Function | Step panel with checklist | https://mobbin.com/sites/sections/7c72acdf-c8a3-425c-b7a6-2e0c487bb17c | "STEP 01 · …" eyebrow, checklist of what the step includes, media on the right. | Each chapter lists concrete inputs (PDF, DOCX, JSON Resume, LinkedIn export). |

### Download CTA / Download page

| App | Section | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Linear | Download page | https://mobbin.com/sites/sections/b99fe27f-0826-490b-8dee-8fb256bfc740 | OS-detected primary button with a check note ("Optimized for Apple Silicon"), then a full table of every build (macOS Apple silicon / Intel, Windows x64 / Arm) with per-row Download. | Exactly our structure: detection for the common case, explicit asset rows for everyone else; rows are where checksums go. |
| hilos | Per-platform cards | https://mobbin.com/sites/sections/b01fcb69-642b-42c6-97f8-7e5d8530c390 | "Join the beta on TestFlight" button, "Requires the TestFlight app" note, QR code to scan from desktop, and a meta line "Version 0.1.6 · macOS 13 or later · Apple silicon & Intel". | The only reference that handles a TestFlight beta honestly; the meta line is our version/requirements line. |
| Craft | Grouped platform card | https://mobbin.com/sites/sections/a0b7540c-22d4-479f-830b-eede4bd022b2 | Detected primary on top, then "Desktop" and "Mobile" cards with one row per platform and right-aligned actions. | Grouping by device class reads well at 768 (two cards side by side). |
| Norma | Compact rows | https://mobbin.com/sites/sections/526de761-73ae-46b3-8b55-ce9cfbb67cb4 | Row = icon, platform name, requirement + file type ("macOS · .dmg"), Download button. | Minimal row anatomy for 375. |
| SpaceXAI | Detected + "More downloads" | https://mobbin.com/sites/sections/8fbfb8c7-f192-480e-83f8-f38e263f1595 | One detected row plus a "More downloads · Other platforms and devices" row. | Home-page download CTA that links to the full Download page. |

### FAQ

| App | Section | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Notion | Single-column accordion | https://mobbin.com/sites/sections/6c304a17-56d1-4f33-9818-d6cd696d2d1d | Hairline-separated questions, `+` / `×` affordance, answers with inline links. | Native `<details>`/`<summary>`: accessible, no JS, works at every width. |
| Frontify | Title left, accordion right | https://mobbin.com/sites/sections/d6c24906-086c-425a-812e-40978ca0f4a2 | Two-column split at desktop widths. | The 1440 layout; collapses to the Notion layout below 1024. |
| illoca | Title + contact under it | https://mobbin.com/sites/sections/5ad2eb0a-5b35-4e4b-8116-264da3499b3a | A contact chip under the FAQ title ("hello@…"). | Every FAQ ends with a human way out. |
| The New Yorker | Jump-to-section FAQ | https://mobbin.com/sites/sections/329d49e3-27e8-4a57-9838-d6089bf4ea8a | "Jump to a section" link list, grouped questions with answers always visible. | Support page: grouped (Install, Accounts & sign-in, Mail, Data & privacy), deep-linkable answers. |
| KÖPPEN | Category nav + grouped accordions | https://mobbin.com/sites/sections/b9d24a1f-d51f-449f-9339-8ce651d124ae | Group headings above each accordion block. | Group labels for the Support FAQ. |

### Changelog

| App | Section | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Campsite | Release entry | https://mobbin.com/sites/sections/0e673dd5-adea-480e-992a-2de645e1082a | Sticky date column left, notes right with "Other improvements" / "Fixes" subheads, "Changelog RSS" button. | 1440 layout; subheads map to conventional-commit groups in GitHub release notes; Astro can emit an Atom feed at build time. |
| Notion | Compact dated list | https://mobbin.com/sites/sections/a85703b4-636f-407a-8b4f-cade72d6f909 | Mono date + title rows, "All changes →". | Home "What's new" teaser and the changelog index at 375. |
| Webflow | Typed entries | https://mobbin.com/sites/sections/c3a47c94-10b6-49d1-a185-07412555d56a | Small type badge (Added / Improved) above the title, bullets, pagination. | Badge doubles as our **Beta** marker for pre-releases (beta channel). |
| Slack | Grouped by month with labels | https://mobbin.com/sites/sections/5526ccb6-fe5f-4751-83d0-1b428214fbcd | Month headings; per-item label column with an accent rule. | Month grouping once there are many releases. |
| 1Password | Release card header | https://mobbin.com/sites/sections/ba760091-e0c8-489e-8826-435fce697e87 | Header bar "Updated to 2.7.0 on February 2 2023" with a platform chip. | Version + date are the anchor of every entry; all platforms share one version, so the chip reads "All platforms". |

### Footer

| App | Section | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Framer | Column footer | https://mobbin.com/sites/sections/0ed1a996-1689-4e67-b065-1d50b4211db0 | Logo + link columns, bottom bar with © and legal links. | Standard, predictable; legal links must be one click from every page (OAuth + App Store reviewers). |
| Dovetail | Mono column labels | https://mobbin.com/sites/sections/bc5302dd-40da-4974-9ca8-8ee93fccf2fb | Small mono uppercase column labels, generous rows, a CTA pair above the columns. | Matches the mono accents from the saved Givingli/Agentcard sections. |
| Samara | Contact in footer | https://mobbin.com/sites/sections/20212988-f6cd-4353-8e0a-67b6bb69e7da | "Have questions? Contact us" block beside the link columns; tiny legal row. | Support is reachable from every page. |

### Legal page (Privacy Policy, Terms)

| App | Section | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Surfshark | Policy with plain-language callouts | https://mobbin.com/sites/sections/82df47cd-8373-4a72-9ff5-dd751b07f51b | Each section opens with a highlighted plain-language summary ("framed explanations aren't legally binding"); TOC column on the right. | Trust principle: mail-data handling explained in one sentence before the legal text. |
| folk | Sticky left TOC | https://mobbin.com/sites/sections/fe50db8b-8c6b-4eb4-a9a9-64e23b207ec1 | Sticky numbered TOC on the left, big title, numbered `h2`s. | 1440 layout; numbers make sections citeable in support replies. |
| OpenPhone | Title + revision date | https://mobbin.com/sites/sections/8df6f2a5-d998-4061-aa9e-5c875d30ac50 | Revision date pill under the title; line offering an accessible alternative format. | Effective date is required context; the accessibility line is cheap goodwill. |
| Skillshare | Update notice + inline TOC | https://mobbin.com/sites/sections/7123e604-c885-45fb-866f-d27e756fabc6 | "We've updated our Privacy Policy" banner above the title, effective date, inline TOC. | Pattern for announcing policy changes; inline TOC is the 375 layout. |
| Wise | Nested numbered TOC | https://mobbin.com/sites/sections/94d4416e-762e-40f3-9edf-8c94ad639673 | 1 / 2.1 / 2.2 nested numbering. | The mail section needs sub-items (Gmail, Microsoft, IMAP). |

### Support (contact block)

| App | Section | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| monday.com | Channel tiles + Top FAQs | https://mobbin.com/sites/sections/0b855102-708f-423c-87c7-3811ee8b6ca5 | "Get in touch / Select how you would like to contact us" tiles, then Top FAQs accordion. | The Support page structure: answers first or contact first, both above the fold at 1440. |
| Fluz | "More options" rows | https://mobbin.com/sites/sections/0af4a382-ba43-4bdf-be0a-bec23369121e | Rows with an inline action ("Copy" next to the email address, "Learn" next to Help Center); support hours block. | A Copy button for the support address avoids `mailto:` failures on machines without a mail client. |
| Framer | Primary + secondary contact cards | https://mobbin.com/sites/sections/2f7cfbe5-48cd-4c87-976a-84a8910fb569 | One large primary card, smaller secondary cards, and an "All systems operational" status line. | Hierarchy for one main channel (email) plus secondary (GitHub issues, release notes); status line is an open question. |

## Examined but rejected

| Site · section | `mobbin_url` | Reason |
|---|---|---|
| Notion · "Download the Notion desktop app" | https://mobbin.com/sites/sections/35ebbbe6-a636-4e4d-b1fc-fe494ff2b3f7 | Huge 5-line headline pushes the CTA down at 375 and would wrap worse in German. |
| Rive · Downloads hero | https://mobbin.com/sites/sections/c9f9e8fe-1fe7-4a48-9ce8-e191cba49af2 | Two equal OS buttons with no detection; we want one primary. |
| Craft · "Get Started Now!" | https://mobbin.com/sites/sections/4e363497-beed-4917-9f40-2ddee269fb2c | Three equal-weight buttons + exclamation tone; kept Craft's download grouping instead. |
| ClickUp · feature carousel | https://mobbin.com/sites/sections/ef328045-5c23-425c-a4f8-44d0e14c40e7 | Horizontal carousel hides most cards; poor keyboard/screen-reader story. |
| Base · numbered card carousel | https://mobbin.com/sites/sections/754ce3a5-b6c1-40b9-a094-1b7efed9f807 | Same carousel problem; dark crypto styling off-tone. |
| Deta · "All in one place." | https://mobbin.com/sites/sections/27a05c64-4e5a-4ba5-adf9-ba893466d6e3 | Single large screenshot panel; goes stale quickly and carries little information. |
| Ploy · numbered 2 × 2 cards | https://mobbin.com/sites/sections/31946b32-847a-48d3-a968-1d7377c91212 | All-caps condensed display type breaks with TR/DE expansion (and Turkish dotted İ casing). |
| Trawelt · giant numerals | https://mobbin.com/sites/sections/629aae31-4a94-46df-a97f-3180a6ae22e0 | Numerals eat the viewport at 375; agency styling. |
| Titan · accordion steps | https://mobbin.com/sites/sections/0d103afa-c85e-4568-a98a-0a1e7cbd5e8f | Steps hidden behind toggles; three short steps should simply be visible. |
| ClassPass · circle-number steps | https://mobbin.com/sites/sections/193363c3-3373-49a5-a1d0-00ff01f07b4d | Heavy filled circles feel playful-consumer; too loud next to the calm tone. |
| Escape Cafe · condensed caps steps | https://mobbin.com/sites/sections/68d54554-65f5-4fd2-a974-c30e7c9eaffc | Condensed all-caps; localisation risk. |
| Pitch · equal download cards | https://mobbin.com/sites/sections/a9bb374d-37e1-4a34-a2b6-9c5d7698991e | Cards carry no version, requirements or file info. |
| Discord · illustrated download masonry | https://mobbin.com/sites/sections/2809158e-5935-4deb-9d2d-43c1fac39424 | Heavy imagery per platform, no asset details; hurts Lighthouse performance. |
| Hermes Agent · brutalist download tiles | https://mobbin.com/sites/sections/a8fd6457-2e45-4710-936b-1cde2309852d | Saturated blue + texture, low text contrast; off-tone. |
| Readymag · two-column pill accordion | https://mobbin.com/sites/sections/c9d4e91b-98a6-4405-b0a6-ab4c41b9fe5c | Two accordion columns misalign when one expands. |
| mymind · open 3-column Q&A | https://mobbin.com/sites/sections/5f365694-14c1-45e8-b144-4819c4417d8e | Friendly tone, but three long columns are hard to scan; New Yorker grouping covers "always visible". |
| mymind · Q&A intro | https://mobbin.com/sites/sections/4531c6c8-f12c-418b-ae56-3c972f8d4552 | Same layout as above. |
| OpenSea · developer changelog | https://mobbin.com/sites/sections/c5bbe792-42cb-4c0f-8462-29d9b9d9d12a | Author + "x days ago" metadata is noise for a personal tool; no version anchor. |
| Vercel · changelog timeline | https://mobbin.com/sites/sections/6e6109b1-9b59-4cae-8c51-d3cbcfa21b10 | Media-heavy entries; ours are text release notes. |
| Height · release post | https://mobbin.com/sites/sections/852d7b3a-60ba-4d89-bb09-5f65f0489294 | Newsletter signup; we run no mailing list. |
| Zellerfeld · giant wordmark footer | https://mobbin.com/sites/sections/18df6730-6569-49da-9c23-3bee32fbe638 | A screen-wide "BruteForceHR" wordmark would amplify the aggressive name against the calm tone. |
| GitHub Shop · footer with newsletter consent | https://mobbin.com/sites/sections/4c744eaa-6437-4e00-9d6b-56cb63d2c6ae | Marketing consent form; not applicable. |
| BAGGU · wordmark + social footer | https://mobbin.com/sites/sections/ddfad441-10db-4949-9baa-299e7e0edeee | Retail social strip; not applicable. |
| Shader · retro footer | https://mobbin.com/sites/sections/90f14e56-2133-4493-8249-8c4b284c06d8 | Novelty styling, low contrast. |
| SOTF · mono grid footer | https://mobbin.com/sites/sections/c6e14a19-78bb-4396-9a3d-387d3f996980 | Light-grey mono text fails contrast. |
| TIDAL · all-caps TOC | https://mobbin.com/sites/sections/362dfa6f-47fd-417a-a672-07f501e1c9cc | All-caps links are hard to read and break Turkish casing. |
| Upwork · legal hub sidebar | https://mobbin.com/sites/sections/628dc701-15b6-4444-9517-591272c30e8f | Sidebar for ~30 legal documents; we have two. |
| Slack · privacy hub sidebar | https://mobbin.com/sites/sections/511bdc26-1a98-40ae-a41c-fe9a881b9235 | Same: hub navigation for many policies. |
| Mural · team avatars contact | https://mobbin.com/sites/sections/0fcecfae-738f-4126-a206-12be20264116 | Implies a support team that doesn't exist; would be misleading. |
| Customer.io · illustrated contact cards | https://mobbin.com/sites/sections/0124b467-a7dd-4382-b070-af50c4d80443 | Sales / press channels we don't have; heavy illustration. |
| Grok · dark contact cards | https://mobbin.com/sites/sections/c92ec333-4a64-4fe9-98be-27beb1b105d1 | Low-contrast grey on black. |

Saved items used with limits: Apple "Get the highlights" (b19b0a8e) and Cloudstudio "Our toolkit" (e7cc2489) are kept as user saves, but their carousel / physics mechanics are reduced (see Decision) because carousels hide content and physics motion conflicts with `prefers-reduced-motion` and Lighthouse performance.

## Decision — iOS

The website has no native iOS surface; iPhone visitors get the 375 px layout below. When the detected OS is iOS/iPadOS, the Home hero and the Download page put the **iPhone (TestFlight)** row first, with the instruction "Install TestFlight, then open the invite sent to your Apple ID email" (TestFlight *internal* testing has no public join link; see Open questions). Desktop visitors see the same row with a QR code (hilos) that opens the Download page's iPhone section on the phone.

## Decision — Desktop (macOS + Windows)

No desktop-app screens here; desktop visitors get the 768 / 1440 layouts below. OS detection (`navigator.userAgentData.platform`, falling back to `navigator.userAgent`) picks the primary button: **Download for Mac** or **Download for Windows**, with "Also available for Windows / Mac and iPhone" as a text link (Spline). Browsers can't reliably tell Apple silicon from Intel (Safari reports Intel on both), so the Mac primary links to whichever single macOS build the pipeline ships (universal, if built) and the asset table always lists every macOS build. Windows rows carry a calm note about the SmartScreen warning for the unsigned build ("Windows may show 'Windows protected your PC'. Choose More info → Run anyway.") that disappears once a signing certificate exists. Without JavaScript, no button is pre-selected and the full asset table is shown.

## Decision — Web (375 / 768 / 1440)

Global: Tailwind default breakpoints (base = 375, `md` = 768, `xl` = 1280 → 1440 frame), content max width ≈ 72 rem centered at 1440, 20–24 px side padding at 375. Light/dark follows `prefers-color-scheme` with matching `theme-color` metas (already in `BaseLayout`). All interactive targets ≥ 44 × 44 px. Motion only via `prefers-reduced-motion: no-preference`; everything works without JS except OS detection, copy buttons and the scroll-chapter progress.

**Site header** (Serus, saved). 1440: floating pill bar — logo, Features, Download, Changelog, Support, language switcher (EN/TR/DE), primary "Download" pill. 768: same bar, links collapse into a "Menu" disclosure except the Download pill. 375: logo + Menu button; the menu is a full-width sheet listing all pages + language switcher. Skip link before the header.

**Home.**
1. Hero (Apple 1821ad0f + Spline + ClickUp): centered product name, one value line, OS-detected primary + secondary text link, requirement line (heyclicky). Below it the device bento (Serus): iPhone + Mac + Windows tiles. 1440: bento 3 tiles in a row; 768: phone + desktop side by side, Windows tile below; 375: single stacked column, phone first.
2. Pillars (Calendly, saved): Jobs · CV Studio · Tracker · Mail cards. 1440: 4 columns; 768: 2 × 2; 375: 1 column. No carousel (Apple "highlights" pattern rendered as a static grid).
3. How it works (Cloudstudio 681234c7, saved): three chapters (sign in with a code → import your CV → connect mail and pick sources). 1440: sticky chapter indicator "01 — 02 — 03" + copy left, visual right, progress driven by CSS scroll-driven animations where supported; 768: Beside three columns; 375 and reduced motion: Railway vertical step list.
4. Trust facts (Agentcard, saved; Givingli mono numerals): e.g. nothing is sent without your confirmation, your CV facts are never invented, every automatic change can be undone. 1440: 3 × 2 ruled grid; 768: 2 columns; 375: 1 column.
5. What's new (Notion a85703b4): latest 3 releases as mono date + version rows, "All changes →".
6. Closing CTA (Granola): calm sentence + Mac/Windows + iPhone buttons.
7. Footer.

**Features.** Spotlights alternate copy/media (Apple b53be87c captions with bold lead-ins; Berd stacked cards for CV variants; Intercom list + preview for Tracker statuses and Mail intelligence). 1440: Intercom-style list left / preview right; 768 and 375: each sub-feature becomes its own stacked block (title, caption, media). Capability grid (Beside, saved) at the end with "Coming in a later release" badges for features behind future milestones. The Cloudstudio physics tags (saved) become one optional moment: job-source chips (Remotive, Arbeitnow, Greenhouse, …) that settle into place once on scroll; static chip cloud with reduced motion.

**Download.** Built at deploy time from the latest GitHub Release in `Savas07/bruteforcehr-releases`.
- Top: version + release date + "Release notes" link; detected primary button with build note (Linear).
- Asset table (Linear rows + Norma anatomy): platform icon, name ("macOS (Apple silicon)", "Windows 10/11 (x64)"), file type + size, Download button, and a **SHA-256** with a Copy button (truncated with full value in the copy payload and a `<details>` reveal). 1440: table with columns; 768: Craft-style "Desktop" and "iPhone" cards side by side; 375: stacked rows, checksum on its own line in mono, wrap-anywhere.
- iPhone card (hilos): TestFlight steps, "Requires the TestFlight app", QR code on ≥ 768 only (hidden at 375 where the visitor is likely already on a phone).
- "How to verify a download" `<details>` with `shasum -a 256` (macOS) and `Get-FileHash` (Windows) one-liners.
- Pre-releases are not offered here; they appear on the Changelog with a Beta badge.

**Changelog.** One entry per GitHub Release, newest first, rendered from the release body (Markdown) at build time; Atom feed at `/changelog.xml` (Campsite RSS). Entry header: version, date, "Beta" badge for pre-releases (Webflow, 1Password header). 1440: sticky date/version column left, notes right (Campsite); 768 and 375: header above notes. Month grouping (Slack) once there are more than ~10 entries. Each entry has an anchor (`#v0-1-1`) so the desktop updater's "What's new" can deep-link.

**Privacy Policy and Terms** (shared legal layout). Title + effective date (OpenPhone), change notice banner when updated within 30 days (Skillshare), numbered sections with nested items (Wise), plain-language summary callout at the top of each section (Surfshark). 1440: sticky numbered TOC on the left (folk); 768 and 375: inline TOC under the title, `scroll-margin-top` for the sticky header. Body line length ≤ 75 characters. The Privacy Policy's mail section is subdivided (Gmail API, Microsoft Graph, IMAP/SMTP) and states what is read, what is stored, where (Firestore europe-west1), retention, how to disconnect and purge, plus Google's Limited Use disclosure for Gmail scopes.

**Support.** Contact first, then answers (monday.com). Primary card: email support with Copy button (Fluz) and expected reply window; secondary cards: report a bug (GitHub issue on the releases repo, if approved), release notes. Below: grouped FAQ (New Yorker "Jump to a section" + KÖPPEN group headings, Notion accordion rows using `<details>`), groups: Installing, Signing in, Mail accounts, Your data. 1440: FAQ in Frontify split (group title left, questions right); 768 / 375: single column.

**Footer** (Framer + Dovetail + Samara). 1440: logo + one-line description, columns Product (Features, Download, Changelog), Help (Support, Privacy, Terms), language switcher; bottom bar © year + "Made for job seekers". 768: 3 columns; 375: stacked groups, legal links always visible.

## Components needed

| Component | Used on | Notes |
|---|---|---|
| `SiteHeader` (pill nav + mobile menu sheet) | all | Disclosure button with `aria-expanded`; Esc closes; focus returns to trigger. |
| `SkipLink` | all | First focusable element. |
| `LanguageSwitcher` | header, footer | EN / TR / DE; links to the localized route, sets `hreflang`. |
| `SiteFooter` | all | Legal links always present. |
| `Hero` | Home | Slots for primary CTA, secondary link, requirement line, media. |
| `PlatformDownloadButton` | Home, Download | OS-detected label/href; no-JS renders a link to `/download`. |
| `DeviceBento` | Home | Static images with light/dark `<picture>` sources. |
| `PillarCard` | Home | Icon label, vignette, bold-lead caption. |
| `StepList` (vertical / columns) + `ScrollChapters` | Home | `ScrollChapters` is progressive enhancement over `StepList`. |
| `FactGrid` | Home | Mono figure + title + sentence; ruled cells. |
| `FeatureSpotlight` / `FeatureListPreview` | Features | List-preview at ≥ 1280, stacked below. |
| `CapabilityGrid` + `Badge` | Features, Changelog | Badge variants: "Coming later", "Beta". |
| `ReleaseMeta` (version · date · notes link) | Download, Changelog, Home | Single source from the GitHub Releases fetch. |
| `AssetRow` / `AssetTable` | Download | Platform, file type, size, Download, SHA-256. |
| `ChecksumValue` + `CopyButton` | Download, Support | Mono, wraps anywhere, copy confirmation via `aria-live`. |
| `TestFlightCard` + `QrCode` | Download | QR generated at build time (SVG). |
| `ReleaseEntry`, `ReleaseIndexList` | Changelog, Home | Markdown rendering of release bodies; anchors per version. |
| `LegalLayout`, `PlainSummary`, `LegalToc` | Privacy, Terms | Sticky TOC ≥ 1280. |
| `ContactCard` | Support | Primary / secondary sizes. |
| `FaqGroup` / `FaqItem` (`<details>`) | Support, Home | Deep-linkable `id` per question. |

## Copy notes

- Tone: calm, plain, supportive; the product name is loud, so copy stays quiet. No "crush your job hunt", no countdowns, no streaks. Lead with what the person gets ("Find jobs, tailor your CV and track every application"), then the reassurance ("Nothing is sent without your confirmation").
- CTAs name the outcome and platform: "Download for Mac", "Download for Windows", "Get it on iPhone (TestFlight)". Avoid "Get started" when the next step is a file download.
- Download notes are matter-of-fact: version, requirements, file size, checksum. SmartScreen copy explains the warning without alarm and names the exact buttons.
- Changelog: release notes are user-facing ("You can now…", "Fixed: …"); no internal ticket IDs.
- Legal: every plain-language summary is one or two sentences in second person ("We read only the messages needed to update your applications"), marked as a summary that doesn't replace the full text.
- Length expansion: plan for German ≈ +30 % and Turkish ≈ +20–25 % vs English. Buttons never fixed-width; headings allow 2–3 lines at 375; `hyphens: auto` (correct `lang` on `<html>` is required for it, already set by `BaseLayout`). Avoid all-caps (Turkish dotted/dotless i casing: "İ/I", "i/ı"); eyebrows use small sentence case. German compounds ("Bewerbungsverfolgung") must wrap inside cards at 375; nav labels stay one word where possible.
- Dates and sizes via `Intl.DateTimeFormat` / `Intl.NumberFormat` per locale (e.g. "22. Oktober 2026", "22 Ekim 2026"); version numbers never localized.

## Open questions

1. **TestFlight link.** Kickoff says TestFlight *internal* testing, which has no public join link (public links require external testing and Beta App Review). Should the iPhone card explain "invite only" with a request path, or will external testing be enabled later?
2. **Checksums source.** electron-builder's `latest*.yml` hold base64 SHA-512 values. Should the release pipeline also upload a `SHA256SUMS.txt` asset (preferred for `shasum` / `Get-FileHash` verification), or should the site display SHA-512?
3. **macOS build shape.** One universal `.dmg` or separate arm64 / x64 builds? Determines whether the Mac primary button can be a single link.
4. **Support channel.** Which support email address (no custom domain yet) and are GitHub issues on the public releases repo acceptable for bug reports?
5. **Status line.** Show a service status line on Support (Framer pattern)? It needs a public health endpoint on `/api/**`.
6. **Localized routes.** `/tr/…` and `/de/…` prefixes with English at `/` (current Astro i18n config) — confirm, and whether legal texts get TR/DE translations or stay English with a note.
7. **Brand assets.** Logo, favicon and app icon don't exist yet; the site currently ships none (a missing `/favicon.ico` costs a Lighthouse Best Practices console error until provided).
8. **Device imagery.** The bento needs real app screenshots; capture from the apps once the five core screens pass critique, light and dark variants.
