# SmartRecruiters

Connector: `packages/jobs-connectors/src/connectors/smartrecruiters.ts` (`smartrecruiters`, board connector with `fetchDetail`, kind `keyless`). Checked 2026-10-24.

## Terms

- [Posting API](https://developers.smartrecruiters.com/docs/posting-api) (updated 2026-08-24): "allows our customers to build fully customizable career sites … Posting API allows for access to a job posting that was previously made public using SmartRecruiters application." The page notes API-key / OAuth authentication (scope `internal_postings_read`) for **internal** postings; public postings are readable without credentials (verified live 2026-10-24).
- [Endpoints](https://developers.smartrecruiters.com/docs/endpoints): `/postings` lists active postings; `/postings/{postingId}` returns the full posting.

## Access

- List: `GET https://api.smartrecruiters.com/v1/companies/{companyIdentifier}/postings?offset={n}&limit=100` (also `q`, `country`, `city`, `department`, `language` filters, unused). The list items lack the job text.
- Detail (`fetchDetail`, called only for listings that pass the search filters): `GET https://api.smartrecruiters.com/v1/companies/{companyIdentifier}/postings/{postingId}` → `jobAd.sections`, `postingUrl`, `applyUrl`.
- Unknown company → HTTP 200 with `totalFound: 0` → no listings (not an error). Unknown posting → HTTP 404 → `SourceError("invalid_response")`.

## Coverage

Any company on SmartRecruiters the user follows (`careers.smartrecruiters.com/{id}`, `jobs.smartrecruiters.com/{id}`). Markets: all. Large employers publish thousands of postings (BoschGroup: 5,087 on 2026-10-24); we read **at most 200 per board** (two pages of 100, newest first as returned).

## Pricing / limits

Free. No rate limit is documented for the public endpoints. We apply the HTTP client's API spacing (≥ 1 s per host) and back off on 429/5xx honouring `Retry-After`. A board costs ≤ 2 list calls plus one detail call per listing that passes the filters.

## Attribution

None required. Cards show "SmartRecruiters" linked to https://www.smartrecruiters.com and the posting URL.

## robots.txt

`https://api.smartrecruiters.com/robots.txt` allows `/v1/companies/` only for `LinkedInBot` and has `User-agent: *` / `Disallow: /` for everyone else (checked 2026-10-24). Per ADR 0005, robots.txt binds crawling of search-result pages, not official APIs read for watchlisted companies, so the connector uses `robots: "none"`. **Owner decision:** if this is to be honoured, disable the source.

## Fields mapped

`id` → `sourceId` (`{companyIdentifier}:{id}`), `https://jobs.smartrecruiters.com/{company}/{id}` → url/applyUrl until the detail's `postingUrl`/`applyUrl` replace them, `name` → title, `company.name` (else the identifier) → company, `location.fullLocation` (else city, region, country code) → locations, `location.remote`/`hybrid` (both false → onsite) → remoteType, `typeOfEmployment.label` (Full-time, Part-time, Intern, Contract, Permanent…) → employment type, `releasedDate` → postedAt, `language.code` → language, `function.label`/`department.label` → tags; detail `jobAd.sections` (`companyDescription`, `jobDescription`, `qualifications`, `additionalInformation`, each as `<h3>title</h3>` + HTML, empty ones skipped) → description. No salary in the public API. `isDirectFromEmployer: true`.
