# Kariyer.net

Connector: `packages/jobs-connectors/src/connectors/kariyer.ts` (`kariyer`, kind `scrape`). Checked 2026-10-24.

## Terms (read before shipping, as ADR 0005 requires)

- [Hizmet Sözleşmesi](https://www.kariyer.net/veri-politikamiz/hizmet-sozlesmesi), read in full on 2026-10-24. It is the **candidate (Aday) membership contract**: account creation, CV visibility options, how applications are shared with employers, contact consent, and account obligations (true data, one account, no offensive or infringing content). It has **no clause on automated access, scraping, or reuse of job listings**. It binds members ("Üyeliği Tamamla" / registering); we use no account.
- [Genel Koşullar](https://www.kariyer.net/genel-kosullar) is linked as "Kurallar ve Koşullar". On 2026-10-24 the server-rendered page (fetched with and without a reader) contained only navigation and no terms text: the body is loaded client-side. **The owner should read it in a browser and add any automated-access clause here** before enabling the source for anyone but themself.
- Kariyer.net is a licensed private employment office (İŞKUR licence no. 170). Under law 4904, job seekers are never charged.
- Our use: the owner's own saved searches read one public result page per run. No account, no cookies, no CAPTCHA solving, no republishing.

## Access

- Search: `GET https://www.kariyer.net/is-ilanlari?kw={keywords}` (an empty query reads `/is-ilanlari`). This is the site's own search URL format: its pagination links are `/is-ilanlari?kw=yazilim&cp=2`. We read only page 1 (about 50 cards) and return at most `limit`.
- Rendering: Nuxt server-side HTML. Every result is a `<div data-test="ad-card" …>` whose attributes include `positionName`, `cityName`, `countryName`, `workType`, `workModelText` and `time` (age such as "11 gün"). Inside the card are `/is-ilani/{slug}-{id}` and the `ad-card-title`, `subtitle` (company) and `location` spans. Cards marked `sponsor="true"` are ads and are skipped. `window.__NUXT__` is a minified function and is not parsed. The result page's JSON-LD is only a BreadcrumbList.
- No-result page: `data-test="no-result"`, which returns `[]`. A page without the result list or the no-result notice means the layout changed and maps to `invalid_response`.
- Detail (`fetchDetail`): GET the posting URL. JobPosting JSON-LD is read when present, but **posting pages had none on 2026-10-24** (only a BreadcrumbList). The fallback reads the `data-test="qualifications-and-job-description"` block (HTML), `lastPublishDate` / `closingDate` (dd.mm.yyyy) from the job container, and `data-test="company-name"`.

## Scraping limits (ADR 0005)

`robots: "binding"` (disallowed paths are refused before any request), `minIntervalMs: 5_000` (≤ 1 request per 5 s), honest UA `BruteForceHR/<version> (+https://bruteforcehr.web.app/support)`, no cookies (the site sets PerimeterX `_pxhd` and session cookies, which we never send back), no CAPTCHA solving. A bot challenge maps to `SourceError("blocked")` (HttpClient challenge detection).

Observed on 2026-10-24 with the honest UA: **no challenge**. HTTP 200 with full HTML (search page ≈ 750 KB, posting ≈ 430 KB), so the fixtures are trimmed real excerpts. The challenge test uses a constructed PerimeterX-style 403 page.

Caveat for the owner: a normal result page contains the word "captcha" (an inline config script) within its first 20 KB. `isBotChallenge` ignores it only because real pages are larger than 200 KB. If Kariyer.net ever serves a shorter normal page, it would be misreported as `blocked`.

## Coverage

Turkey. Markets `["TR"]`; `covers` when there is no country filter or the filter includes TR.

## Pricing / limits

Free public pages. `callBudget` null. One search request per run plus one request per listing that passes the filters, all ≥ 5 s apart.

## Attribution

None specified. Cards show "Kariyer.net" and link to the posting (`attribution: { label: "Kariyer.net", url: "https://www.kariyer.net" }`).

## robots.txt

[kariyer.net/robots.txt](https://www.kariyer.net/robots.txt) (2026-10-24) disallows internal and account paths for `*`: `/UploadFiles/`, `/Services/`, `/servisler/`, `/filtre`, `*?ckw*`, `*?copilot*`, `/ozgecmis/*`, `/hesabim`, login and apply flows, and others. It does **not** disallow `/is-ilanlari?kw=` or `/is-ilani/…`. It is binding: a future disallow stops the connector with `blocked`.

## Fields mapped

Card: trailing id of `/is-ilani/{slug}-{id}` → sourceId; absolute URL → url; `ad-card-title` (fallback `positionName`) → title; `subtitle` → company; `location` (fallback `cityName`) + `countryName` → locations ("Ankara, Türkiye"); `workType` (FullTime / Freelance / …) → employment type; `workModelText` ("İş Yerinde" → onsite, "Uzaktan / Remote" → remote, "Hibrit" → unknown) → remote; `time` ("N gün" / "N saat" / "Bugün"; "Son gün" ignored) → postedAt relative to the run; `sectorName` → tags. `language: "tr"`, `isDirectFromEmployer: false`. Detail: description, postedAt (`lastPublishDate`), deadline (`closingDate`), company.
