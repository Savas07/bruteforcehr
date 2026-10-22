# Insights: design research

Research date: 2026-10-22. Sources: Mobbin MCP `search_screens` (`task_intent`: "Design a cross-platform job search, CV builder and application tracker app", `output_destination: "code"`). The user's saved Mobbin collections only hold website sections (see kickoff), so none apply to this area. Every reference below was judged from its screenshot. No images are committed; open the `mobbin_url` to view.

## Scope

Brief §5.3 row **Insights**:

| Platform | Matrix entry | Queries run (mode) | Examined | Kept |
|---|---|---|---|---|
| iOS | analytics dashboard | "analytics dashboard screen with key metrics and weekly activity chart" (deep) | 10 | 5 |
| iOS | funnel chart | "funnel chart showing conversion between stages" (deep, 2 results); "conversion funnel analytics screen" (standard) | 12 | 5 |
| Desktop (`web`) | analytics dashboard | "analytics dashboard with funnel, breakdown by source and trend over time" (deep) | 10 | 8 |

Product requirement (§4.8): **funnel (applied → response → interview → offer), response rate by source, channel and CV variant, median time to first response, weekly activity**, all computed from `application_event` (Firestore `users/{uid}/applicationEvents`). Device roles (§4.1): Insights is desktop-heavy work, but every core action must also work on iOS. UX: calm (no guilt, no streaks or goals), trust (show where each number comes from), progressive disclosure.

## References

### iOS: analytics dashboard

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| TikTok | Analytics overview | https://mobbin.com/screens/ad1f5005-6af2-4946-955a-0ee0766e5b6f | A period chip row (7 / 28 / 60 / 365 days) and a 2-column grid of **selectable KPI tiles** where the selected tile drives the chart below. A "Traffic source" percentage list follows. | It's a compact way to show four KPIs and one chart on a phone without stacking four charts. The traffic-source list is the shape of our "response rate by source". |
| Linktree | Activity insights | https://mobbin.com/screens/68fe8d16-bd2d-4c83-a4c6-845962cb59e3 | A "Last 7 days" range chip + filter button, a headline KPI pair above the chart, and a Weekly/Daily granularity menu. | A minimal header pattern: the range is always visible and editable in one tap. |
| Brick | Weekly Activity | https://mobbin.com/screens/d9461048-177b-4fca-a15a-b68c669900d5 | A 7-day bar chart with a "Today" summary card. The empty-average state says "Your first day is underway. Check back for your average." instead of showing 0. | This is the calm insufficient-data pattern we need for medians and rates when there are few applications. |
| Strava | You → Progress | https://mobbin.com/screens/5189b97e-e26f-4946-b1b6-cafd7b6103f1 | A "This week" KPI trio above a 12-week line, and "See more of your progress" leading to the detail. | This-week summary + 12-week trend is exactly our weekly-activity block. |
| TIDE | Focus stats | https://mobbin.com/screens/16231482-0993-4c69-9043-aa44dd6a9655 | Comparison rows (This week / Last week) that say "No data" instead of showing a fake 0 or a −100 % delta. | An honest comparison when the previous period is empty, without a red delta. |

