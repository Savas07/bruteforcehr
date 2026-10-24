# Remote OK

Connector: `packages/jobs-connectors/src/connectors/remoteok.ts` (`remoteok`, kind `keyless`). Checked 2026-10-24.

## Terms

- The first element of the API response is the legal notice (fetched 2026-10-24): "API Terms of Service: Please link back (with follow, and without nofollow!) to the URL on Remote OK and mention Remote OK as a source, so we get traffic back from your site. If you do not we'll have to suspend API access. Please don't use the Remote OK logo without written permission as it's a registered trademark, please DO use our name Remote OK though."
- [Remote OK legal](https://remoteok.com/legal): "You agree to link back with a web hyperlink or in-app hyperlink to our site on the page or app screen where you use the data from our APIs or site."

## Access

- `GET https://remoteok.com/api`, no auth; returns a JSON array whose element 0 is the legal notice (skipped) followed by ~100 latest jobs. No query parameters used.
- Whole feed cached **6 hours** under feed-cache key `remoteok`, filtered with `matchesQuery`.
- Non-JSON, an empty array, or job elements failing the schema → `invalid_response` (not cached).

## Coverage

Remote jobs worldwide; `location` (free text, e.g. "Your Remote US Home Office") → `remoteEligibility`. Markets `["remote"]`; `covers` when the search has no remote-type filter or includes `remote`.

## Pricing / limits

Free; no published rate limit. `robots.txt` asks `Crawl-delay: 1`. `callBudget` null; ≤ 4 fetches a day via the cache; HTTP spacing 1 s.

## Attribution (hard requirement)

Show the name "Remote OK" (text, **not the logo**) and link to the posting's Remote OK `url` with a normal followed link — the UI must not add `rel="nofollow"` to this link. `attribution: { label: "Remote OK", url: "https://remoteok.com" }`.

## robots.txt

Not applicable to the API (`robots: "none"`); [remoteok.com/robots.txt](https://remoteok.com/robots.txt) allows `/` for `*` with `Crawl-delay: 1`, disallowing only AJAX paths.

## Fields mapped

`id` → sourceId, `url` → url, `apply_url` → applyUrl (currently also a remoteOK.com URL), `position` → title, `company`, `tags`, `location` → remoteEligibility, `salary_min`/`salary_max` → salary (USD, yearly; 0 = absent), `date` (ISO; `epoch` fallback) → postedAt, `description` (HTML). `remote: true`, `isDirectFromEmployer: false`.
