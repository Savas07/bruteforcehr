# Runbook — usage limits

Every limit that protects the owner's bill or third parties, where it is enforced and how to change it. Limits reset at 00:00 UTC. Counters live under `serverOnly/**` (no client access) with a TTL field `expireAt` (35 days; policies in `firebase/firestore.indexes.json`, live after the next `firestore:indexes` deploy). Changing a number means editing the constant and deploying the `default` functions codebase.

Sign-up is invite-only ([accounts.md](accounts.md) "Invite-only sign-up"); the limits below apply to every invited account.

## Project-wide ceilings (all users together)

`PROJECT_DAILY_LIMITS` in `apps/functions/src/daily-usage.ts`, counted in `serverOnly/projectUsage/projectUsageDays/{YYYY-MM-DD}`.

| What                    | Ceiling                             | When reached                                                                                                                                           |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AI spend (`aiMicroUsd`) | 3,000,000 micro-USD = **$3.00/day** | AI callables answer `resource-exhausted` / `daily_cap` ("AI help has reached today's limit for everyone…"); mail sync and matching continue rules-only |
| PDF renders (`renders`) | **300/day**                         | `cvRenderPdf` answers `resource-exhausted` / `daily_limit` ("PDF making has reached today's limit for everyone…")                                      |

The budget alert (₺250/month) only notifies; these ceilings are what stops spend.

## Per user

| What                                                             | Limit                                                                             | Constant / counter                                                                                           | Refusal                                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| AI spend                                                         | $0.50/day                                                                         | `DAILY_COST_CAP_MICRO_USD` (`packages/ai/src/budget.ts`), `serverOnly/aiUsage/users/{uid}/aiUsageDays/{day}` | `resource-exhausted` / `daily_cap`                                     |
| `cvRenderPdf`                                                    | 40/day                                                                            | `USER_DAILY_LIMITS.renders`, `serverOnly/render/users/{uid}/renderDays/{day}`                                | `resource-exhausted` / `daily_limit`                                   |
| `mailConnectImap` attempts                                       | 20/day                                                                            | `USER_DAILY_LIMITS.mailConnectAttempts`, `serverOnly/mail/users/{uid}/mailConnectDays/{day}`                 | `resource-exhausted` / `too_many_attempts`                             |
| IMAP/SMTP servers                                                | IMAP 993 TLS or 143 STARTTLS; SMTP 465 TLS or 587 STARTTLS; public addresses only | `MAIL_ENDPOINT_PORTS` (`@bfhr/core`), `apps/functions/src/net/address-guard.ts`                              | `invalid-argument` / `port_not_allowed` (form field marked)            |
| Emails sent (email apply)                                        | `settings.dailySendCap` (default 20), clamped to **0–50** on the server           | `MAIL_DAILY_SEND_CAP_MAX`, `serverOnly/mail/users/{uid}/mailSendDays/{day}`                                  | `resource-exhausted` / `daily_send_cap`                                |
| Client-created jobs embedded + matched (`jobCreatedMatch`)       | 100/day                                                                           | `JOB_BUDGETS.createdJobEmbeddingsPerDay`, `serverOnly/jobQuota/users/{uid}/jobQuotaDays/{day}`               | the job is kept unmatched (log `job_created_match_quota`)              |
| Followed careers pages read on add/edit (`watchlistResolve`)     | 30/day                                                                            | `JOB_BUDGETS.watchlistResolvesPerDay`, same document                                                         | status `error`, "We'll check this careers page with your next search." |
| Searches, saved-search runs, refreshes, source calls, rationales | see [jobs.md](jobs.md)                                                            | `JOB_BUDGETS`                                                                                                | `resource-exhausted`                                                   |
| Account export                                                   | 5/day, 2 min apart                                                                | `ACCOUNT_EXPORT_LIMITS` ([account.md](account.md))                                                           | `export_daily_limit` / `export_too_soon`                               |
| URL import pages per host (all users)                            | 1 per 5 s, 200/day                                                                | `HOST_MIN_INTERVAL_MS`, `HOST_DAILY_PAGES` (`jobImport/politeness.ts`)                                       | `rate_limited`                                                         |

## User-supplied URLs and hosts

Pages at user-supplied URLs (URL import, followed careers pages) are fetched only through `apps/functions/src/net/safe-fetch.ts`: https on port 443, no credentials, every DNS answer public, the socket pinned to the checked address, every redirect (≤ 5) checked again, 3 MB body cap, and the owner's `serverOnly/jobImport.deniedHosts` on every hop ([ADR 0005](../adr/0005-job-sources-scraping.md)). Firestore rules accept `watchlist.careersUrl` only as `https://…` of at most 2048 characters. Mail servers go through the same address guard (`net/address-guard.ts`).