### iOS: funnel chart

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Squarespace | Analytics, "Purchase funnel" | https://mobbin.com/screens/afba20c0-88b2-4700-9a15-e1f331adbdae | Four-stage bars with the count above each stage and the **step-conversion % in the connector** between bars. | It's the only native mobile funnel in the set, and four stages fit the 375 pt width, which matches our 4-stage funnel. |
| Flighty | Aircraft Stats | https://mobbin.com/screens/9f050e55-0daf-4129-b251-8e6e8065f221 | A big headline number with a one-line definition ("Including sub-type variants…"), a metric segmented control (Flights/Time/Distance), and horizontal bars with right-aligned counts, ending in "Show more". | Horizontal bars with labels on the left read well at any Dynamic Type size. We use them for "response rate by source/channel/CV" and for the horizontal funnel at accessibility sizes. |
| Strava | Route Active Times | https://mobbin.com/screens/1e8b3bf1-ea80-4f7f-bb46-a551a690e6f5 | Each chart is titled with a **plain-language sentence** that states the takeaway ("Most people complete this route between 10 AM and 11 AM"), and the selected bar has a callout. | The sentence-as-title doubles as the VoiceOver summary and keeps interpretation calm and factual. |
| LinkedIn | Content analytics | https://mobbin.com/screens/7b9e2b5a-dd08-43dd-b90e-65c486638dc4 | A metric dropdown plus a **Cumulative / Daily** toggle and the provenance footnote "Daily data is recorded in UTC". | A cumulative view suits small numbers. The footnote is the trust pattern: say how a number is computed. |
| Substack | Post stats | https://mobbin.com/screens/b55d5015-2158-4643-9f3f-f25785b71837 | Card "Traffic sources — Views per source" with a subtitle that defines the metric, followed by a plain list. | A subtitle that defines each card avoids ambiguity ("response rate = replies ÷ applications sent"). |

### Desktop (`web`): analytics dashboard

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Mixpanel | Funnel report | https://mobbin.com/screens/647846ee-9587-4317-aecb-4abf5aece206 | A segmented range control (Today / 7D / 30D / 3M / 6M / 12M / Custom) plus Compare. Funnel bars are labeled with % *and* n. A table under the chart lists total conversion and time-to-convert per step. | Every rate is shown next to its count. The table under the chart is our place for median time per stage. |
| Squarespace | Sales → Purchase Funnel | https://mobbin.com/screens/3bde9ad6-c169-4bfb-bf23-a0f21090d263 | Vertical stage bars with **conversion chips between stages** (17 %, 80 %), placed in a tab of a larger analytics page. | This is the clearest desktop funnel at a glance. The connector chip makes step drop-off obvious without a second chart. |
| Amplitude | Funnel Analysis dashboard | https://mobbin.com/screens/6c9ff58e-4bfa-4587-830e-bf121f7012f0 | Chart cards **titled as questions** ("What is the conversion rate of this funnel?", "How long does it take users to convert?") and a short explanatory text column. | Question titles make each card's purpose obvious to a non-analyst. We use them for all four §4.8 metrics. |
| Hotjar | Funnel with summary chips | https://mobbin.com/screens/cdfb4fbd-9f44-4c6c-8cb9-6313d3509c2d | A summary strip above the funnel: "Overall conversion (all steps)" and "Avg. time to convert (all steps)". The range control works the same way as Mixpanel's. | It puts our two headline numbers (offer rate, median time to first response) directly above the funnel. |
| Calendly | Analytics → Routing funnel | https://mobbin.com/screens/e50d7744-9733-428b-b82d-b59928ed6298 | A **horizontal funnel**: stage label on the left, a bar with count, a shaded drop-off band with the step %, and a legend (Completed / Dropped off). | A horizontal funnel reflows from 320 pt to desktop, so one funnel component serves both platforms. |
| Navattic | Analyze → Step breakdown + Visitors | https://mobbin.com/screens/04592c4f-a76e-4176-8c36-6d2ef6f0ad51 | A step-bar chart with a hover tooltip, and a list with **inline proportional bars behind each row** plus a Top/Recent toggle. | Inline bars-in-rows show "by source / channel / CV variant" compactly and stay readable as a table. |
| Substack | Growth sources | https://mobbin.com/screens/fdb6af9f-47d2-4c75-b010-22a071f9d373 | Metric tabs above the chart, a 7-days range select, and a source table with **row checkboxes that choose which series are plotted** and a share % next to the count. | The user can compare two CV variants or sources on the trend chart without a query builder. |
| Peec AI | Sources | https://mobbin.com/screens/af0adc6a-5724-48eb-b464-aa24bfe2b400 | A filter-chip row (range, tags, models…), a sortable source table with rank, type pill, %, and an **Export** button. | Filter chips + sortable table + CSV export suit power use on desktop and match the Tracker table's export. |

## Examined but rejected

