# Remotive

Connector: `packages/jobs-connectors/src/connectors/remotive.ts` (`remotive`, kind `keyless`). Checked 2026-10-24.

## Terms

From the [Remotive API README](https://github.com/remotive-com/remote-jobs-api/blob/main/README.md) and the `0-legal-notice` field of the live response:

- "API documentation and access is granted so that developers can share our jobs further. Please do not submit Remotive jobs to third Party websites, including but not limited to: Jooble, Neuvoo, Google Jobs, LinkedIn Jobs." → we never re-publish, syndicate or emit JobPosting structured data for Remotive jobs.
- "**Please link back to the URL found on Remotive AND mention Remotive as a source** … If you don't do that, we'll terminate your API access" → hard attribution requirement (below).
- "Displaying our jobs in order to collect signups/email addresses to show a listing constitutes a breach" → listings are shown to the signed-in owner only; never used as a signup gate.
- "Jobs displayed are delayed by 24 hours." A private paid API exists (hello@remotive.com).

## Access

- `GET https://remotive.com/api/remote-jobs`, no auth. Optional `category`, `company_name`, `search`, `limit`. We call it **without parameters** (whole feed) because of the call budget, cache the raw body **6 hours** under feed-cache key `remotive`, and filter with `matchesQuery`.
- Non-JSON or schema mismatch → `invalid_response` (not cached); 403 → `blocked`.

## Coverage

Remote jobs worldwide; `candidate_required_location` ("Worldwide", "USA, Canada", "Europe") becomes `remoteEligibility`. Markets `["remote"]`; `covers` when the search has no remote-type filter or includes `remote`.

## Pricing / limits

Free. "We advise max. 4 times a day … excessive requests (more than 2x per minute) will be blocked." Enforced as:

- `callBudget = { limit: 4, period: "day" }` (shared counter across all users, runner-enforced);
- 6-hour cache (≤ 4 fetches a day even without the counter);
- `minIntervalMs: 30_000` per host (never 2 requests within a minute).

## Attribution (hard requirement)

Every card/detail shows "Remotive" as the source and links to the job's Remotive `url` (`attribution: { label: "Remotive", url: "https://remotive.com" }`).

## robots.txt

Not applicable (official API, `robots: "none"`).

## Fields mapped

`id` → sourceId, `url` → url (Remotive page, the required link-back), `title`, `company_name`, `category` + `tags` → tags, `job_type` (full_time/part_time/contract/freelance/internship) → employment type, `publication_date` (UTC without offset) → postedAt, `candidate_required_location` → remoteEligibility, `salary` (free text) → salary **only for clear ranges** with a currency symbol/code (`$170k - $200k`, `€60k–80k`, `$30 - $50 per hour`; unstated period = yearly, and figures < 1,000 without a period are ignored), else null, `description` (HTML). `remote: true`, `isDirectFromEmployer: false`.
