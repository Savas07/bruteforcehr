import type { EmploymentType, SalaryPeriod } from "@bfhr/core";
import { z } from "zod";
import { parseDate, salaryRange } from "../listing";
import { type Listing, type SearchConnector, SourceError } from "../types";

const AddressSchema = z.object({
  plz: z.string().nullish(),
  ort: z.string().nullish(),
  region: z.string().nullish(),
  land: z.string().nullish(),
});
const BaJobSchema = z.object({
  referenznummer: z.string(),
  stellenangebotsTitel: z.string(),
  firma: z.string().nullish(),
  stellenlokationen: z.array(z.object({ adresse: AddressSchema.nullish() })).nullish(),
  veroeffentlichungszeitraum: z.object({ von: z.string().nullish(), bis: z.string().nullish() }).nullish(),
  datumErsteVeroeffentlichung: z.string().nullish(),
  externeURL: z.string().nullish(),
  arbeitszeitVollzeit: z.boolean().nullish(),
  arbeitszeitTeilzeitVormittag: z.boolean().nullish(),
  arbeitszeitTeilzeitNachmittag: z.boolean().nullish(),
  arbeitszeitTeilzeitAbend: z.boolean().nullish(),
  arbeitszeitTeilzeitFlexibel: z.boolean().nullish(),
  verguetungsangabe: z.string().nullish(),
  festgehalt: z.number().nullish(),
  hauptberuf: z.string().nullish(),
  stellenangebotsBeschreibung: z.string().nullish(),
});
const BaSearchSchema = z.object({ ergebnisliste: z.array(BaJobSchema).nullish() });

const API = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
/** Public client id of the BA's own web app (community-documented, not a personal key). */
const HEADERS = { "X-API-Key": "jobboerse-jobsuche", Accept: "application/json" };
const SALARY_PERIODS: Readonly<Record<string, SalaryPeriod>> = {
  JAHRESGEHALT: "year",
  MONATSGEHALT: "month",
  STUNDENLOHN: "hour",
};

function toListing(job: z.infer<typeof BaJobSchema>): Listing {
  const locations = (job.stellenlokationen ?? []).flatMap(({ adresse }) => {
    const land = adresse?.land ?? "";
    const parts = [adresse?.ort, land === "" ? null : land.charAt(0) + land.slice(1).toLowerCase()];
    const text = parts.filter((part) => part !== null && part !== undefined && part !== "").join(", ");
    return text === "" ? [] : [text];
  });
  const partTime =
    job.arbeitszeitTeilzeitVormittag === true ||
    job.arbeitszeitTeilzeitNachmittag === true ||
    job.arbeitszeitTeilzeitAbend === true ||
    job.arbeitszeitTeilzeitFlexibel === true;
  const employmentType: EmploymentType | null =
    job.arbeitszeitVollzeit === true ? "full_time" : partTime ? "part_time" : null;
  const period = SALARY_PERIODS[job.verguetungsangabe ?? ""];
  return {
    source: "bundesagentur",
    sourceId: job.referenznummer,
    url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(job.referenznummer)}`,
    applyUrl: job.externeURL ?? null,
    isDirectFromEmployer: false,
    title: job.stellenangebotsTitel,
    company: job.firma ?? "",
    locations: [...new Set(locations)],
    employmentType,
    salary: period === undefined ? null : salaryRange(job.festgehalt, job.festgehalt, "EUR", period),
    description: job.stellenangebotsBeschreibung ?? "",
    postedAt: parseDate(job.veroeffentlichungszeitraum?.von ?? job.datumErsteVeroeffentlichung),
    deadline: parseDate(job.veroeffentlichungszeitraum?.bis),
    tags: job.hauptberuf ? [job.hauptberuf] : [],
    language: "de",
  };
}

/**
 * Bundesagentur für Arbeit Jobsuche (keyless: the web app's public client id; docs/integrations/
 * bundesagentur.md). Search `/pc/v6/jobs` has no descriptions; `fetchDetail` reads
 * `/pc/v4/jobdetails/{base64(refnr)}`.
 */
export const bundesagentur: SearchConnector = {
  id: "bundesagentur",
  label: "Bundesagentur für Arbeit",
  kind: "keyless",
  markets: ["DE"],
  attribution: {
    label: "Bundesagentur für Arbeit",
    url: "https://www.arbeitsagentur.de/jobsuche/",
    minSize: null,
  },
  secrets: [],
  adHoc: true,
  callBudget: () => null,
  covers: (query) => query.filters.countryCodes.length === 0 || query.filters.countryCodes.includes("DE"),
  async search(query, context): Promise<Listing[]> {
    const params = new URLSearchParams();
    if (query.query.trim() !== "") params.set("was", query.query.trim());
    params.set("size", "25");
    params.set("page", "1");
    params.set("angebotsart", "1");
    const parsed = BaSearchSchema.safeParse(
      await context.http.getJson(`${API}/pc/v6/jobs?${params.toString()}`, { headers: HEADERS }),
    );
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected Jobsuche payload");
    return (parsed.data.ergebnisliste ?? []).slice(0, query.limit).map(toListing);
  },
  async fetchDetail(listing, context): Promise<Listing> {
    if (listing.sourceId === null) return listing;
    const code = Buffer.from(listing.sourceId, "utf8").toString("base64");
    const response = await context.http.request(`${API}/pc/v4/jobdetails/${encodeURIComponent(code)}`, {
      headers: HEADERS,
      acceptStatus: [404],
    });
    if (response.status === 404) throw new SourceError("invalid_response", "posting no longer listed");
    let json: unknown;
    try {
      json = JSON.parse(response.body);
    } catch {
      throw new SourceError("invalid_response", "Jobsuche detail is not JSON");
    }
    const parsed = BaJobSchema.safeParse(json);
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected Jobsuche detail payload");
    const detail = toListing(parsed.data);
    return { ...listing, ...detail, applyUrl: detail.applyUrl ?? listing.applyUrl ?? null };
  },
};