| App | `mobbin_url` | Reason |
|---|---|---|
| Shopee (iOS analytic) | https://mobbin.com/screens/29d03d9e-d3a1-4c4e-8a1a-7fd955a43934 | Red negative deltas ("−26") on every tile and a cartoon "Weekly Report" banner. Deltas on small numbers read as failure. |
| The Outsiders (iOS progress) | https://mobbin.com/screens/ee550909-e4d5-4508-83ec-8275853dbff9 | The week × day dot matrix is interesting, but every row carries a ±% change (−66 %, +84 %), which is goal-pressure framing. Dark, dense layout. |
| Oura (iOS goal completion) | https://mobbin.com/screens/ad161af2-69f4-4c28-b620-f7e291bbf23d | Goal-completion % (0–500 % axis) and athletic-performance framing. We set no goals. |
| BitePal (iOS statistics) | https://mobbin.com/screens/84615d97-7794-4d5b-96ff-ec6cbc03a5cf | Food logging metrics with a "Progress 0 kg" tile. It offers no transferable chart pattern. |
| LinkedIn (iOS weekly sharing tracker) | https://mobbin.com/screens/6216df0e-032a-473a-962a-2d58a68d5bf4 | "0 of 3 actions — take 3 actions to achieve the weekly goal". The exact guilt-driven gamification §5.4 bans. |
| Linktree, rate detail | https://mobbin.com/screens/68fe8d16-bd2d-4c83-a4c6-845962cb59e3 | Header kept (see above). "485.7 % Average click rate" on 7 views is rejected: we never show a rate without its n, and we suppress rates when n < 5. |
| Monarch (iOS cash flow) | https://mobbin.com/screens/6d5aa53f-23bc-4841-b084-7263e493bca4 | A stepper-paged story card, not a funnel. The paging hides data behind Next. |
| Shopify (iOS attribution) | https://mobbin.com/screens/5750de77-2b45-42d0-b568-aec8e33cd8c1 | A horizontally scrolling 4-column table on a phone, and the attribution-model jargon ("Last non-direct click"). |
| Public (iOS breakdown) | https://mobbin.com/screens/80326ed3-4cec-4479-91f9-07294ce77e1a | A single-segment donut (100 % "Other"). Donuts are poor for comparing rates. |
| MacroFactor (iOS paywall-style) | https://mobbin.com/screens/760e8d80-352b-445e-95a5-af3236b67c3e | A marketing slide with a chart inside a phone mock. Not a working analytics screen. |
| Alta (iOS during the week) | https://mobbin.com/screens/04cd0d2b-1873-469d-8e5e-ac8d01375715 | 100 % stacked bars per weekday with 5–7 segments. Unreadable with job-search sample sizes. |
| Posh (iOS analytics) | https://mobbin.com/screens/fe5b949b-d5a5-4fa7-a85b-9edfe9dc2a44 | Stacked "$0 / 0 / 0" tiles: an empty state made of zeros. We replace zeros with explanatory empty states. |
| Square (web purchase funnel) | https://mobbin.com/screens/905ec13f-0142-4303-b293-858d945dbb60 | A flat 0 % line on a 0–400 % axis plus a 24-column hourly table: it renders a chart when there's no data. A growth-tips banner pushes the user. |
| Steep (web conversion heatmap) | https://mobbin.com/screens/bdb5a0db-2595-432f-a1f2-ea1caff08619 | A daily heat-map table with segment pivoting. Analyst tooling, far beyond one person's job search. |
| Squarespace (web), trends chart detail | https://mobbin.com/screens/3bde9ad6-c169-4bfb-bf23-a0f21090d263 | Funnel kept (see above). The "Purchase Funnel Trends" hourly stacked area chart and the >100 % step chip (125 %) are rejected: confusing with re-entry and small samples. Our funnel is cohort-based, so steps can never exceed 100 %. |
| Mixpanel, query builder panel | https://mobbin.com/screens/647846ee-9587-4317-aecb-4abf5aece206 | Chart/table kept. The right-hand metric/step query builder is rejected: our funnel is fixed by the brief, so filters are enough. |
| Peec AI, donut + multi-line chart | https://mobbin.com/screens/af0adc6a-5724-48eb-b464-aa24bfe2b400 | Table kept. The multi-colored "Domain type" donut and five crossing lines are rejected as hard to compare and colorblind-unsafe. |

