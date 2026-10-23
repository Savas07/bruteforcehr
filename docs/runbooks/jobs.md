# Runbook — Jobs: sources, saved searches, matching

Design: [ADR 0005](../adr/0005-job-sources-scraping.md) (sources and scraping policy), [ADR 0011](../adr/0011-embeddings-matching.md) (ingestion, embeddings, matching). Per-source facts (terms, limits, attribution): [docs/integrations/](../integrations/).

## What runs where

All in the `default` functions codebase, region europe-west1.

| Function              | Trigger                                      | What it does                                                                                                     |
| --------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `jobsSearch`          | callable                                     | On-demand search across every enabled source except Jooble; writes `jobs` + `jobMatches`, returns ranked ids.    |
| `savedSearchRunNow`   | callable                                     | Runs one saved search now (all sources incl. Jooble, plus followed companies).                                   |
| `jobMatchesRefresh`   | callable                                     | Re-scores given jobs, or the 200 nearest to the profile (vector search), after a profile/CV change.              |
| `savedSearchesRunner` | Cloud Scheduler, every 30 min (UTC)          | Runs due saved searches (one per user per tick), queues alerts, sets `nextRunAt`.                                |
| `jobCreatedMatch`     | Firestore create `users/{uid}/jobs/{jobId}`  | Embeds and matches jobs the client created (URL import, logged application) as `saved`.                          |
| `watchlistResolve`    | Firestore write `users/{uid}/watchlist/{id}` | Detects the ATS behind a followed company's careers URL, reads the board once, records status and open postings. |

Data: `users/{uid}/jobs` (+ server-only `embedding`, 768-dim vector), `jobMatches`, `savedSearches`, `watchlist`; `jobSources/{sourceId}` (public health); server-only `serverOnly/jobQuota/users/{uid}`, `serverOnly/jobAlerts/users/{uid}`, `serverOnly/jobSources/{state,robots}/…`; feed cache in Storage at `serverOnly/jobFeeds/`.

## Sources and keys

Keyless sources work without setup: Arbeitnow, Remotive, RemoteOK, Himalayas, The Muse, Bundesagentur für Arbeit, Kariyer.net (polite scraping, robots binding), and the ATS boards of followed companies (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Personio, careers pages with JSON-LD).

Keyed sources switch on when their Secret Manager secret holds a real value. Every secret exists with the placeholder `unset`, so the source shows **skipped · no key** in Settings until then.

