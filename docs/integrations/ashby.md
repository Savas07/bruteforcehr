# Ashby

Connector: `packages/jobs-connectors/src/connectors/ashby.ts` (`ashby`, board connector, kind `keyless`). Checked 2026-10-24.

## Terms

- [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api) (page updated 2026-10-23): "This API allows you to get data for all currently published Job Postings for your organization. If you host your own careers page, you can use this data to populate it." No key and no separate terms for this public endpoint.
- `isListed: false` jobs "should only be available via direct link" — the connector skips them.

## Access

- `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation=true` (`jobs.ashbyhq.com/{name}` → board name).
- Unknown board → HTTP 404 `Not Found` → `SourceError("invalid_response")`.

## Coverage

Any company on Ashby that the user follows (watchlist). Markets: all — whatever the employer posts.

## Pricing / limits

Free. No rate limit is documented. We apply the HTTP client's API spacing (≥ 1 s per host) and back off on 429/5xx honouring `Retry-After`.

## Attribution

None required. Cards show "Ashby" linked to https://www.ashbyhq.com and the posting's `jobUrl`.

## robots.txt

`https://api.ashbyhq.com/robots.txt` answers HTTP 401 (checked 2026-10-24), i.e. no rules are published for the API host. Treated as an API (`robots: "none"`).

## Fields mapped

`id` → `sourceId` (`{board}:{id}`), `jobUrl` → url, `applyUrl` → applyUrl, `title`, the board name → company (the API has no company name), `location` + `secondaryLocations[].location` → locations, `workplaceType` (`Remote`/`Hybrid`/`OnSite`; `isRemote` is also true for hybrid and is only a fallback) → remoteType, `employmentType` (`FullTime`/`PartTime`/`Intern`/`Contract`/`Temporary`) → employment type, `compensation.summaryComponents` (else every `compensationTiers[].components`) → salary: the `Salary` components' min/max span when they share one currency and an interval of `1 YEAR`/`1 MONTH`/`1 DAY`/`1 HOUR` (equity, bonus, commission ignored), `descriptionHtml` (else `descriptionPlain`) → description, `publishedAt` → postedAt, `department`/`team` → tags. `isDirectFromEmployer: true`.