## Metric definitions (shared by both platforms; implemented once in `@bfhr/core`)

These definitions turn §4.8 into numbers. They're proposals; see Open questions.

- **Cohort:** applications whose `Applied` event falls inside the selected range. Every funnel stage counts applications that *ever reached* that stage, from their append-only `applicationEvents`, so step conversion is ≤ 100 % by construction (avoids the Squarespace >100 % artifact).
- **Response:** the first event after `Applied` that reflects a human decision by the employer: `Screening`, `Interviewing`, `Offer`, or `Rejected`. `Acknowledged` (automatic receipt) does **not** count as a response. `Ghosted`/`Withdrawn` are not responses.
- **Interview:** reached `Interviewing`. **Offer:** reached `Offer`.
- **Response rate by source / channel / CV variant:** responses ÷ applications in the cohort, grouped by the job's source (connector or "Alert email"/manual), the apply channel, and the CV variant (CV + revision) used in the Apply sheet. Rows always show `n`. Rates are suppressed ("Too few to compare") when `n < 5`.
- **Median time to first response:** median days from `Applied` to the Response event, over responded applications only. Applications still waiting are shown beside it as "n still waiting" rather than skewing the median.
- **Weekly activity:** per ISO week (locale week start: Monday for TR/DE/UK/EU, Sunday for US), the count of applications sent, follow-ups sent, and interviews held. 12 weeks by default.
- Every card has an ⓘ that opens a popover with the definition and "Computed from your application history. Updated when your tracker changes." (provenance, as in LinkedIn).

## Decision — iOS

**Entry point:** Insights isn't one of the five tabs (§4.1). It opens from a toolbar button (SF Symbol `chart.bar.xaxis`) in **Tracker** and from a "This week" footer link on Today. It's pushed on the native stack with large title "Insights". This needs IA confirmation (Open questions).

**Layout** (single scroll, inset-grouped cards, Dynamic Type):

1. **Range picker:** native segmented control `4W · 12W · All` (TikTok/Linktree). The selected range is persisted.
2. **KPI tiles 2 × 2** (TikTok selectable tiles): Applications · Response rate · Interviews · Median first response. Each tile shows value + `n` context ("4 of 21"). Tapping a tile scrolls to its card. There are **no deltas vs. the previous period** on iOS; deltas appear only on desktop and only in neutral color.
3. **Funnel card**, titled with a sentence (Strava): "5 of 21 applications got a response". The bars are horizontal (Calendly) with stage label, count bar, and the step % in the drop-off gap. At accessibility text sizes the bars stack under their labels (Flighty). The connector % follows Squarespace.
4. **"Where responses come from" card:** a segmented control `Source · Channel · CV` (Flighty metric switch) above horizontal bar rows with `rate · n` right-aligned. Rows with `n < 5` are greyed and show "Too few to compare". At most 5 rows, then "Show all" (Flighty).
5. **Time to first response card:** big median value with the definition subtitle (Substack), plus "3 still waiting".
6. **Weekly activity card:** 12-week column chart of applications sent (Strava 12-week, Brick weekly bars), with a Cumulative toggle (LinkedIn) and a "This week" summary line. Follow-ups and interviews appear as a secondary legend toggle, not stacked.

**Interactions:** tapping a bar or row pushes the Tracker list filtered to those applications (drill-down = explainability). Long-press on a bar shows a value callout (Strava) with a light haptic. Charts expose an accessibility summary (the sentence title) plus per-bar accessibility labels ("Interview: 3 applications, 60 % of responses").

**Empty / low data** (Brick, TIDE): with fewer than 5 applications in the range, the page shows the counts it has, and each rate card says "Not enough applications yet to show a rate. This fills in as you apply." No zero charts, no 0 % lines.

## Decision — Desktop (macOS + Windows)

