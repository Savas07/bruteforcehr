# Jooble

Connector: `packages/jobs-connectors/src/connectors/jooble.ts` (`jooble`, kind `keyed`). Checked 2026-10-24.

## Terms / documentation

- [Jooble REST API documentation](https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation) (modified 16 Aug 2026). The page lists no separate API terms beyond the partner programme; listings link to Jooble's `link` URL.

## Access

- `POST https://jooble.org/api/{key}`, `Content-Type: application/json`, body `{ keywords, location, page, ResultOnPage, salary? }`. The docs mark `location` as required; we send the key country's English name ("United Kingdom", …).
- **Each country domain needs its own key**: "a key generated on jooble.org provides access exclusively to US job listings"; other countries register on the regional domain (e.g. `uk.jooble.org/api/about`, `de.jooble.org/api/about`). The docs only show the `jooble.org/api/{key}` endpoint; the key selects the country.
- Secret `JOOBLE_API_KEYS` = `cc=key,cc=key` (lower-case ISO code; `uk` accepted as Jooble's name for GB), parsed by `parseJoobleKeys`. No parsable key → `no_key` before any request. HTTP 403 ("Invalid or missing API key") → `blocked` = **bad key**.

## Coverage

Declared markets TR, DE, NL, GB, US. One request per search: the first filter country that has a key; US when the search has no country filter. A filtered search with no matching key returns nothing (a key never answers for another country).

## Pricing / limits

"The free REST API plan includes a total lifetime limit of **500 requests per key** (this is an absolute lifetime quota, not a monthly limit)." Therefore `adHoc: false` (saved searches only, ADR 0005) and `callBudget = { limit: 450 × keys, period: "lifetime" }` (50 per key kept in reserve). HTTP spacing 1 s.

## Attribution

None specified in the docs; job cards show "Jooble" and link to the Jooble `link`.

## robots.txt

Not applicable (official API).

## Fields mapped

`id` → `sourceId` (`{country}:{id}`), `link` → url, `title`, `company`, `location`, `salary` (only clear ranges: two figures + known currency + stated period or yearly-sized figures; otherwise null), `type` → employment type, `updated` → postedAt, `snippet` → description. `isDirectFromEmployer: false`. Very large negative ids may exceed JavaScript's safe integer range.
