# Company careers pages (JSON-LD)

Connector: `packages/jobs-connectors/src/connectors/careers-page.ts` (`careersPage`, id/ats `web`, board connector, kind `scrape`). Checked 2026-10-24.

## Terms

- The page belongs to an employer the user follows (watchlist) and whose careers URL does not match a supported ATS (`detectAtsBoard` returns null). Each site's own terms apply; per the owner override in [ADR 0005](../adr/0005-job-sources-scraping.md), public pages on the watchlist may be fetched even when a site's terms restrict automated access, within the hard limits (no login, no CAPTCHA solving, no evasion, honest User-Agent, polite rate).
- The data read is the employer's own schema.org markup, published for machine consumption: [schema.org/JobPosting](https://schema.org/JobPosting) and [Google Search Central — Job posting structured data](https://developers.google.com/search/docs/appearance/structured-data/job-posting).

## Access

- `GET {careersUrl}` (board token = the full careers URL; only `http(s)`), `Accept: text/html`, honest UA, no cookies.
- Every `<script type="application/ld+json">` block is parsed; `JobPosting` objects are collected at the top level, in arrays, in `@graph`, and in `ItemList.itemListElement[]` (`ListItem.item`). Broken JSON blocks and non-posting types are ignored; postings without a `title` are skipped; if postings exist but none is readable → `invalid_response`.
- No postings on the page → `[]` (the watchlist entry then shows `not_found`). HTTP 404 → `invalid_response`; a bot challenge or CAPTCHA page (Cloudflare "Just a moment…", `cf-mitigated: challenge`, etc.) → `SourceError("blocked")` from the HTTP client — we never solve it; the user can paste the description instead.
- Only JSON-LD is read here; microdata/RDFa and LLM extraction are out of scope for this connector.

## Coverage

Any employer careers page with JobPosting JSON-LD (many CMS and ATS-hosted pages emit it, e.g. Personio job pages). Markets: all.

## Pricing / limits

Free. ADR 0005 limits: ≤ 1 request / 5 s per host (the HTTP client's default when robots handling is on), ≤ 200 pages / host / day, back-off on 429/503 honouring `Retry-After`. One request per followed page per run (plus one robots.txt fetch per origin).

## Attribution

The source is the employer itself: cards show the company name and link to the posting URL (or the careers page). Label "Company careers page".

## robots.txt

Fetched and **recorded** per host (`robots: "record"`), **not binding**: the page is user-watchlisted, which ADR 0005 treats as user-initiated retrieval of a single page. The owner's per-host kill switch / denylist still applies.

## Fields mapped

`url` (resolved against the page URL) → url + applyUrl (else the page URL), `sourceId` = posting URL, else `{pageUrl}#{identifier}` (`identifier` text or `PropertyValue.value`), else the page URL for a single posting (`{pageUrl}#{title}` when several), `title`, `hiringOrganization.name` (else the page host) → company, first employer domain among `hiringOrganization.sameAs`/`url` and the page URL (job boards/ATS hosts excluded) → companyDomain, `jobLocation[].address` (`PostalAddress` locality, region, country, or text) or `Place.name` → locations, `jobLocationType: TELECOMMUTE` → remote, `applicantLocationRequirements[].name` → remoteEligibility, `baseSalary` (`MonetaryAmount.currency` + number or `QuantitativeValue` `value`/`minValue`/`maxValue`, `unitText` YEAR/MONTH/DAY/HOUR) → salary, `employmentType` (FULL_TIME, PART_TIME, CONTRACTOR, TEMPORARY, INTERN; several distinct types → none) → employment type, `description` (HTML) → description, `datePosted` → postedAt, `validThrough` → deadline. `isDirectFromEmployer: true`.
