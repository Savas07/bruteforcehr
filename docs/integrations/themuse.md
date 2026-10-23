# The Muse

Connector: `packages/jobs-connectors/src/connectors/themuse.ts` (`themuse`, kind `keyless`). Checked 2026-10-24.

## Terms

- [The Muse API v2](https://www.themuse.com/developers/api/v2): "This API is publicly available to other companies … By using this API, you agree to the terms and conditions."
- [The Muse API Terms of Use](https://www.themuse.com/developers/api/v2/terms) (last modified 25 Jul 2015):
  - §2.2 "In order to access The Muse API, you are required to register your App" — **the owner should register an app** at https://www.themuse.com/developers/api/v2/apps, even though keyless calls work (rate limit 500/h).
  - §3.4 Muse content shown "will link back to The Muse Website".
  - §3.3 no replicating The Muse's services, no cloning Muse Content; §4.3(d) no web scraping of The Muse (we only use the API).
  - §4.2 respect rate limits.

## Access

- `GET https://www.themuse.com/api/public/jobs?page={n}&descending=true[&category=…][&location=…]`, keyless (optional `api_key` query parameter → 3,600/h; not configured). Pages of 20.
- No free-text search. A query that clearly names a Muse category (a fixed table, e.g. "software engineer" → `Software Engineering`, "data scientist" → `Data Science`, "product manager" → `Product Management`) uses `category` and reads page 0; anything else reads pages 0–1 (newest first) and filters with `matchesQuery`. Remote-only searches add `location=Flexible / Remote`.
- Schema mismatch → `invalid_response`; 403 (the API's rate-limit status) → `blocked`.

## Coverage

Mostly US postings (sample on 2026-10-24: US cities plus some Mexico, India, Bulgaria, Germany, Singapore); location values use "City, ST" for the US and "City, Country" elsewhere, and "Flexible / Remote". Markets `["US", "GB", "remote"]`; `covers` without a country filter, with US/GB, or when the search accepts remote. ADR 0005 notes its low value for TR/DE/NL.

## Pricing / limits

Free. 500 requests/hour without a key (confirmed by the live `x-ratelimit-limit: 500`, `x-ratelimit-reset: 3600` headers), 3,600/hour with a registered key. ≤ 2 requests per search; `callBudget` null; HTTP spacing 1 s.

## Attribution

Required link-back (§3.4): cards show "The Muse" and link to `refs.landing_page` on themuse.com (`attribution: { label: "The Muse", url: "https://www.themuse.com" }`). No logo use (§3.5).

## robots.txt

Not applicable (official API, `robots: "none"`).

## Fields mapped

`id` → sourceId, `refs.landing_page` → url, `name` → title, `company.name`, `locations[].name` → locations ("Flexible / Remote" removed and mapped to `remote: true`), `levels[].name` ("Internship" → employment type internship) and `categories[].name` → tags, `publication_date` → postedAt, `contents` (HTML) → description. `isDirectFromEmployer: false`.