| Source  | Secrets                                 | Value                                                                                              |
| ------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Adzuna  | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`       | App ID and key from developer.adzuna.com                                                           |
| Jooble  | `JOOBLE_API_KEYS`                       | `cc=key` pairs, comma-separated, one per country domain you registered: `tr=…,de=…,gb=…,us=…,nl=…` |
| USAJOBS | `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT` | Key from developer.usajobs.gov and the email you registered with                                   |
| Reed    | `REED_API_KEY`                          | Key from reed.co.uk/developers                                                                     |

To enable a source:

```sh
firebase functions:secrets:set ADZUNA_APP_ID --project bruteforcehr     # paste the value
firebase functions:secrets:set ADZUNA_APP_KEY --project bruteforcehr
firebase deploy --only functions:jobsSearch,functions:savedSearchRunNow,functions:savedSearchesRunner --project bruteforcehr
```

Functions pin the secret version at deploy, so the redeploy is required (the next release deploy also picks it up). To switch a source off again, set the value back to `unset` and redeploy. The deploy grants the functions service account `secretAccessor` on each secret; the CI deployer (`github-deployer`) needs `roles/secretmanager.viewer` on each of these six secrets (ADR 0004).

Jooble keys allow **500 requests each, for the key's lifetime**. The app stops at 450 per key (`serverOnly/jobSources/state/jooble.lifetimeCalls`) and only uses Jooble for saved searches.

## Limits (per user, UTC day)

Enforced server-side in `serverOnly/jobQuota/users/{uid}/jobQuotaDays/{day}` (`JOB_BUDGETS` in `apps/functions/src/jobs/quota.ts`):

| Limit                           | Value                                                           |
| ------------------------------- | --------------------------------------------------------------- |
| `jobsSearch`                    | 1 per 15 s, 60 per day                                          |
| `savedSearchRunNow`             | 1 per 60 s, 30 per day                                          |
| Scheduled saved-search runs     | 72 per day                                                      |
| `jobMatchesRefresh`             | 30 per day                                                      |
| Calls to job sources (all runs) | 800 per day                                                     |
| AI match rationales             | 40 per day, plus the shared AI cost cap of $0.50/day (ADR 0010) |

Over a limit, callables fail with `resource-exhausted` and `details.reason = "search_rate_limited"`; scheduled runs skip to their next slot. Shared per-source budgets: Remotive 4 calls/day (feed cached 6 h for everyone), Jooble 450 per key lifetime. Every request is spaced ≥ 1 s per API host and ≥ 5 s per scraped host.

To change a limit, edit the constant and redeploy the jobs functions.

## Cost

Rough numbers for one active user with 3 daily saved searches:

| Item                                                            | Volume                                                    | Cost                      |
| --------------------------------------------------------------- | --------------------------------------------------------- | ------------------------- |
| Vertex AI embeddings (`gemini-embedding-001`, $0.15 / M tokens) | ~150 new jobs/day × ~1.5k tokens + a few profile vectors  | ≈ $0.03/day               |
| Claude rationales (`claude-haiku-5-5`)                          | ≤ 5 per run, ≈ $0.0006 each                               | ≈ $0.01/day               |
| Firestore                                                       | ~150 job + ~150 match writes, a few hundred reads per run | well inside the free tier |
| Cloud Functions                                                 | 48 scheduler ticks/day + runs (512 MiB, ~10–60 s each)    | cents per month           |
| Cloud Storage                                                   | feed cache, a few MB                                      | negligible                |

Expected total: **< $2/month** for one user, far under the ₺250 budget alert. The job-source APIs themselves are free tiers.

## Health and troubleshooting

- **Source health:** Firestore `jobSources/{id}` (also in Settings › Job sources): `state`, `reason`, `lastRunAt`, `lastSuccessAt`, `lastResultCount`, `quota`. `degraded` = the last run failed, `failing` = 3 runs in a row, `skipped` = no key / budget used up.
  - `blocked`: HTTP 401/403 or a bot challenge. For keyed sources, check the key. For scraped sites, we stop (no CAPTCHA solving); the site may have started blocking Cloud egress IPs.
  - `rate_limited`: the source sent 429 with a long `Retry-After`, or the user's daily call budget ran out.
  - `quota_exhausted`: Remotive's 4/day or Jooble's lifetime quota.
- **Logs** (Cloud Logging, PII-free): `jobs_run` (per-source status/counts, created/updated/matched), `saved_searches_tick`, `watchlist_resolved`, `ai_request` with `task: "matchRationale"`.
- **A saved search never runs:** check `enabled` and `nextRunAt` (null or past = due); the scheduler logs `saved_searches_tick`.
- **robots.txt verdicts** are recorded per host in `serverOnly/jobSources/robots/{host}`.
- **Kill switch for a host or source:** remove it from `SEARCH_CONNECTORS` / `BOARD_CONNECTORS` and redeploy; for a keyed source, set its secret to `unset` and redeploy.

## Live check

`pnpm --filter @bfhr/functions smoke:jobs` (needs `gcloud auth application-default login` as the owner) creates a throwaway verified user with a profile, a saved search and a followed company, calls `savedSearchRunNow` and `jobsSearch`, prints the stored jobs, matches, rationale, alerts and source health, then deletes everything with `deleteUserData` and the Auth user. Costs well under a cent.

## Deploy

```sh
pnpm --filter @bfhr/functions run build
firebase deploy --only functions:jobsSearch,functions:savedSearchRunNow,functions:jobMatchesRefresh,functions:savedSearchesRunner,functions:jobCreatedMatch,functions:watchlistResolve --project bruteforcehr
firebase deploy --only firestore:rules,firestore:indexes --project bruteforcehr
```

The vector index (`jobs.embedding`, 768, flat) takes a few minutes to build after the indexes deploy; `jobMatchesRefresh` without ids fails with `FAILED_PRECONDITION` until it is ready.
