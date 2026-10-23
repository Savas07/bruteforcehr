# Greenhouse

Connector: `packages/jobs-connectors/src/connectors/greenhouse.ts` (`greenhouse`, board connector, kind `keyless`). Checked 2026-10-24.

## Terms

- [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html): "Job Board data is publicly available, so authentication is not required for any GET endpoints. Only the application submission endpoint (`POST …/jobs/{id}`) requires Basic Auth." No separate terms of use are published for the GET endpoints.
- We only read published postings of companies the user follows; we never submit applications through the API.

## Access

- `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` — every published job with its HTML `content`.
- Unknown board → HTTP 404 `{"status":404,"error":"Job not found"}` → `SourceError("invalid_response")`.
- **EU boards:** boards hosted on `job-boards.eu.greenhouse.io` are served by the same `boards-api.greenhouse.io` host (verified 2026-10-24 with the `eggai` and `mangroup` boards, whose `absolute_url`s point to `job-boards.eu.greenhouse.io`). The host `boards-api.eu.greenhouse.io` does **not resolve** (no DNS record on 2026-10-24), so EU boards must not be sent there.

## Coverage

Any company on Greenhouse that the user follows (watchlist; `detectAtsBoard` recognises `boards.greenhouse.io`, `job-boards.greenhouse.io`, `job-boards.eu.greenhouse.io`, `boards.eu.greenhouse.io`). Markets: all (TR, DE, NL, GB, US, remote) — whatever the employer posts.

## Pricing / limits

Free. No rate limit is documented for the GET endpoints. We apply the HTTP client's API spacing (≥ 1 s between requests per host) and back off on 429/5xx honouring `Retry-After`.

## Attribution

None required. Cards show "Greenhouse" linked to https://www.greenhouse.com and the posting's `absolute_url`.

## robots.txt

`https://boards-api.greenhouse.io/robots.txt` disallows only `/embed/` for all agents (checked 2026-10-24). Treated as an API (`robots: "none"`); the paths we read are allowed anyway.

## Fields mapped

`id` → `sourceId` (`{token}:{id}`), `absolute_url` → url + applyUrl, `title`, `company_name` (else the token), `location.name` split on `;` (else `offices[].location`/`name`), `content` (HTML) → description, `first_published` (else `updated_at`) → postedAt, `application_deadline` → deadline, `language` → language. `isDirectFromEmployer: true`.
