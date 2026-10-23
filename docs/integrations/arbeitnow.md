# Arbeitnow

Connector: `packages/jobs-connectors/src/connectors/arbeitnow.ts` (`arbeitnow`, kind `keyless`). Checked 2026-10-24.

## Terms

- The API response itself carries the terms (`meta.terms`, fetched 2026-10-24): "This is a free public API for jobs, please do not abuse. I would appreciate linking back to the site. By using the API, you agree to the terms of service present on Arbeitnow.com".
- [Arbeitnow — Job Board API](https://www.arbeitnow.com/blog/job-board-api) (last updated 1 Aug 2026): free, "requires no API key", jobs "mostly from Applicant Tracking Systems (ATS) such as Greenhouse, SmartRecruiters, Join.com, Team Tailor, Recruitee, Comeet"; a paid private endpoint exists on request. A UK twin exists at `https://www.arbeitnow.co.uk/api/job-board-api` (not used).
- [Arbeitnow terms](https://www.arbeitnow.com/terms) are a generic website use licence (personal, non-commercial viewing of site materials); they say nothing about the API. Our use is a personal job search that links every posting back to Arbeitnow.

## Access

- `GET https://www.arbeitnow.com/api/job-board-api?page=N`, no auth. 300 jobs a page (`meta.per_page`), newest first by `created_at`, `links.next` for the following page; "Jobs are updated every hour" (`meta.info`). Optional `visa_sponsorship=true|false` filter (not used: we read the whole feed once for all users).
- No keyword search: the connector reads up to **3 pages** (≤ 900 jobs), caches the combined job array for **1 hour** under feed-cache key `arbeitnow` (all users share one fetch), and filters with `matchesQuery`.
- Non-JSON or schema mismatch → `invalid_response` (nothing cached).

## Coverage

Germany first, plus other European postings in the feed (sample of 300 on 2026-10-24: Munich/Berlin/Cologne, London, Paris, Zürich/Bern, Amsterdam/Rotterdam) and a `remote` flag. Markets `["DE", "AT", "CH", "NL", "FR", "GB", "remote"]`; `covers` is true without a country filter, when a filter country is one of those, or when the search accepts remote.

## Pricing / limits

Free. No published rate limit ("please do not abuse"). `callBudget` null; at most 3 requests per hour across all users (cache), HTTP spacing 1 s.

## Attribution

Requested, not mandatory: "I would appreciate linking back to the site". Job cards show "Arbeitnow" linking to the posting's Arbeitnow `url` (`attribution: { label: "Arbeitnow", url: "https://www.arbeitnow.com" }`).

## robots.txt

Not applicable (public JSON API, `robots: "none"`).

## Fields mapped

`slug` → sourceId (unique across companies), `url` → url (Arbeitnow page; some postings live on `arbeitnow.nl`), `title`, `company_name`, `location` → locations, `remote` → remote, `job_types` (free text in several languages) → employment type (internship / part-time / contract / full-time / temporary keywords), `tags` → tags, `created_at` (epoch seconds) → postedAt, `description` (HTML), `visa_sponsorship` → visaSponsorship when present (absent from the feed items on 2026-10-24). `isDirectFromEmployer: false`.
