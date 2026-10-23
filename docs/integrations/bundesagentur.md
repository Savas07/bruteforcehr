# Bundesagentur für Arbeit — Jobsuche

Connector: `packages/jobs-connectors/src/connectors/bundesagentur.ts` (`bundesagentur`, kind `keyless`). Checked 2026-10-24.

## Evaluation outcome (ADR 0005 "evaluate in M4")

**Enabled, under the ADR 0005 owner override.** The API works without a personal key, it covers the largest German job database, and the only applicable terms restrict automated use (see Terms). The source runs because ADR 0005's owner override covers ToS-restricted sources for personal use, with these limits:

- only saved searches and on-demand searches the owner set up, and only searches that cover Germany (`covers`: no country filter, or the filter includes DE);
- low volume: one search request per search (25 results), ≤ 1 request/s per host, honest User-Agent, no cookies;
- detail fetches (`fetchDetail`) only for listings that passed the search filters;
- it is **switched off together with the other restricted sources before the app is offered to anyone else.**

## Terms

- The BA publishes no official API documentation or API terms. The endpoint and the fixed client id come from the community OpenAPI description [jobsuche.api.bund.dev](https://jobsuche.api.bund.dev/) ([GitHub bundesAPI/jobsuche-api](https://github.com/bundesAPI/jobsuche-api), spec version 2.1.0), which says the BA "bietet … bis heute keine offizielle API an".
- [Nutzungsbedingungen arbeitsagentur.de](https://www.arbeitsagentur.de/nutzungsbedingungen) (Stand 08.07.2026), §2a(3): "Aktivitäten, die nicht dem vorgesehenen Nutzen des Portals und der Apps dienen und zu einer hohen Belastung der Infrastruktur führen können, sind zu unterlassen. Es ist nicht zulässig: Robots, Webspider oder ähnliche Technologien einzusetzen sowie bestehende Kommunikations- bzw. Programmierschnittstellen entgegen dem von der BA beabsichtigten Zweck zu verwenden und so Inhalte des Portals oder der Apps zum Zweck der Datensammlung und -auswertung auszulesen …". We do not collect or analyse BA data in bulk: we run one person's own job searches at low volume. This clause is the reason for the override and the limits above.
- Site use is free ("Die Nutzung des Portals ist unentgeltlich", §2a(1)).

## Access

- Search: `GET https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs?was={query}&size=25&page=1&angebotsart=1` with header `X-API-Key: jobboerse-jobsuche`. This is the public client id of the BA's own web app, not a personal key. **`/pc/v4/jobs` (named in ADR 0005 and the community README example) returned HTTP 403 on 2026-10-24.** `/pc/v6/jobs` works, and so does `/pc/v4/app/jobs` according to the spec. v6 results are in `ergebnisliste` and the reference number is in `referenznummer`. `wo` (place) is not sent because searches have no city field. An empty query omits `was`.
- Details: `GET …/pc/v4/jobdetails/{base64(referenznummer)}` (same header; this is the spec's "empfohlene Version"; v3 is the alternative). Search results have no description; `fetchDetail` adds `stellenangebotsBeschreibung`. A 404 (posting removed) maps to `invalid_response`.
- Schema mismatch maps to `invalid_response`. 403 maps to `blocked`, which for this source means the path or client id was retired.

## Coverage

Germany (job offers, `angebotsart=1`; self-employment, apprenticeships and internships are excluded). Markets `["DE"]`.

## Pricing / limits

Free. No published rate limit. `callBudget` null; HTTP spacing 1 s (≤ 1 req/s); 1 search request per search plus 1 detail request per listing that passes the filters.

## Attribution

None required. Cards show "Bundesagentur für Arbeit" and link to the posting on arbeitsagentur.de (`attribution: { label: "Bundesagentur für Arbeit", url: "https://www.arbeitsagentur.de/jobsuche/" }`).

## robots.txt

Not applicable (`robots: "none"`, JSON endpoint). `rest.arbeitsagentur.de/robots.txt` answers 403; `www.arbeitsagentur.de/robots.txt` allows `/` for `*`.

## Fields mapped

`referenznummer` → sourceId; posting URL `https://www.arbeitsagentur.de/jobsuche/jobdetail/{refnr}`; `externeURL` → applyUrl when present (external boards such as yourfirm.de); `stellenangebotsTitel` → title; `firma` → company; `stellenlokationen[].adresse` (`ort`, `land`) → locations ("Berlin, Deutschland"); `veroeffentlichungszeitraum.von` (fallback `datumErsteVeroeffentlichung`) → postedAt; `veroeffentlichungszeitraum.bis` → deadline; `festgehalt` + `verguetungsangabe` (JAHRESGEHALT/MONATSGEHALT/STUNDENLOHN) → salary (EUR); `arbeitszeitVollzeit` / `arbeitszeitTeilzeit*` → employment type; `hauptberuf` → tags; details `stellenangebotsBeschreibung` (Markdown-like text) → description. `language: "de"`, `isDirectFromEmployer: false`. ADR 0005's v4 field names (`refnr`, `titel`, `arbeitgeber`, `arbeitsort`, `aktuelleVeroeffentlichungsdatum`, `externeUrl`) belong to the retired search version.
