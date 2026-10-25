# Himalayas

Connector: `packages/jobs-connectors/src/connectors/himalayas.ts` (`himalayas`, kind `keyless`). Checked 2026-10-24.

## Terms

- [Remote Jobs API reference](https://himalayas.app/docs/remote-jobs-api): "Every Apply action must use the API's `applicationLink`, not a direct employer/ATS link. Display visible Himalayas source credit. You can show the jobs on your own job board, site or app without asking us first. Do not pass them on to other job boards, aggregators, Google Jobs or LinkedIn Jobs, including through feeds or JobPosting structured data."
- [Terms and Conditions](https://himalayas.app/terms#api) (current as of 22 Oct 2026), clause 30A: the no-scraping clauses "do not restrict use of our public API, job feeds and MCP server in line with their published documentation and rate limits". Job pages themselves "are protected against automated traffic" — we only use the API.

## Access

- Search: `GET https://himalayas.app/jobs/api/search?q={keywords}&page={n}` (20 results a page; also `country`, `worldwide`, `seniority`, `employment_type`, `company`, `timezone`, `sort`). We send `q` (omitted for an empty query) and read pages 1, 2, … until `limit` results or 5 pages (100 jobs). A failing later page keeps the pages already read; a failing first page is the search's error.
- Other endpoints (unused): browse feed `/jobs/api?limit=20&cursor=…` (offset deprecated) and `/jobs/api/companies/{company}/jobs/{slug}` (200 open / 410 closed).
- No key needed; an optional free key (Bearer) raises limits — not used. Schema mismatch → `invalid_response`; 429 with a long `Retry-After` → `rate_limited`.

## Coverage

Remote jobs only; `locationRestrictions` (countries; empty = worldwide) → `remoteEligibility`. Markets `["remote"]`; `covers` when the search has no remote-type filter or includes `remote`.

## Pricing / limits

Free. "Requests without a key share one public allowance with every other caller"; keyed: 60/min and 10,000/day. Responses served from Himalayas' cache don't count; "data is cached and refreshed every 24 hours". `callBudget` null; HTTP spacing 1 s; up to 5 requests per search (since 2026-10-25; one before).

## Attribution (hard requirement)

Visible "Himalayas" credit linking to himalayas.app (`attribution: { label: "Himalayas", url: "https://himalayas.app" }`), and the job's Apply button must open `applicationLink` (mapped to `applyUrl`, which `toJobDraft` uses as the job's apply URL). Never emit Himalayas jobs in feeds or JobPosting JSON-LD.

## robots.txt

Not applicable (official API, `robots: "none"`).

## Fields mapped

`guid` → url, and → sourceId without the `https://himalayas.app/companies/` prefix (`{company}/jobs/{slug}`), `applicationLink` → applyUrl, `title`, `companyName`, `employmentType` → employment type, `minSalary`/`maxSalary`/`currency` with `salaryPeriod` (annual/monthly/hourly; weekly/fortnightly dropped) → salary, `locationRestrictions` → remoteEligibility, `categories` → tags, `pubDate` (epoch s) → postedAt, `expiryDate` → deadline, `description` (HTML; `excerpt` fallback). `remote: true`, `isDirectFromEmployer: false`.
