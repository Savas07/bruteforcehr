# Workable

Connector: `packages/jobs-connectors/src/connectors/workable.ts` (`workable`, board connector, kind `keyless`). Checked 2026-10-24.

## Terms

- [Workable API reference — `api/accounts/:subdomain`](https://workable.readme.io/reference/jobs-1) (updated 2025-06-10): "Returns a collection of the public jobs for an account"; no authentication (`security: [{}]`); `details=true` "Includes description field for jobs". No separate terms for this public endpoint.

## Access

- Documented: `GET https://www.workable.com/api/accounts/{subdomain}?details=true`. Live on 2026-10-24 it answers **302 → `https://apply.workable.com/api/v1/widget/accounts/{subdomain}?details=true`**, so the connector calls the widget URL directly (one request instead of two).
- Unknown account → HTTP 404 `Not Found` → `SourceError("invalid_response")`.
- The reference describes `url` as the application form and `application_url` as the job page; the live data is the other way round (`url` = `https://apply.workable.com/j/{shortcode}`, `application_url` = `…/apply`), and the connector follows the live data.

## Coverage

Any company on Workable the user follows (`apply.workable.com/{subdomain}`, `{subdomain}.workable.com`). Markets: all.

## Pricing / limits

Free. No rate limit is documented. We apply the HTTP client's API spacing (≥ 1 s per host) and back off on 429/5xx honouring `Retry-After`.

## Attribution

None required. Cards show "Workable" linked to https://www.workable.com and the job URL.

## robots.txt

`https://apply.workable.com/robots.txt`: `User-agent: *`, `Content-Signal: search=yes, ai-input=yes, ai-train=no`, empty `Disallow:` (everything allowed; checked 2026-10-24). Treated as an API (`robots: "none"`). We don't train models on the data.

## Fields mapped

`shortcode` → `sourceId` (`{subdomain}:{shortcode}`), `url` → url, `application_url` → applyUrl, `title`, account `name` (else the subdomain) → company, non-hidden `locations[]` (city, region, country; else top-level `city`/`state`/`country`) → locations, `telecommuting` → remote flag, `employment_type` (Full-time, Part-time, Contract, Temporary, Internship) → employment type, `description` (HTML) → description, `published_on` (else `created_at`) → postedAt, `department`/`function` → tags. The reference also lists `workplace_type` (`on_site`/`hybrid`/`remote`); the widget response did not include it on 2026-10-24, so hybrid comes only from wording. No salary in the API. `isDirectFromEmployer: true`.