**Entry point:** sidebar `Insights` (§4.1), shortcut ⌘6 / Ctrl+6 (position in sidebar order), also in the command palette.

**Layout** (12-column grid, min window width that still works in half-screen Snap: 960 px; cards reflow to one column below 1100 px):

- **Header bar:** title, Mixpanel-style segmented range `30D · 90D · 6M · 12M · All · Custom…`, a "Compare to previous period" toggle (deltas in neutral text, e.g. "+3 vs. previous 90 days", **never red/green**), filter chips `Source · Channel · CV variant · Market` (Peec AI), and **Export CSV** (Peec AI; same exporter as the Tracker table).
- **Row 1, KPI strip** (Hotjar summary chips + TikTok selectable tiles): Applications · Response rate · Interview rate · Offer rate · Median time to first response. Clicking a tile highlights the matching part of the funnel.
- **Row 2, Funnel card** (full width), titled as a question (Amplitude): "How far do my applications get?". Vertical stage bars with conversion chips between them (Squarespace web) and `% · n` labels (Mixpanel). Beneath it, a compact table: stage · reached · step conversion · median days from previous stage (Mixpanel table). The same horizontal funnel as iOS is used when the card is narrower than 560 px.
- **Row 3, left: "Where do responses come from?"** Tabs Source / Channel / CV variant. A sortable table with an inline proportional bar behind each rate (Navattic), `n`, responses, median time. Row checkboxes add a series to the weekly chart (Substack). Rows with `n < 5` are greyed and sorted last.
- **Row 3, right: "How active have I been?"** 12-week column chart (applications sent; toggle follow-ups / interviews), hover tooltip (Navattic), and the sentence summary as subtitle ("You sent 6 applications this week, about your 12-week average.").

**Interactions:** clicking any bar, chip or table row opens Tracker → Table filtered to that set (deep link, Back returns to Insights with state kept). Keyboard: `[`/`]` previous/next range, `F` focus the filter chips, `⌘E / Ctrl+E` export. Each chart is reachable by Tab; arrow keys move between bars with live-region announcements.

**Charts:** the palette uses a single brand hue plus neutral grey for "dropped off / waiting". No red for rejections, and status colors aren't reused here. Patterns/labels carry meaning, so the charts don't depend on color (colorblind-safe).

## Components needed

| Component | Platforms | Notes |
|---|---|---|
| `RangePicker` (segmented; desktop adds Custom date range) | both | Persists per device. |
| `KpiTile` (value, `n` context, optional neutral delta, ⓘ definition) | both | Selectable state drives highlight. |
| `FunnelChart` (horizontal + vertical variants, connector %, `% · n` labels, drop-off band) | both | One data model from `@bfhr/core`. Horizontal at narrow widths / large Dynamic Type. |
| `FunnelTable` (stage, reached, step %, median days) | desktop | |
| `BreakdownList` (bar-in-row rate, `n`, low-sample greyed state, Show all) | both | Desktop variant adds sort + row checkboxes. |
| `WeeklyActivityChart` (12-week columns, cumulative toggle, series toggle) | both | Locale-aware week start. |
| `MetricDefinitionPopover` (ⓘ: definition + provenance) | both | Trust principle. |
| `InsightsEmptyState` / `LowSampleNotice` | both | Brick-style copy; no zero charts. |
| `ChartAccessibilitySummary` (sentence title → a11y label; per-datum labels) | both | Needed by the accessibility review. |
| `CsvExportButton` | desktop | Shared with Tracker table export. |
| `insights` selectors in `@bfhr/core` (cohort, funnel, response, median, weekly) | shared | Pure functions over `applicationEvents`, unit-tested with `@bfhr/fixtures`. |

## Copy notes

Tone: factual and calm. Describe, don't judge. No "only", "just", "low", "poor", "goal", "streak", "behind". Rejections are counted but never highlighted. "Ghosted" appears here as "No reply yet".

