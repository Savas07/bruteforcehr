# USAJOBS

Connector: `packages/jobs-connectors/src/connectors/usajobs.ts` (`usajobs`, kind `keyed`). Checked 2026-10-24.

## Terms

- [USAJOBS API Terms of Service](https://developer.usajobs.gov/guides/terms-of-service): Public Data is under an open license (commercial or noncommercial reuse, no prior approval). Credentials must not be shared; rate limits must not be circumvented; don't present modified data as official or imply OPM endorsement; applications follow the announcement's official instructions. OPM _encourages_ naming USAJOBS as the source, linking the current official announcement, showing the retrieval date, and stating the product isn't endorsed by OPM. The Search API "is designed to support lightweight JOA content consumption" by job boards and apps ([GET /api/Search](https://developer.usajobs.gov/api-reference/get-api-search)).

## Access

- `GET https://data.usajobs.gov/api/search?Keyword=…&ResultsPerPage=…[&DatePosted=0–60][&RemoteIndicator=True]`.
- Headers per [Authentication](https://developer.usajobs.gov/guides/authentication): `Host: data.usajobs.gov`, `User-Agent: {email used to request the key}`, `Authorization-Key: {key}`. Key via the [API request form](https://developer.usajobs.gov/apirequest/index).
- Secrets `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT` (the registered email). Missing → `no_key` before any request. HTTP 401/403 → `blocked` = **bad key or email mismatch**.

## Coverage

US federal jobs; markets `["US"]`. Defaults to "Public" jobs.

## Pricing / limits

Free. [Rate limiting](https://developer.usajobs.gov/guides/rate-limiting): max 500 rows per page, max 10,000 rows per query; no request-rate figure published. `callBudget` null; HTTP spacing 1 s. `adHoc: true`.

## Attribution

Not required (encouraged per the terms above); listings link to `PositionURI`. Apply links carry the default `PostingChannelID=RESTAPI` (a custom PCI can be requested from recruiter-help@usajobs.gov).

## robots.txt

Not applicable (official API).

## Fields mapped

`MatchedObjectId` → sourceId, `PositionTitle`, `OrganizationName` (fallback `DepartmentName`), `PositionLocation[].LocationName`, `PositionRemuneration[0]` Min/Max + `RateIntervalCode` (PA year, PM month, PD day, PH hour; others → no salary), USD, `PositionSchedule[0].Code` (1 full-time, 2 part-time), `PublicationStartDate` → postedAt, `ApplicationCloseDate` → deadline, `PositionURI` → url, `ApplyURI[0]` → applyUrl, `UserArea.Details.JobSummary` (+ `QualificationSummary`) → description, `JobCategory[].Name` → tags. `isDirectFromEmployer: true` (the federal employer's own posting system).
