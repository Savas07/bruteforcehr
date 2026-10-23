# Recruitee

Connector: `packages/jobs-connectors/src/connectors/recruitee.ts` (`recruitee`, board connector, kind `keyless`). Checked 2026-10-24.

## Terms

- [Intro to Careers Site API](https://docs.recruitee.com/reference/intro-to-careers-site-api) (updated 2026-09-08): the API "allows to view company's jobs and add new candidates to jobs from candidate perspective … Common usage of this API would be, for example, to display a list of job offers". We only read offers; we never create candidates.
- [`/offers/`](https://docs.recruitee.com/reference/offers): "Returns a collection of published company jobs"; no authentication (`security: [{}]`).

## Access

- `GET https://{company}.recruitee.com/api/offers/` (optional `department`/`tag` filters, unused).
- Unknown company → HTTP 404 `{"error":"Not Found"}` → `SourceError("invalid_response")`.
- `careers_url` may point to the company's own careers domain (e.g. `jobs.channable.com`), which then becomes the job's `companyDomain`.

## Coverage

Any company on Recruitee the user follows (`{company}.recruitee.com`). Strong in the Netherlands/EU. Markets: all.

## Pricing / limits

Free. No rate limit is documented. We apply the HTTP client's API spacing (≥ 1 s per host) and back off on 429/5xx honouring `Retry-After`.

## Attribution

None required. Cards show "Recruitee" linked to https://recruitee.com and the offer's `careers_url`.

## robots.txt

`https://{company}.recruitee.com/robots.txt` redirects to the careers site's own robots.txt when a custom domain is set (e.g. `jobs.channable.com/robots.txt`). Treated as an API (`robots: "none"`).

## Fields mapped

`id` → `sourceId` (`{company}:{id}`), `careers_url` → url, `careers_apply_url` → applyUrl, `title`, `company_name` (else the subdomain) → company, `locations[]` (city or name, country) else `location` → locations, `remote`/`hybrid`/`on_site` → remoteType, `employment_type_code` prefix (`fulltime…`, `parttime…`, `contract`, `freelance`, `internship`, `traineeship`, `temporary`) → employment type, `salary` (string `min`/`max`, `currency`, `period` year/month/day/hour) → salary, `description` + `requirements` (HTML) → description, `published_at` (else `created_at`) → postedAt, `close_at` → deadline, `tags` + `department` → tags. `isDirectFromEmployer: true`.
