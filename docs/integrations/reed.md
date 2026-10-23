# Reed

Connector: `packages/jobs-connectors/src/connectors/reed.ts` (`reed`, kind `keyed`). Checked 2026-10-24.

## Terms / documentation

- [Reed Jobseeker API](https://www.reed.co.uk/developers/jobseeker); key via "Sign up for a reed.co.uk API key" on that page. Reed's general [terms and conditions](https://www.reed.co.uk/policies#termsConditions) apply; the API page states no separate attribution or rate terms.

## Access

- Search: `GET https://www.reed.co.uk/api/1.0/search?keywords=…&resultsToTake=…[&minimumSalary=…]` (`resultsToTake` "defaults and is limited to 100").
- Details: `GET https://www.reed.co.uk/api/1.0/jobs/{jobId}` (`fetchDetail`, full description, external apply URL, yearly salary); an unknown id returns a blank job, mapped to `invalid_response`.
- Auth: "include your api key … in a basic authentication http header as the username, leaving the password empty". Secret `REED_API_KEY`; missing → `no_key` before any request. HTTP 401/403 → `blocked` = **bad key**.

## Coverage

UK; markets `["GB"]`.

## Pricing / limits

Free; no published rate limit. `callBudget` null; HTTP spacing 1 s. `adHoc: true`.

## Attribution

None specified; listings link to the Reed `jobUrl`.

## robots.txt

Not applicable (official API).

## Fields mapped

`jobId` → sourceId, `jobTitle`, `employerName`, `locationName`, `minimumSalary`/`maximumSalary`/`currency` (GBP, yearly; search results carry no salary type, so only figures ≥ 1,000 are read as annual — details' `yearlyMinimumSalary`/`yearlyMaximumSalary` replace them), `date` → postedAt and `expirationDate` → deadline (both **dd/MM/yyyy**), `jobUrl` → url/applyUrl (details' `externalUrl` wins), `jobDescription` (truncated in search, full in details), details `contractType`/`fullTime`/`partTime` → employment type. `isDirectFromEmployer: false`. Response field names are not printed in the docs; they follow the documented return fields.
