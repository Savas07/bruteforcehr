# Lever

Connector: `packages/jobs-connectors/src/connectors/lever.ts` (`lever`, board connector, kind `keyless`). Checked 2026-10-24.

## Terms

- [Lever Postings API README](https://github.com/lever/postings-api/blob/master/README.md): the API "is designed to help you create a job site". "Note that all job postings in the `published` state are publicly viewable. These jobs may be scraped by third parties. All other jobs are completely hidden from the jobs API." No key is needed for reading; only application `POST`s need an API key (we never post).

## Access

- `GET https://api.lever.co/v0/postings/{site}?mode=json` (global instance).
- `GET https://api.eu.lever.co/v0/postings/{site}?mode=json` for EU-instance boards (`jobs.eu.lever.co/{site}` → `region: "eu"`).
- Optional `skip`/`limit` paging and `location`/`commitment`/`team`/`department`/`level` filters exist; we read the whole list in one call (no full-text search is offered, per the README).
- Unknown site → HTTP 404 `{"ok":false,"error":"Document not found"}` → `SourceError("invalid_response")`.

## Coverage

Any company on Lever that the user follows (watchlist). Markets: all — whatever the employer posts.

## Pricing / limits

Free. The README documents a rate limit only for application `POST`s ("more than 2 application POST requests per second" → 429). We apply the HTTP client's API spacing (≥ 1 s per host) and back off on 429/5xx honouring `Retry-After`.

## Attribution

None required. Cards show "Lever" linked to https://www.lever.co and the posting's `hostedUrl`.

## robots.txt

`https://api.lever.co/robots.txt` and `https://api.eu.lever.co/robots.txt`: `User-agent: *`, `Allow: /`, `Crawl-delay: 1` (checked 2026-10-24). Treated as an API (`robots: "none"`); our ≥ 1 s spacing matches the crawl delay.

## Fields mapped

`id` → `sourceId` (`{site}:{id}`), `hostedUrl` → url, `applyUrl` → applyUrl, `text` → title, the site name → company (the API has no company name), `categories.allLocations` (else `categories.location`) → locations, `workplaceType` (`remote`/`hybrid`/`onsite`, documented as `on-site`; `unspecified` → inferred from wording) → remoteType, `categories.commitment` (free text) → employment type, `salaryRange` (`per-year-salary`/`per-month-salary`/`per-day-wage`/`per-hour-wage`; `per-week-salary` and `one-time` are dropped) → salary, `description` (HTML, else `descriptionPlain`) + `lists[]` (as `<h3>` + `<ul>`) + `additional` → description, `createdAt` (epoch ms) → postedAt, `categories.team`/`department` → tags. `isDirectFromEmployer: true`.
