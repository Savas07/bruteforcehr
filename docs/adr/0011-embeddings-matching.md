# ADR 0011 — Job ingestion, embeddings and matching

- **Status:** Accepted
- **Date:** 2026-10-24
- **Deciders:** Savas (owner), lead engineer agent
- **Related:** [0002-data-model.md](0002-data-model.md) (jobs, jobMatches, savedSearches, vector search), [0005-job-sources-scraping.md](0005-job-sources-scraping.md) (sources, scraping policy), [0010-ai.md](0010-ai.md) (Claude, cost cap), [runbooks/jobs.md](../runbooks/jobs.md), BRIEF §4.3

## Context

M4 needs job discovery end to end: connectors per ADR 0005, dedupe across sources, a 0–100 match score with reasons and gaps, an AI rationale for the best matches, saved searches that run on a schedule, and alerts for M5. ADR 0002 fixed the Firestore shape (`jobs` + `embedding`, `jobMatches`, `savedSearches`) but left the embedding model and dimension open ("fixed in M4"). Anthropic has no embeddings endpoint, so embeddings need a second provider. The owner asked for no new API key.

## Decision

### Embeddings: Vertex AI `gemini-embedding-001`, 768 dimensions, europe-west1

- Model `gemini-embedding-001` on Vertex AI in **europe-west1** (same region as Firestore and Functions), called over REST (`…/publishers/google/models/gemini-embedding-001:predict`) with the **functions service account** through Application Default Credentials. No key; the service account's project role already allows `aiplatform.endpoints.predict`. The Vertex AI API (`aiplatform.googleapis.com`) was enabled on 2026-10-24.
- `outputDimensionality: 768` (Matryoshka truncation). Truncated vectors are not unit length, so `VertexEmbedder` re-normalizes them; `DOT_PRODUCT` then equals cosine, as ADR 0002 requires. 768 ≤ 2048 (Firestore limit) and keeps a job document about 6 KB lighter than 3072 dims would.
- Jobs are embedded as `RETRIEVAL_DOCUMENT` from title, company, locations, skills and the start of the description (≤ 6,000 characters). The profile side is `RETRIEVAL_QUERY`: target roles, seniority, profile + CV skills and the CV's headline, summary and recent positions.
- Probe on 2026-10-24 (`gemini-embedding-001` vs `text-multilingual-embedding-002`, both 768): the same role scored 0.79 / 0.81, adjacent roles 0.70 / 0.69, unrelated jobs 0.52–0.62 / 0.49–0.66. Gemini separates unrelated jobs better and handles Turkish and German. `SIMILARITY_RANGE = { low: 0.55, high: 0.82 }` maps similarity onto 0–1 for scoring.
- Cost: $0.15 per million input tokens. A job is ≈ 1,500 tokens, so 1,000 new jobs ≈ $0.23. Only new jobs (and jobs without a vector) are embedded; a re-sighting reuses the stored vector.
- A model or dimension change follows ADR 0002: a new field (`embedding_v2`), a backfill, then contract.
- Index: flat vector index on `jobs.embedding`, dimension 768, collection scope (`firebase/firestore.indexes.json`). `jobMatchesRefresh` without ids re-scores the 200 nearest jobs (`findNearest`, `DOT_PRODUCT`).

### Connectors (`packages/jobs-connectors`, `@bfhr/jobs-connectors`)

