# Adzuna

Connector: `packages/jobs-connectors/src/connectors/adzuna.ts` (`adzuna`, kind `keyed`). Checked 2026-10-24.

## Terms

- [Adzuna API Terms of Service](https://developer.adzuna.com/docs/terms_of_service): permitted uses include **personal job search** and publishing Adzuna ad listings; commercial/analysis/resale use needs a written agreement; commercial organisations get a 14-day trial only. Creating multiple accounts for one individual is misuse. On termination all Adzuna data must be removed.
- Contacting a third-party content provider about listings is a breach — all queries go via Adzuna.

## Access

- `GET https://api.adzuna.com/v1/api/jobs/{country}/search/1?app_id=…&app_key=…&results_per_page=…&what=…&salary_min=…&max_days_old=…&content-type=application/json` ([Search docs](https://developer.adzuna.com/docs/search), [interactive reference](https://developer.adzuna.com/activedocs)).
- Secrets `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (free on signup). Missing → `no_key` before any request. HTTP 401/403 → `blocked`, which for this source means **a bad or revoked key**.

## Coverage

Country endpoints gb, us, de, nl, at, au, be, br, ca, ch, es, fr, in, it, mx, nz, pl, sg, za — **no Turkey** ([ADR 0005](../adr/0005-job-sources-scraping.md)). One request per covered filter country (max 3 per search); without a country filter: gb, de, nl. `salary_min` is sent only for a yearly floor in the country's currency.

## Pricing / limits

"Every registered API user receives a free API key … The free tier is intended for evaluating the API. Paid plans are available for personal and academic use at higher volumes. The plans available to you, and their limits, are shown in your account." The terms publish no numbers — the owner must read the limits in the Adzuna account after registering. `callBudget` is null; we space requests ≥ 2 s per host. `adHoc: true`.

## Attribution (hard requirement)

Each displayed advert is labelled "Adzuna", **at least 116 × 23 px**, hyperlinked to http://www.adzuna.co.uk or the relevant local domain (logos: http://www.adzuna.co.uk/press.html). Encoded as `attribution.minSize = { width: 116, height: 23 }`.

## robots.txt

Not applicable (official API, `robots: "none"`).

## Fields mapped

`id` → `sourceId` (`{country}:{id}`), `redirect_url` → url + applyUrl, `title`, `company.display_name`, `location.display_name` (+ `area[0]` country), `salary_min`/`salary_max` (country currency, yearly; `salary_is_predicted` → `estimated`), `contract_time`/`contract_type` → employment type, `created` → postedAt, `description` (snippet only, per the docs), `category.label` → tags. `isDirectFromEmployer: false`.
