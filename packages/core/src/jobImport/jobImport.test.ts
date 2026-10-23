import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JobSchema } from "../job";
import { detectBlock } from "./block";
import { buildImportedJob } from "./build";
import { jobFromWire, jobToWire, JobImportUrlResponseSchema } from "./contract";
import { extractFromHtml, withApiResult } from "./extract";
import { parseHtml, blockText } from "./html";
import { robotsVerdict } from "./robots";
import { siteFor } from "./sites";
import { importUrlFrom } from "./url";

// Pages recorded with packages/fixtures/scripts/record-job-page.ts (public pages, honest UA).
const page = (name: string): string =>
  readFileSync(path.join(import.meta.dirname, "../../../fixtures/job-pages", name), "utf8");
const json = (name: string): unknown => JSON.parse(page(name));
const AT = new Date("2026-10-24T09:00:00.000Z");

const extract = (name: string, url: string) => extractFromHtml({ url, html: page(`${name}.html`) });

describe("extractFromHtml on recorded pages", () => {
  it("LinkedIn public job view: JSON-LD, description from the page", () => {
    const result = extract("linkedin-adobe", "https://www.linkedin.com/jobs/view/4470036822");
    expect(result.method).toBe("json_ld");
    expect(result.site?.id).toBe("linkedin");
    expect(result.posting).toMatchObject({
      title: "2027 University Graduate - Software Engineer",
      company: "Adobe",
      employmentType: "full_time",
      seniority: "junior",
    });
    expect(result.posting.locations[0]).toMatchObject({ city: "San Jose", countryCode: "US" });
    expect(result.posting.datePosted?.toISOString()).toBe("2026-10-16T09:02:45.000Z");
    expect(result.posting.description).toMatch(/^The Opportunity\n\nAdobe is seeking/);
    expect(result.posting.description).not.toMatch(/&lt;|<strong>/);
    expect(result.api).toBeNull();
  });

  it("Greenhouse job board: no JSON-LD on the page, the public board API fills everything", () => {
    const url = "https://job-boards.greenhouse.io/anthropic/jobs/5456619008";
    const result = extract("greenhouse-anthropic", url);
    expect(result.api?.url).toBe(
      "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/5456619008?content=true",
    );
    const full = withApiResult(result, json("greenhouse-anthropic-api.json"), url);
    expect(full.method).toBe("site");
    expect(full.posting).toMatchObject({ title: "3P Revenue Accounting & Reporting", company: "Anthropic" });
    expect(full.posting.locations.map((location) => location.label)).toEqual([
      "San Francisco, CA",
      "Seattle, WA",
    ]);
    expect(full.posting.description).toMatch(/^About Anthropic/);
    expect(full.fieldMethods.title).toBe("site");
  });

  it("Lever: JSON-LD with the company; locality repeated as region is folded", () => {
    const result = extract(
      "lever-palantir",
      "https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd",
    );
    expect(result.method).toBe("json_ld");
    expect(result.posting).toMatchObject({
      title: "Administrative Business Partner",
      company: "Palantir Technologies",
      employmentType: "full_time",
    });
    expect(result.posting.locations[0]?.label).toBe("Singapore, Singapore");
  });

  it("Ashby: JSON-LD salary, remote flag and employer site", () => {
    const result = extract(
      "ashby-ramp",
      "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245",
    );
    expect(result.posting).toMatchObject({
      title: "Security Engineer, Cloud",
      company: "Ramp",
      remoteType: "remote",
      companyUrl: "https://ramp.com",
      salary: { min: 211400, max: 290600, currency: "USD", period: "year", estimated: false },
    });
  });

  it("Workday: JSON-LD; numeric company code and composite locality are cleaned", () => {
    const result = extract(
      "workday-nvidia",
      "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Engineering-Manager--Graphics-System-Software_JR2028533",
    );
    expect(result.posting).toMatchObject({
      title: "Engineering Manager, Graphics System Software",
      company: "NVIDIA USA",
      seniority: "manager",
    });
    expect(result.posting.locations[0]?.countryCode).toBe("US");
    expect(result.posting.locations[0]?.city).not.toBe("US");
  });

  it("Workday API answer reads as a posting (used when the page has no JSON-LD)", () => {
    const url = new URL(
      "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Engineering-Manager--Graphics-System-Software_JR2028533",
    );
    const site = siteFor(url);
    expect(site?.apiRequest?.(url)?.url).toBe(
      "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Engineering-Manager--Graphics-System-Software_JR2028533",
    );
    const posting = site?.parseApi?.(json("workday-nvidia-api.json"), url);
    expect(posting?.title).toBe("Engineering Manager, Graphics System Software");
    expect(posting?.description.length).toBeGreaterThan(1_000);
  });

  it("Kariyer.net: no JobPosting JSON-LD, the site adapter reads the Turkish page", () => {
    const result = extract(
      "kariyer-logo",
      "https://www.kariyer.net/is-ilani/logo-yazilim-san-ve-tic-a-s-yazilim-gelistirme-uzmani-4573334",
    );
    expect(result.method).toBe("site");
    expect(result.posting).toMatchObject({
      title: "Yazılım Geliştirme Uzmanı",
      company: "Logo Yazılım San Ve Tic A.Ş.",
      employmentType: "full_time",
      remoteType: "hybrid",
      language: "tr",
    });
    expect(result.posting.locations[0]).toMatchObject({ label: "İzmir (Urla)", countryCode: "TR" });
    expect(result.posting.description).toMatch(/^Çeviklik, yaratıcılık/);
    expect(result.posting.description).toContain("\n• ");
  });

  it("XING: JSON-LD with escaped markup", () => {
    const result = extract(
      "xing-cae",
      "https://www.xing.com/jobs/bayreuth-senior-specialist-cae-engineering-156020738",
    );
    expect(result.method).toBe("json_ld");
    expect(result.posting).toMatchObject({
      title: "Senior Specialist, CAE Engineering (m/f/d)",
      company: "CYBEX GMBH",
      seniority: "senior",
    });
    expect(result.posting.description).not.toMatch(/<DIV>|\\u003C/i);
  });

  it("Personio careers page without a company name stays incomplete (AI fallback territory)", () => {
    const result = extract("personio-ultralytics", "https://ultralytics.jobs.personio.com/job/1874062");
    expect(result.method).toBeNull();
    expect(result.posting.title).toBe("Senior Software Engineer");
    expect(result.posting.company).toBeNull();
    expect(result.readableText).toContain("Ultralytics");
    expect(result.site?.isDirectFromEmployer).toBe(true);
  });
});