| Key | EN | TR | DE | Note |
|---|---|---|---|---|
| Screen title | Insights | İçgörüler | Einblicke | |
| Funnel stages | Applied · Response · Interview · Offer | Başvuru · Yanıt · Mülakat · Teklif | Beworben · Antwort · Gespräch · Angebot | DE "Vorstellungsgespräch" is too long for bar labels; use "Gespräch" and the full term in the ⓘ. |
| Funnel title | 5 of 21 applications got a response | Yanıt alan başvuru: 21 başvurudan 5 | 5 von 21 Bewerbungen haben eine Antwort erhalten | DE ≈ +45 %; title wraps to 2 lines. TR: "21 başvurudan" is a fixed suffix on the noun, which is safe, but a suffix on a variable number ("5'i", "3'ü") changes with how the number is pronounced, so the number stays bare after a label. Built with ICU MessageFormat, not by concatenation. |
| Desktop funnel question | How far do my applications get? | Başvurularım ne kadar ilerliyor? | Wie weit kommen meine Bewerbungen? | |
| Breakdown question | Where do responses come from? | Yanıtlar nereden geliyor? | Woher kommen die Antworten? | |
| Activity question | How active have I been? | Ne kadar aktif oldum? | Wie aktiv war ich? | |
| Median label | Median time to first response | İlk yanıta kadar geçen medyan süre | Mediane Zeit bis zur ersten Antwort | Long in all 3; the KPI tile uses the short form "First response" / "İlk yanıt" / "Erste Antwort" + ⓘ. |
| Still waiting | 3 still waiting | 3 başvuru hâlâ bekliyor | 3 warten noch | Plural rules via ICU. |
| Low sample | Too few to compare | Karşılaştırmak için yeterli veri yok | Zu wenige zum Vergleichen | |
| Empty rate card | Not enough applications yet to show a rate. This fills in as you apply. | Oran göstermek için henüz yeterli başvuru yok. Başvurdukça burası dolacak. | Noch nicht genug Bewerbungen für eine Quote. Das füllt sich, während du dich bewirbst. | |
| Provenance | Computed from your application history. Updated when your tracker changes. | Başvuru geçmişinden hesaplanır. Takip listen değiştiğinde güncellenir. | Aus deinem Bewerbungsverlauf berechnet. Wird aktualisiert, wenn sich dein Tracker ändert. | |
| Neutral delta | +3 vs. previous 90 days | Önceki 90 güne göre +3 | +3 ggü. vorherigen 90 Tagen | Always text-neutral color. |
| Ghosted bucket | No reply yet | Henüz yanıt yok | Noch keine Antwort | |

Numbers: `Intl.NumberFormat` for % (TR puts the sign first: "%24"; DE uses "24 %" with a non-breaking space). Durations: `Intl.RelativeTimeFormat`/plural rules ("4 days", "4 gün", "4 Tage").

## Open questions

1. **Response definition:** is `Acknowledged` (auto-receipt) excluded from "response"? This doc proposes yes. Should a recruiter's reply email that doesn't change status (classified `info_request`) count? Proposal: yes, if it's linked to the application. That requires the mail pipeline to write an `applicationEvent` of a "reply received" kind, so `@bfhr/core`'s event types need to support it. Needs a decision with the CoreDomain owner.
2. **Channel taxonomy:** which values does "channel" take (ATS form, email via Apply sheet, referral, recruiter outreach, other)? It must be a field on `applications` set at apply time; confirm it exists in the core schema.
3. **iOS entry point:** Tracker toolbar + Today footer link (proposed), or under the avatar menu? It affects the IA document.
4. **Where computation runs:** client-side over the user's `applicationEvents` (simple, offline, fine for hundreds of applications) vs. a server-maintained aggregate document. Proposal: client-side in v1. Revisit if event counts exceed a few thousand.
5. **Chart libraries:** iOS (Expo/RN) needs a chart library with accessibility hooks (e.g. a Skia-based library vs. SVG-based). Desktop needs a React SVG chart library. To be decided with versions checked against current docs at implementation time (§2.8). This research doesn't pick one.
6. **Low-sample threshold:** `n < 5` is proposed for suppressing rates. Should it be configurable or shown with a confidence hint instead?
