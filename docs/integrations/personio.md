# Personio

Connector: `packages/jobs-connectors/src/connectors/personio.ts` (`personio`, board connector, kind `keyless`). Checked 2026-10-24.

## Terms

- [Retrieving open positions](https://developer.personio.de/docs/retrieving-open-job-positions) (updated 2025-09-18): "Current open job postings can be retrieved in XML format under `myaccount.jobs.personio.de/xml`." Public, no authentication. No separate terms for the feed.

## Access

- `GET https://{company}.jobs.personio.de/xml` → `<workzag-jobs><position>…</position></workzag-jobs>`. Description blocks are HTML in CDATA; other text is entity-encoded (`&amp;`). Parsed with a small tag reader (no XML dependency), entities decoded with `@bfhr/core` `decodeEntities`.
- Posting page: `https://{company}.jobs.personio.de/job/{id}` (also the apply route).
- Unknown company → HTTP 404 HTML page → `SourceError("invalid_response")`; any 200 body without `<workzag-jobs>` is also `invalid_response`.
- Many positions publish no description blocks in the feed (`<jobDescriptions></jobDescriptions>`; 9 of 10 ottonova positions on 2026-10-24); those listings have an empty description (the posting page still has it, e.g. as JobPosting JSON-LD).

## Coverage

Any company on Personio the user follows (`{company}.jobs.personio.de|com`). Mostly Germany/DACH and EU SMEs. Markets: all.

## Pricing / limits

Free. No rate limit is documented. We apply the HTTP client's API spacing (≥ 1 s per host) and back off on 429/5xx honouring `Retry-After`.

## Attribution

None required. Cards show "Personio" linked to https://www.personio.com and the posting page.

## robots.txt

`https://{company}.jobs.personio.de/robots.txt`: `User-agent: *`, `Allow: /` (checked on `ottonova.jobs.personio.de`, 2026-10-24). Treated as a feed API (`robots: "none"`).

## Fields mapped

`id` → `sourceId` (`{company}:{id}`) and the posting URL, `name` → title, `subcompany` (a trailing internal number such as " - 9680" is dropped; else the subdomain) → company, `office` + `additionalOffices/office` → locations, `employmentType` (`intern`/`trainee` → internship, `freelance` → contract, `working_student` → part time; `permanent` defers to `schedule`) and `schedule` (`full-time`/`part-time`; `full-or-part-time` → none) → employment type, `jobDescriptions/jobDescription` (`name` as `<h3>` + `value` HTML) → description, `createdAt` → postedAt, `department`/`recruitingCategory`/`keywords` → tags. No salary in the feed. `isDirectFromEmployer: true`.