describe("microdata", () => {
  // Synthetic: SuccessFactors-style microdata (the recorded career sites now ship JSON-LD).
  const html = `<html lang="de"><body><div itemscope itemtype="http://schema.org/JobPosting">
    <h1 itemprop="title">Backend Entwickler (m/w/d)</h1>
    <span itemprop="hiringOrganization" itemscope itemtype="http://schema.org/Organization"><meta itemprop="name" content="Muster GmbH"></span>
    <span itemprop="jobLocation" itemscope itemtype="http://schema.org/Place"><span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
      <span itemprop="addressLocality">Hamburg</span><meta itemprop="addressCountry" content="DE"></span></span>
    <meta itemprop="employmentType" content="FULL_TIME"><time itemprop="datePosted" datetime="2026-10-01">1. Oktober</time>
    <div itemprop="description"><p>Wir suchen dich.</p><ul><li>TypeScript</li><li>Go</li></ul></div>
  </div></body></html>`;

  it("reads nested items, meta/time values and the description", () => {
    const result = extractFromHtml({ url: "https://karriere.muster.de/job/123", html });
    expect(result.method).toBe("microdata");
    expect(result.posting).toMatchObject({
      title: "Backend Entwickler (m/w/d)",
      company: "Muster GmbH",
      employmentType: "full_time",
    });
    expect(result.posting.locations[0]).toMatchObject({ city: "Hamburg", countryCode: "DE" });
    expect(result.posting.datePosted?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(result.posting.description).toBe("Wir suchen dich.\n\n• TypeScript\n• Go");
    expect(result.site).toBeNull();
  });
});

describe("detectBlock on recorded walls", () => {
  const cases: [string, number, string][] = [
    ["stepstone-blocked.html", 403, "forbidden"],
    ["indeed-blocked.html", 401, "bot_challenge"],
    ["glassdoor-blocked.html", 403, "bot_challenge"],
    ["sap-cloudflare.html", 403, "bot_challenge"],
    ["personio-vercel.html", 429, "bot_challenge"],
  ];
  it.each(cases)("%s → %s", (name, status, expected) => {
    expect(
      detectBlock({ status, url: "https://example.com/job/1", html: page(name), visibleTextLength: 50 }),
    ).toBe(expected);
  });

  it("login redirects are walls; real postings with an apply-form reCAPTCHA are not", () => {
    expect(
      detectBlock({
        status: 200,
        url: "https://www.linkedin.com/authwall?trk=x",
        html: "<html></html>",
        visibleTextLength: 0,
      }),
    ).toBe("login_wall");
    const html = `<html><script src="https://www.google.com/recaptcha/api.js"></script><body>${"Role description. ".repeat(100)}</body></html>`;
    expect(
      detectBlock({
        status: 200,
        url: "https://boards.greenhouse.io/x/jobs/1",
        html,
        visibleTextLength: 1_800,
      }),
    ).toBeNull();
    expect(detectBlock({ status: 200, url: "https://example.com/", html, visibleTextLength: 100 })).toBe(
      "bot_challenge",
    );
  });
});

describe("importUrlFrom", () => {
  it.each([
    [
      "Look at this https://www.linkedin.com/jobs/view/senior-dev-at-acme-4470036822/?trk=public&refId=abc",
      "https://www.linkedin.com/jobs/view/4470036822",
    ],
    [
      "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4470036822&origin=x",
      "https://www.linkedin.com/jobs/view/4470036822",
    ],
    [
      "http://de.indeed.com/viewjob?jk=4b5d7c1e2f3a4b5c&from=serp&vjs=3",
      "https://de.indeed.com/viewjob?jk=4b5d7c1e2f3a4b5c",
    ],
    [
      "jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd/apply",
      "https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd",
    ],
    [
      "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/X_JR1",
      "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/X_JR1",
    ],
    ["https://careers.acme.com/jobs/42?utm_source=x&gclid=1#apply", "https://careers.acme.com/jobs/42"],
  ])("%s", (input, expected) => {
    expect(importUrlFrom(input)?.href).toBe(expected);
  });

  it.each(["not a link", "ftp://example.com/job", "javascript:alert(1)", "https://user:pw@example.com/job"])(
    "refuses %s",
    (input) => {
      expect(importUrlFrom(input)).toBeNull();
    },
  );
});

describe("robotsVerdict", () => {
  const robots =
    "User-agent: *\nDisallow: /jobs/search\nAllow: /jobs/search/public$\n\nUser-agent: BruteForceHR\nDisallow: /private/\n";
  it("uses our own group when one exists, else *", () => {
    expect(robotsVerdict(robots, "BruteForceHR", "/private/x")).toBe("disallowed");
    expect(robotsVerdict(robots, "BruteForceHR", "/jobs/search")).toBe("allowed");
    expect(robotsVerdict(robots, "OtherBot", "/jobs/search?q=x")).toBe("disallowed");
    expect(robotsVerdict(robots, "OtherBot", "/jobs/search/public")).toBe("allowed");
    expect(robotsVerdict("", "BruteForceHR", "/x")).toBe("allowed");
  });
});

describe("html", () => {
  it("decodes entities, closes implied elements and keeps list structure", () => {
    const doc = parseHtml(
      "<div><p>Gr&uuml;&szlig;e &amp; &#x27;hi&#39;<p>Second<ul><li>One<li>Two</ul></div><script>x<y</script>",
    );
    expect(blockText(doc)).toBe("Grüße & 'hi'\n\nSecond\n\n• One\n• Two");
  });
});

describe("buildImportedJob + wire contract", () => {
  const result = extract("ashby-ramp", "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245");
  const draft = buildImportedJob(result.posting, {
    url: "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245",
    site: result.site,
    declaredLanguage: result.declaredLanguage,
    at: AT,
  });

  it("is a valid jobs document with one url_import source", () => {
    expect(JobSchema.parse({ ...draft, id: "j1" })).toBeTruthy();
    expect(draft.sources).toHaveLength(1);
    expect(draft.sources[0]).toMatchObject({
      source: "url_import",
      sourceId: null,
      isDirectFromEmployer: true,
    });
    expect(draft.sourceKeys).toEqual([
      "url_import:https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245",
    ]);
    expect(draft).toMatchObject({ companyDomain: "ramp.com", language: "en", remoteType: "remote" });
    expect(draft.fingerprint).toMatch(/\|ramp\|/);
    expect(draft.skills.length).toBeGreaterThan(0);
  });

  it("round-trips through the wire form and the response schema", () => {
    const wire = jobToWire(draft);
    expect(typeof wire.createdAt).toBe("string");
    expect(jobFromWire(wire)).toEqual(draft);
    const response = JobImportUrlResponseSchema.parse({
      job: wire,
      existingJobId: null,
      method: "json_ld",
      site: "ashby",
      confidence: { title: 0.95 },
      warnings: [],
      model: "none",
      promptVersion: null,
      finalUrl: draft.sources[0]?.url,
      robots: "allowed",
    });
    expect(response.job.title).toBe("Security Engineer, Cloud");
  });

  it("job boards are not direct from the employer and never give the company domain", () => {
    const linkedin = extract("linkedin-adobe", "https://www.linkedin.com/jobs/view/4470036822");
    const job = buildImportedJob(linkedin.posting, {
      url: "https://www.linkedin.com/jobs/view/4470036822",
      site: linkedin.site,
      declaredLanguage: "en",
      at: AT,
    });
    expect(job.sources[0]?.isDirectFromEmployer).toBe(false);
    expect(job.companyDomain).toBeNull();
  });
});
