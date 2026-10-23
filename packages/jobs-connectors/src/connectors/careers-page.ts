import { type EmploymentType, type SalaryPeriod, type SalaryRange, hostOf, httpUrlParts } from "@bfhr/core";
import { z } from "zod";
import { employerDomain, parseDate, salaryRange } from "../listing";
import { type BoardConnector, type Listing, SourceError } from "../types";

const Text = z.union([z.string(), z.number()]).transform(String);
/** schema.org properties may hold one value or an array of them. */
const many = <T extends z.ZodType>(schema: T) =>
  z.union([schema, z.array(schema)]).transform((value) => (Array.isArray(value) ? value : [value]));

const Named = z.union([Text, z.object({ name: Text.nullish() }).transform((value) => value.name ?? null)]);
const Address = z.union([
  Text,
  z
    .object({
      addressLocality: Text.nullish(),
      addressRegion: Text.nullish(),
      addressCountry: Named.nullish(),
    })
    .transform((value) =>
      [value.addressLocality, value.addressRegion, value.addressCountry]
        .filter((part) => (part ?? "").trim() !== "")
        .join(", "),
    ),
]);
const Amount = z.union([z.number(), z.string().transform(Number)]).nullish();

const JobPostingSchema = z.object({
  title: Text,
  url: z.string().nullish(),
  identifier: z
    .union([Text, z.object({ value: Text.nullish() }).transform((value) => value.value ?? null)])
    .nullish(),
  hiringOrganization: z
    .union([
      Text.transform((name) => ({ name, sameAs: [] as string[], url: null })),
      z.object({ name: Text.nullish(), sameAs: many(z.string()).nullish(), url: z.string().nullish() }),
    ])
    .nullish(),
  jobLocation: many(z.object({ name: Text.nullish(), address: Address.nullish() })).nullish(),
  jobLocationType: many(z.string()).nullish(),
  applicantLocationRequirements: many(Named).nullish(),
  baseSalary: z
    .object({
      currency: z.string().nullish(),
      value: z.union([
        Amount,
        z.object({ value: Amount, minValue: Amount, maxValue: Amount, unitText: z.string().nullish() }),
      ]),
      unitText: z.string().nullish(),
    })
    .nullish(),
  employmentType: many(z.string()).nullish(),
  datePosted: z.string().nullish(),
  validThrough: z.string().nullish(),
  description: z.string().nullish(),
});
type JobPosting = z.infer<typeof JobPostingSchema>;

const UNITS: Readonly<Record<string, SalaryPeriod>> = {
  YEAR: "year",
  MONTH: "month",
  DAY: "day",
  HOUR: "hour",
};

const EMPLOYMENT_TYPES: Readonly<Record<string, EmploymentType>> = {
  FULL_TIME: "full_time",
  PART_TIME: "part_time",
  CONTRACTOR: "contract",
  TEMPORARY: "temporary",
  INTERN: "internship",
};

/** JobPosting objects anywhere in a JSON-LD document: top level, arrays, `@graph`, `ItemList`. */
function collectPostings(node: unknown, found: unknown[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectPostings(item, found);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const record = node as Record<string, unknown>;
  const type = record["@type"];
  if ((Array.isArray(type) ? type : [type]).includes("JobPosting")) {
    found.push(record);
    return;
  }
  for (const key of ["@graph", "itemListElement", "item"]) collectPostings(record[key], found);
}

function baseSalary(salary: JobPosting["baseSalary"]): SalaryRange | null {
  if (salary === null || salary === undefined) return null;
  const value = salary.value;
  const quantity =
    typeof value === "object" && value !== null
      ? value
      : { value, minValue: null, maxValue: null, unitText: null };
  const period = UNITS[(quantity.unitText ?? salary.unitText ?? "").toUpperCase()];
  if (period === undefined) return null;
  return salaryRange(
    quantity.minValue ?? quantity.value,
    quantity.maxValue ?? quantity.value,
    salary.currency,
    period,
  );
}

/**
 * A followed company's own careers page (`ats: "web"`, board token = the page URL): schema.org
 * `JobPosting` JSON-LD read from the page. robots.txt is recorded, not binding (watchlisted page,
 * ADR 0005); a bot challenge stops with `blocked`. Pages without postings yield nothing.
 */
export const careersPage: BoardConnector = {
  id: "web",
  ats: "web",
  label: "Careers page",
  kind: "scrape",
  markets: ["remote", "TR", "DE", "NL", "GB", "US"],
  attribution: { label: "Company careers page", url: "https://schema.org/JobPosting", minSize: null },
  async list(board, context): Promise<Listing[]> {
    if (httpUrlParts(board.boardToken) === null)
      throw new SourceError("invalid_response", "careers URL is not http(s)");
    const response = await context.http.getText(board.boardToken, {
      robots: "record",
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    const pageUrl = response.url;
    const found: unknown[] = [];
    for (const [, script = ""] of response.body.matchAll(
      /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
    )) {
      try {
        collectPostings(JSON.parse(script.trim().replace(/^<!--|-->$/g, "")), found);
      } catch {
        // Broken JSON-LD blocks are common on CMS pages; the others still count.
      }
    }
    const postings = found.flatMap((raw) => {
      const parsed = JobPostingSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    });
    if (found.length > 0 && postings.length === 0)
      throw new SourceError("invalid_response", "unreadable JobPosting data");
    return postings.map((posting) => {
      const url =
        posting.url && URL.canParse(posting.url, pageUrl) ? new URL(posting.url, pageUrl).href : null;
      const organization = posting.hiringOrganization;
      const types = [
        ...new Set(
          (posting.employmentType ?? [])
            .flatMap((value) => value.split(","))
            .map((value) => EMPLOYMENT_TYPES[value.trim().toUpperCase()])
            .filter((value) => value !== undefined),
        ),
      ];
      const eligibility = (posting.applicantLocationRequirements ?? [])
        .filter((name) => (name ?? "") !== "")
        .join(", ");
      return {
        source: "web",
        sourceId:
          url ??
          (posting.identifier
            ? `${pageUrl}#${posting.identifier}`
            : postings.length === 1
              ? pageUrl
              : `${pageUrl}#${posting.title}`),
        url: url ?? pageUrl,
        applyUrl: url ?? pageUrl,
        isDirectFromEmployer: true,
        title: posting.title,
        company: organization?.name ?? hostOf(pageUrl) ?? "",
        companyDomain:
          [...(organization?.sameAs ?? []), organization?.url, pageUrl]
            .map(employerDomain)
            .find((domain) => domain !== null) ?? null,
        locations: (posting.jobLocation ?? [])
          .map((place) => (place.address ?? place.name ?? "").trim())
          .filter((label) => label !== ""),
        remoteType: (posting.jobLocationType ?? []).some((type) => type.toUpperCase() === "TELECOMMUTE")
          ? "remote"
          : null,
        remoteEligibility: eligibility === "" ? null : eligibility,
        // Several types ("FULL_TIME", "PART_TIME") name no single one.
        employmentType: types.length === 1 ? (types[0] ?? null) : null,
        salary: baseSalary(posting.baseSalary),
        description: posting.description ?? "",
        postedAt: parseDate(posting.datePosted),
        deadline: parseDate(posting.validThrough),
      };
    });
  },
};