- One package, TypeScript source inlined into the functions bundle like `@bfhr/ai`. No Firebase dependency: the shared cache and budgets are interfaces implemented in `apps/functions`.
- `SearchConnector` (`search(query, filters)`, `covers`, `secrets`, `adHoc`, `callBudget`, `attribution`, optional `fetchDetail`) and `BoardConnector` (`list(board)` for an ATS board). ADR 0005's `fetch(id|url)` is `fetchDetail(listing)` for sources whose search results lack the description (BA Jobsuche, SmartRecruiters, Reed, Kariyer.net); fetching a single user-shared URL is `jobImportUrl` (M4-JOB-3), not part of this contract.
- Connectors only map fields into a `Listing`. `toJobDraft` does the shared normalization: HTML → text, location parsing (city + ISO country), remote/hybrid/onsite, seniority, visa sponsorship and relocation phrases, posting language, dictionary skills, salary validation, fingerprint and expiry.
- `HttpClient` implements ADR 0005's hard limits: honest UA `BruteForceHR/<version> (+https://bruteforcehr.web.app/support)`, per-host spacing (1 s for APIs, 5 s for pages), exponential back-off on 429/5xx honouring `Retry-After` (gives up beyond 60 s), robots.txt **binding** for crawled search pages and **recorded** for watchlisted pages, and bot-challenge/CAPTCHA detection that stops with `blocked`. No cookies, proxies or header spoofing.
- Whole-feed sources (Remotive, RemoteOK, Arbeitnow, Himalayas) are fetched once for all users and cached in Cloud Storage (`serverOnly/jobFeeds/`, not client-readable), then filtered per query. Shared call budgets (Remotive 4/day, Jooble 450 per key for the key's lifetime) are counted in `serverOnly/jobSources/state/{id}`.
- Keyed sources read their keys from Secret Manager (`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOOBLE_API_KEYS`, `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT`, `REED_API_KEY`). Each secret exists with the placeholder value `unset`, which `secretOrNull` treats as missing, so the source reports `skipped: no_key` until the owner sets a value and redeploys.
- LinkedIn, Indeed and Glassdoor search results are not crawled (ADR 0005); only user-shared postings via `jobImportUrl`.

### Dedupe and merge (`@bfhr/core` `jobs/dedupe.ts`)

- Fingerprint `v1|<company>|<title>|<location>`: company = name without legal-form suffixes (`Acme GmbH` → `acme`), title folded with gender markers (`(m/w/d)`) and abbreviations (`Sr.`) normalized, location = first city, else country, else `remote`. The company name, not the domain, is used because aggregators rarely know the domain.
- A draft is the same job as a stored one when they share a `sourceKey`, have the same fingerprint, or `isSameJob`: same company (name or domain), same normalized title and description shingle (word 3-gram) Jaccard ≥ 0.6. That catches one posting listed with different location wording on two boards.
- `mergeJobListing` unions `sources[]` by `sourceKey` (a known source keeps `firstSeenAt`, takes the new wording and `lastSeenAt`), orders direct-from-employer listings first, and prefers the direct listing's canonical title, description and apply route (ADR 0002). Published salaries beat estimates. Identity (`id`, `fingerprint`, `createdAt`) never changes.
- Expiry: `expiresAt` = the published deadline, or 30 days (`JOB_STALE_AFTER_DAYS`) after the latest sighting. Every re-sighting pushes it forward. Clients hide expired jobs; nothing is deleted automatically yet.

### Matching (`@bfhr/core` `matching/score.ts`)

- Requirement checks from the profile, as `MatchFactor`s with a `facet`: location (target city, country, or relocation), workplace type, work authorization (per country or `EU`, with the posting's visa sponsorship), salary floor (same currency, normalized to a year: 12 months, 220 days, 1,760 hours), seniority (distance on a rank scale) and posting language (CEFR B2+ = met). Unknown values are `not_stated` (neutral, never a gap). Rule labels are values ("Berlin", "remote", "EUR 70,000–85,000 / year"); clients localize the surrounding copy by facet and status.
- Score = weighted mean of requirements 0.30, skill overlap 0.25 (job skills found in CV + profile skills), embedding similarity 0.25 and title fit with the target roles 0.20; missing components are left out and the rest renormalized. A "matters most" requirement outside the user's preferences (location, workplace type, authorization, published salary) caps the score at 44, below the "partial" band, so those jobs are still visible but sorted last with the reason shown. Hidden companies get no match.
- Re-scoring writes only server fields into an existing match; `state`, `dismissReasons` and `stateChangedAt` are never overwritten. Jobs the client creates (`url_import`, `manual`) start as `saved` (`initialMatchState`); the `jobCreatedMatch` trigger embeds and matches them.

### AI rationale

- `explainMatch` (`@bfhr/ai`, prompt `match-rationale@1`, `claude-haiku-5-5`, effort low): two or three sentences in the user's UI language (TR "siz", DE "du") from the rule factors, a 4,000-character description excerpt and the person's target roles and skills, plus the skills the posting asks for (which extend `jobs.skills`).
- Only for the **top 5** new or re-scored matches of a run with score ≥ 65 ("good" band) that have no rationale yet, when `profile.aiEnabled` is not false. Each call goes through the per-user AI ledger (ADR 0010, $0.50/day) and a per-user count (40/day). About $0.0006 per rationale.
- The text must pass the grounding checker (`findUngrounded`, hard entities): a rationale naming numbers or entities that aren't in the input is dropped (`rationale: null`), never shown. Posting skills are kept only when they appear in the input.
- A rationale is kept on re-score only while `basedOnCvRevisionId` is unchanged.

### Saved searches, alerts and budgets

- `savedSearchesRunner` (`onSchedule`, every 30 minutes, UTC) runs due searches: `enabled == true` and `nextRunAt <= now` or `nextRunAt == null` (collection-group index `enabled, nextRunAt`), at most one per user per tick, oldest first. After a run (or a refused/failed one) `nextRunAt = now + schedule` (hourly/daily/weekly). Saved runs also read the user's followed companies' boards, filtered by the search's query.
- Callables `jobsSearch` (on-demand, Jooble excluded), `savedSearchRunNow` and `jobMatchesRefresh`; contracts in `@bfhr/core` `jobs/contracts.ts`, errors with `details.reason` from `JobsErrorReason`.
- **Alerts:** ADR 0002 defines no client-visible alerts collection, so pending alerts are server-only: `serverOnly/jobAlerts/users/{uid}/jobAlertItems/{jobId}` `{ jobId, savedSearchId, score, dailyDigest, createdAt, notifiedAt: null, expireAt }` for every **new** match of a saved-search run at or above its `alertThreshold` (TTL 14 days). M5 notifications read them, send a push (or add to the daily digest when `dailyDigest`), and set `notifiedAt`. The feed itself needs nothing extra: it listens to `jobMatches`.
- **Per-user budgets** (`serverOnly/jobQuota/users/{uid}/jobQuotaDays/{day}`, TTL 35 days; values in [runbooks/jobs.md](../runbooks/jobs.md)): spacing and daily counts for `jobsSearch` and `savedSearchRunNow`, daily scheduled runs and refreshes, connector calls and AI rationales. Refusals are `resource-exhausted` / `search_rate_limited`.

### Source health (`jobSources/{sourceId}`)

- One project-wide document per source (keys are project secrets, so health is global): `state` (ok / degraded / failing / skipped), `reason` (enum), `lastRunAt`, `lastSuccessAt`, `lastResultCount`, `quota`, `attribution`. Readable by every verified user (Settings › Job sources), written only by Functions.
- Because every user can read it, `lastError` is always the fixed per-reason text of `sourceErrorMessage(reason)`. Source run reports carry only enums and counts, so queries, uids, emails and URLs can't reach the document; unit tests assert it.

### Followed companies (`users/{uid}/watchlist/{id}`)

- "Companies you follow" (PRD M4-JOB-2): the client writes `name`, `careersUrl`, `enabled` (+ timestamps) and creates entries as `pending`; `watchlistResolve` detects the ATS (`detectAtsBoard`: Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Personio; otherwise a careers page with schema.org `JobPosting` JSON-LD), reads the board once and records `ats`, `boardToken`, `companyDomain`, `status`, `openJobs`. Rules mirror `WATCHLIST_CLIENT_FIELDS`.

### Account data

- Per-user server data is registered in `userDataRoots(uid)` (`@bfhr/api`): `users/{uid}` and each per-user `serverOnly` tree (`aiUsage`, `jobAlerts`, `jobQuota`, `mail`). `deleteUserData(uid)` (`apps/functions/src/account/user-data.ts`) recursively deletes every root plus the Storage prefix; M6 account deletion and export must use the same registry.

## Consequences

- Matching quality depends on profile completeness; with no profile, CV or target roles the score falls back to requirement neutrality plus similarity.
- The score weights and band thresholds are provisional; they are constants in `@bfhr/core` and need recalibration against real distributions after a few weeks of use.
- Vertex AI is a second AI provider (Google) that receives job texts and the profile summary (no contact details). It's covered by the project's Google Cloud terms; the privacy policy must name it (M6).
- Firestore writes per run: one document per new or changed job, one per match, plus small quota/state documents.

## Alternatives considered

| Alternative                          | Why rejected                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `text-multilingual-embedding-002`    | Works, slightly cheaper per character, but separated unrelated jobs less clearly in the probe; older model family. |
| OpenAI / Voyage embeddings           | A new vendor and a new API key, which the owner asked to avoid.                                                    |
| 3072-dimension vectors               | Exceeds Firestore's 2048 limit.                                                                                    |
| Client-side matching                 | Vector queries only run in server SDKs; secrets and quotas belong server-side (ADR 0002, 0005).                    |
| Alerts as a client collection        | Not in ADR 0002; M5 decides the notification UX. Server-only items avoid a schema/rules change now.                |
| Dropping jobs that fail hard filters | Users lose the "why not" explanation; capping the score keeps them visible but last.                               |
