/** A `jobImportUrl` answer for the import tests (a new Greenhouse-like posting read from JSON-LD). */
import { type JobImportUrlResponse, type JobSourceLink, jobSourceKey, jobToWire } from "@bfhr/core";
import { FIXTURE_NOW } from "@bfhr/fixtures";

export const TEST_IMPORT_URL = "https://boards.example-ats.com/lindenhof/jobs/4821";

export function testImportResponse(overrides: Partial<JobImportUrlResponse> = {}): JobImportUrlResponse {
  const link: JobSourceLink = {
    source: "url_import",
    sourceId: null,
    url: TEST_IMPORT_URL,
    applyUrl: `${TEST_IMPORT_URL}/apply`,
    applyEmail: null,
    isDirectFromEmployer: true,
    title: "Senior Frontend Engineer",
    locationText: "Berlin, hybrid",
    salary: { min: 70_000, max: 85_000, currency: "EUR", period: "year", estimated: false },
    postedAt: FIXTURE_NOW,
    firstSeenAt: FIXTURE_NOW,
    lastSeenAt: FIXTURE_NOW,
  };
  return {
    job: jobToWire({
      sources: [link],
      sourceKeys: [jobSourceKey(link)],
      applyUrl: link.applyUrl,
      applyEmail: null,
      company: "Lindenhof Mobility",
      companyDomain: "lindenhof-mobility.de",
      title: link.title,
      locations: [
        { label: "Berlin", city: "Berlin", countryCode: "DE" },
        { label: "Munich", city: "Munich", countryCode: "DE" },
      ],
      remoteType: "hybrid",
      remoteEligibility: null,
      employmentType: "full_time",
      seniority: "senior",
      salary: link.salary,
      visaSponsorship: true,
      relocationSupport: null,
      language: "en",
      description: "You'll own our React and TypeScript web app.",
      skills: ["react", "typescript"],
      postedAt: FIXTURE_NOW,
      expiresAt: null,
      fingerprint: "lindenhof mobility|senior frontend engineer|berlin",
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    }),
    existingJobId: null,
    method: "json_ld",
    site: "greenhouse",
    confidence: { title: 0.98, company: 0.97, locations: 0.9, salary: 0.72, description: 0.95 },
    warnings: [],
    model: "none",
    promptVersion: null,
    finalUrl: TEST_IMPORT_URL,
    robots: "allowed",
    ...overrides,
  };
}
