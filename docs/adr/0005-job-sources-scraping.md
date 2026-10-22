# ADR 0005 — Job sources and web-scraping policy

- **Status:** Accepted (implementation in M4)
- **Date:** 2026-10-22
- **Supersedes:** BRIEF.md §2.5 and §3 "LinkedIn / Indeed / Glassdoor" for personal use (owner override)
- **Related:** [0001-stack.md](0001-stack.md), [0002-data-model.md](0002-data-model.md), [runbooks/accounts.md](../runbooks/accounts.md)

## Context

Target markets: **Turkey; EU (Germany, Netherlands, relocation); UK; US; Remote worldwide**. Languages EN/TR/DE. The app is a personal tool whose architecture stays multi-user-capable.

BRIEF §4.3 requires one connector interface (`search`, `fetch`, rate limits, attribution) and, before integrating any source, checking its ToS, pricing, attribution and country coverage and recording them in `docs/integrations/<source>.md`. BRIEF §2.5 forbade scraping sites whose ToS forbid it.

**Owner override at kickoff:** web scraping is allowed **including ToS-restricted public pages**, for personal use, with hard limits: no login bypass, no CAPTCHA solving, polite rate limits, honest User-Agent.

Facts verified on 2026-10-22 from official pages:

| Source | Access | Coverage | Pricing / limits | Terms & attribution |
|---|---|---|---|---|
| **Remotive** | Keyless `GET https://remotive.com/api/remote-jobs` | Remote jobs worldwide (`candidate_required_location`) | Free; advise ≤ 4 calls/day, **> 2 req/min blocked**; jobs delayed 24 h | Must **link back to the Remotive URL and name Remotive as source**; don't resubmit jobs to third-party sites (Jooble, Google Jobs, LinkedIn…); don't gate listings behind signup ([Remotive API README](https://github.com/remotive-com/remote-jobs-api/blob/main/README.md)) |
| **Arbeitnow** | Keyless `GET https://www.arbeitnow.com/api/job-board-api` (JSON, paginated) | Germany + Europe + remote, visa-sponsorship flags | Free | Public free API "with jobs from Applicant Tracking Systems" ([Arbeitnow blog — Job Board API](https://www.arbeitnow.com/blog/job-board-api)); attribute with link to the posting |
| **Adzuna** | `app_id` + `app_key` (free on signup) | 19 countries incl. **UK, US, DE, NL** (also AT, AU, BE, BR, CA, CH, ES, FR, IN, IT, MX, NZ, PL, SG, ZA); **no Turkey** ([Adzuna XML spec — supported countries](https://www.adzuna.co.uk/jobs/xml-specification.html)) | Free key "intended for evaluating"; paid personal plans for higher volume | **Personal job search is a permitted use**; each displayed ad labelled "Adzuna" (≥ 116×23 px) linked to the local Adzuna domain; one account per individual ([Adzuna API Terms of Service](https://developer.adzuna.com/docs/terms_of_service)) |
| **Jooble** | API key **per country domain** (key from `jooble.org` = US only; `uk.jooble.org`, `de.jooble.org`, … for others), `POST https://jooble.org/api/{key}` | ~66 countries incl. TR, DE, NL, UK, US ([jooble.org](https://jooble.org/)) | **Free plan: 500 requests per key, lifetime** (not monthly) | ([Jooble REST API documentation](https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation)) — link to Jooble `link` URL |
| **USAJOBS** | API key by request form; headers `Host`, `User-Agent` (your email), `Authorization-Key` | US federal jobs | Free; ≤ 500 rows/page, ≤ 10,000 rows/query | Public job data only ([Authentication](https://developer.usajobs.gov/Guides/Authentication), [Rate limiting](https://developer.usajobs.gov/guides/rate-limiting), [API request](https://developer.usajobs.gov/apirequest/index)) |
| **Reed** | Free key on signup; HTTP Basic auth with key as username, empty password | UK | Free | ([Reed Jobseeker API](https://www.reed.co.uk/developers/jobseeker)); link to the Reed job URL |
| **Greenhouse** | Keyless `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs` | Any company on Greenhouse (watchlist) | Free | "Job Board data is publicly available, so authentication is not required for any GET endpoints" ([Greenhouse Job Board API](https://developers.greenhouse.io/job-board)) |
| **Lever** | Keyless `GET https://api.lever.co/v0/postings/{company}?mode=json` | Watchlist | Free | Postings API "designed to help you create a job site" ([lever/postings-api](https://github.com/lever/postings-api)) |
| **Ashby** | Keyless `GET https://api.ashbyhq.com/posting-api/job-board/{name}` (`includeCompensation=true` optional) | Watchlist | Free | ([Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)) |
| **SmartRecruiters** | Keyless `GET https://api.smartrecruiters.com/v1/companies/{id}/postings` | Watchlist | Free | Public Posting API for postings made public ([Posting API](https://developers.smartrecruiters.com/docs/posting-api), [endpoints](https://developers.smartrecruiters.com/docs/endpoints)) |
| **Workable** | Keyless `GET https://apply.workable.com/api/v1/widget/accounts/{subdomain}` (`?details=true`) | Watchlist | Free | Public jobs collection for an account ([Workable API reference](https://workable.readme.io/reference/jobs-1)) |
| **Recruitee** | Keyless `GET https://{company}.recruitee.com/api/offers/` | Watchlist | Free | Careers Site API lists published offers ([Recruitee /offers](https://docs.recruitee.com/reference/offers), [intro](https://docs.recruitee.com/reference/intro-to-careers-site-api)) |
| **Bundesagentur für Arbeit Jobsuche** (candidate) | Fixed public client id header `X-API-Key: jobboerse-jobsuche` | Germany (largest German job DB) | Free | Community-documented OpenAPI ([jobsuche.api.bund.dev](https://jobsuche.api.bund.dev/)); evaluate in M4 before use |

Turkey has **no free official job-search API** among the sources above except Jooble's TR domain (500 lifetime requests per key). Turkish boards (e.g. Kariyer.net) are therefore reached by scraping public pages (policy below) and by parsing the user's own job-alert emails (M5). Kariyer.net's `robots.txt` disallows only internal paths such as `/UploadFiles/`, `/Services/` ([kariyer.net/robots.txt](https://www.kariyer.net/robots.txt)); its terms are linked from its [Hizmet Sözleşmesi](https://www.kariyer.net/veri-politikamiz/hizmet-sozlesmesi) and must be read and recorded in `docs/integrations/kariyer-net.md` before the connector ships.

## Decision

### Sources per market

| Market | Primary (API) | Secondary |
|---|---|---|
| **Turkey** | Jooble (tr key), ATS watchlist | Public-page scraping of user-shared/watchlisted Turkish boards & career pages; job-alert emails (M5) |
| **Germany** | Arbeitnow, Adzuna `de`, Jooble (de key) | BA Jobsuche (after evaluation), ATS watchlist, scraping |
| **Netherlands** | Adzuna `nl`, Jooble (nl key) | ATS watchlist, scraping |
| **UK** | Reed, Adzuna `gb`, Jooble (uk key) | ATS watchlist |
| **US** | Adzuna `us`, USAJOBS, Jooble (us key) | ATS watchlist |
| **Remote** | Remotive, Arbeitnow (remote flag) | ATS watchlist |

- Keyless sources (Remotive, Arbeitnow, the six ATS boards) are enabled from M4 with no user action.
- Keyed sources (Adzuna, Jooble, USAJOBS, Reed) are enabled when the owner adds keys (Settings → Job sources, stored server-side in Secret Manager / `serverOnly`; [runbooks/accounts.md](../runbooks/accounts.md)).
- Jooble's 500-request lifetime cap means it is **only queried by saved searches** (not ad-hoc typing), with a per-key request counter and a visible "quota left" in Settings.
- A paid aggregator (JSearch, SerpApi Google Jobs) is allowed later behind the user's own key; not in scope now.
- Every source gets `docs/integrations/<source>.md` (ToS link + date checked, pricing, attribution, coverage, rate limit) before its connector merges.

### Connector contract (implemented in M4, `@bfhr/core` types)

`search(query, filters) → JobDraft[]`, `fetch(id|url) → JobDraft`, `rateLimit` (token bucket per source), `attribution` (`{ label, url, logo? , minSize? }`) rendered on every job card and detail view. Ingestion runs in Cloud Functions task queues with per-source `rateLimits.maxConcurrentDispatches` ([Enqueue functions with Cloud Tasks](https://firebase.google.com/docs/functions/task-functions)).

### Scraping policy (owner override, personal use)

Allowed:
- Fetching **publicly reachable pages** (no account needed to view) on any site, **including sites whose ToS restrict automated access**, when the page is (a) explicitly shared/pasted by the user, (b) on the user's **company watchlist**, or (c) a search-result page for a saved search the user configured.
- Parsing order: schema.org `JobPosting` JSON-LD → readable text + LLM extraction → user pastes description. The user confirms fields before saving.

Hard limits (never relaxed):
- **No login bypass**: never use the user's or any account cookies/sessions to scrape; never access pages behind authentication or paywalls.
- **No CAPTCHA solving** (no solver services, no human-in-the-loop solving); a CAPTCHA or bot challenge stops the fetch and falls back to "paste the description".
- **No evasion**: no rotating proxies/residential IPs, no fingerprint spoofing, no headless-detection evasion.
- **Honest User-Agent**: `BruteForceHR/<version> (+https://bruteforcehr.web.app/support)`.
- **Polite rate limits**: ≤ 1 request / 5 s per host, ≤ 200 pages / host / day, exponential back-off on 429/503, honour `Retry-After`; responses cached (ETag/Last-Modified) so a page is fetched at most once per 24 h unless the user refreshes.
- **No automated submission** of third-party application forms (BRIEF §2.5 kept).
- Data stays in the user's own `users/{uid}/jobs`; never republished or shared with other users. Original source URL and source name are always kept and shown.
- LinkedIn, Indeed, Glassdoor: only user-shared single postings, fetched once (same limits), plus job-alert emails (M5). No crawling of their search results.

robots.txt:
- Fetched and **recorded** per host (stored with the job's fetch metadata and shown in the source's detail).
- **Binding** for crawling of saved-search result pages on hosts the user hasn't explicitly added.
- **Not binding** for pages the user explicitly shared or watchlisted (treated as user-initiated retrieval of a single page).
- A per-host kill switch in Settings and a server-side denylist let the owner stop any host immediately.

### Risk the owner accepted

Scraping ToS-restricted sites can breach those sites' contracts even when pages are public. Consequences may include IP blocking of Cloud Functions egress ranges, account suspension if the owner has an account there, or legal claims (breach of contract; in the EU, database-right claims). Because requests come from shared Google Cloud egress IPs, a block may affect other fetches from the same region. The owner accepted this for **personal, non-commercial use**. **Before the app is offered to anyone else, this ADR must be revisited**: restricted-ToS scraping is switched off by a server-side flag and only API/ATS/JSON-LD sources remain (BRIEF §2.5 default).

## Consequences

- TR coverage is weaker than other markets (no free API besides Jooble's capped key); job-alert emails (M5) and scraping fill the gap.
- Attribution UI is a hard requirement for Remotive and Adzuna (logo size rule); job cards need a source label slot.
- Rate-limit and quota state is per source and server-side; Settings shows it.
- The scraping path needs its own tests (robots recording, rate limiter, CAPTCHA detection → fallback) in M4.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Brief default: no scraping of ToS-restricted sites | Overridden by the owner for personal use; kept as the switch-off state for any public release. |
| The Muse API | Mostly US-centric listings; low value for TR/DE/NL. May be added later with its own integration doc. |
| Paid aggregators now (JSearch, SerpApi) | Cost; allowed later behind the user's key. |
| Headless-browser scraping with proxies/CAPTCHA solvers | Violates the hard limits; detection evasion is out of policy. |
| Running scrapers on the desktop client (user IP) | Inconsistent with iOS; uncontrolled rate limiting; secrets and quotas belong server-side. |
