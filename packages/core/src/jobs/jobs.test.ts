import { describe, expect, it } from "vitest";
import { type Job, JobSchema, type JobSourceLink, jobSourceKey } from "../job";
import { JobSourceStatusSchema, sourceErrorMessage, JobSourceReasonSchema } from "./sources";
import {
  isSameJob,
  jobExpiry,
  jobFingerprint,
  JOB_STALE_AFTER_DAYS,
  mergeJobListing,
  preferredApplyRoute,
} from "./dedupe";
import { passesSearchFilters } from "./filters";
import {
  detectPostingLanguage,
  detectRemoteType,
  detectSeniority,
  detectVisaSponsorship,
  extractSkills,
  foldText,
  hostOf,
  htmlToText,
  httpUrlParts,
  normalizeCompanyName,
  normalizeSkill,
  normalizeTitle,
  parseLocation,
} from "./normalize";
import { detectAtsBoard, WATCHLIST_PENDING_FIELDS, WatchedCompanySchema } from "./watchlist";

const T0 = new Date("2026-10-20T08:00:00.000Z");
const T1 = new Date("2026-10-24T08:00:00.000Z");

const DESCRIPTION =
  "We are looking for a Senior Backend Engineer to build our payments platform with TypeScript, Node.js and PostgreSQL. " +
  "You will design APIs, own services end to end, mentor engineers and work closely with product. " +
  "Experience with Kubernetes and AWS is a plus. We offer visa sponsorship and relocation support to Berlin.";

function link(overrides: Partial<JobSourceLink>): JobSourceLink {
  return {
    source: "arbeitnow",
    sourceId: "a-1",
    url: "https://www.arbeitnow.com/jobs/acme/senior-backend-engineer-1",
    applyUrl: null,
    applyEmail: null,
    isDirectFromEmployer: false,
    title: "Senior Backend Engineer (m/w/d)",
    locationText: "Berlin, Germany",
    salary: null,
    postedAt: T0,
    firstSeenAt: T0,
    lastSeenAt: T0,
    ...overrides,
  };
}

function job(overrides: Partial<Job> & { sources?: JobSourceLink[] } = {}): Job {
  const sources = overrides.sources ?? [link({})];
  const base: Job = {
    id: "job1",
    sources,
    sourceKeys: sources.map(jobSourceKey),
    applyUrl: sources[0]?.url ?? null,
    applyEmail: null,
    company: "Acme GmbH",
    companyDomain: null,
    title: "Senior Backend Engineer (m/w/d)",
    locations: [parseLocation("Berlin, Germany")],
    remoteType: "hybrid",
    remoteEligibility: null,
    employmentType: "full_time",
    seniority: "senior",
    salary: null,
    visaSponsorship: true,
    relocationSupport: true,
    language: "en",
    description: DESCRIPTION,
    skills: ["TypeScript", "Node.js", "PostgreSQL", "Kubernetes", "AWS"],
    postedAt: T0,
    expiresAt: null,
    fingerprint: "",
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
  return { ...base, fingerprint: overrides.fingerprint ?? jobFingerprint(base) };
}

describe("normalization", () => {
  it("folds Turkish and German text", () => {
    expect(foldText("  İSTANBUL  Straße Çalışan ")).toBe("istanbul strasse calisan");
  });

  it("turns posting HTML into paragraphs and bullets", () => {
    expect(
      htmlToText(
        "<p>Hello&nbsp;<b>world</b></p><ul><li>One</li><li>Two &amp; three</li></ul><script>x()</script>",
      ),
    ).toBe("Hello world\n\n• One\n• Two & three");
    expect(htmlToText("&lt;p&gt;Encoded &amp;amp; twice&lt;/p&gt;")).toBe("Encoded & twice");
  });

  it("normalizes company names and titles for comparison", () => {
    expect(normalizeCompanyName("Acme GmbH")).toBe("acme");
    expect(normalizeCompanyName("Trendyol A.Ş.")).toBe("trendyol");
    expect(normalizeCompanyName("Foo Bar Ltd. Şti.")).toBe("foo bar");
    expect(normalizeTitle("Sr. Backend Engineer (m/w/d)")).toBe("senior backend engineer");
    expect(normalizeTitle("Senior Backend Engineer (f/m/x) [Remote]")).toBe("senior backend engineer");
    expect(normalizeTitle("Full Stack Dev")).toBe("fullstack developer");
  });

  it("parses locations into city and ISO country", () => {
    expect(parseLocation("Berlin, Germany")).toEqual({
      label: "Berlin, Germany",
      city: "Berlin",
      countryCode: "DE",
    });
    expect(parseLocation("İstanbul, Türkiye")).toEqual({
      label: "İstanbul, Türkiye",
      city: "Istanbul",
      countryCode: "TR",
    });
    expect(parseLocation("München")).toMatchObject({ city: "Munich", countryCode: "DE" });
    expect(parseLocation("Austin, TX")).toMatchObject({ city: "Austin", countryCode: "US" });
    expect(parseLocation("Bielefeld, Germany")).toMatchObject({ city: "Bielefeld", countryCode: "DE" });
    expect(parseLocation("Remote")).toMatchObject({ city: null, countryCode: null });
  });

  it("detects remote type, seniority, visa and language", () => {
    expect(detectRemoteType("Remote - EU")).toBe("remote");
    expect(detectRemoteType("Berlin (Hybrid)")).toBe("hybrid");
    expect(detectRemoteType("Berlin", false)).toBe("onsite");
    expect(detectRemoteType("Berlin")).toBeNull();
    expect(detectSeniority("Sr. Data Engineer")).toBe("senior");
    expect(detectSeniority("Werkstudent Marketing")).toBe("intern");
    expect(detectSeniority("Head of Engineering")).toBe("director");
    expect(detectSeniority("Backend Engineer")).toBeNull();
    expect(detectVisaSponsorship("We offer visa sponsorship.")).toBe(true);
    expect(detectVisaSponsorship("We are unable to sponsor visas.")).toBe(false);
    expect(detectVisaSponsorship("Great team.")).toBeNull();
    expect(detectPostingLanguage(DESCRIPTION)).toBe("en");
    expect(
      detectPostingLanguage(
        "Wir suchen dich als Entwickler und du hast Erfahrung mit TypeScript und der Cloud bei uns.",
      ),
    ).toBe("de");
    expect(
      detectPostingLanguage(
        "Ekibimize katılacak, en az 3 yıl deneyim sahibi ve tercihen İngilizce bilen bir mühendis arıyoruz ve bu konuda deneyim olan",
      ),
    ).toBe("tr");
    expect(detectPostingLanguage("Hi")).toBe("und");
  });

  it("extracts canonical skills without matching common words", () => {
    expect(extractSkills(DESCRIPTION)).toEqual(["TypeScript", "Node.js", "PostgreSQL", "Kubernetes", "AWS"]);
    expect(extractSkills("We go to market fast and rest on Fridays")).toEqual([]);
    expect(extractSkills("Backend in Go, infra on GCP; React + Next.js frontend; CI/CD")).toEqual([
      "Go",
      "GCP",
      "React",
      "Next.js",
      "CI/CD",
    ]);
    expect(normalizeSkill("reactjs")).toBe("React");
    expect(normalizeSkill("Haskell")).toBe("Haskell");
  });

  it("parses URLs without the URL global", () => {
    expect(httpUrlParts("https://boards.greenhouse.io/embed/job_board?for=acme&x=1")).toEqual({
      host: "boards.greenhouse.io",
      pathname: "/embed/job_board",
      query: { for: "acme", x: "1" },
    });
    expect(hostOf("https://www.acme.com/careers")).toBe("acme.com");
    expect(hostOf("mailto:x@y.z")).toBeNull();
  });
});

describe("watchlist", () => {
  it.each([
    ["https://boards.greenhouse.io/acme", { ats: "greenhouse", boardToken: "acme", region: "us" }],
    [
      "https://job-boards.eu.greenhouse.io/acme/jobs/123",
      { ats: "greenhouse", boardToken: "acme", region: "eu" },
    ],
    [
      "https://boards.greenhouse.io/embed/job_board?for=acme",
      { ats: "greenhouse", boardToken: "acme", region: "us" },
    ],
    [
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
      { ats: "greenhouse", boardToken: "acme", region: "us" },
    ],
    ["https://jobs.lever.co/acme/abc-123", { ats: "lever", boardToken: "acme", region: "us" }],
    ["https://jobs.eu.lever.co/acme", { ats: "lever", boardToken: "acme", region: "eu" }],
    ["https://jobs.ashbyhq.com/Acme", { ats: "ashby", boardToken: "Acme", region: "us" }],
    [
      "https://careers.smartrecruiters.com/AcmeInc1",
      { ats: "smartrecruiters", boardToken: "AcmeInc1", region: "us" },
    ],
    ["https://apply.workable.com/acme/", { ats: "workable", boardToken: "acme", region: "us" }],
    ["https://acme.workable.com", { ats: "workable", boardToken: "acme", region: "us" }],
    ["https://acme.recruitee.com/o/backend", { ats: "recruitee", boardToken: "acme", region: "us" }],
    ["https://acme.jobs.personio.de/job/1", { ats: "personio", boardToken: "acme", region: "us" }],
  ])("detects %s", (url, expected) => {
    expect(detectAtsBoard(url)).toEqual(expected);
  });

  it("returns null for careers pages and junk", () => {
    expect(detectAtsBoard("https://acme.com/careers")).toBeNull();
    expect(detectAtsBoard("not a url")).toBeNull();
    expect(detectAtsBoard("https://jobs.lever.co/")).toBeNull();
  });

  it("validates a client-created entry with pending server fields", () => {
    expect(
      WatchedCompanySchema.parse({
        id: "w1",
        name: "Acme",
        careersUrl: "https://jobs.lever.co/acme",
        enabled: true,
        ...WATCHLIST_PENDING_FIELDS,
        createdAt: T0,
        updatedAt: T0,
      }).status,
    ).toBe("pending");
  });
});

describe("source status", () => {
  it("only stores fixed source-level messages", () => {
    for (const reason of JobSourceReasonSchema.options) {
      const message = sourceErrorMessage(reason);
      expect(message).not.toMatch(/https?:|@|\{|uid/i);
      expect(
        JobSourceStatusSchema.safeParse({
          id: "adzuna",
          label: "Adzuna",
          kind: "keyed",
          markets: ["GB", "DE", "remote"],
          state: "skipped",
          reason,
          lastRunAt: T0,
          lastSuccessAt: null,
          lastError: message,
          lastResultCount: null,
          quota: null,
          attribution: {
            label: "Adzuna",
            url: "https://www.adzuna.co.uk",
            minSize: { width: 116, height: 23 },
          },
          updatedAt: T0,
        }).success,
      ).toBe(true);
    }
  });
});

describe("dedupe", () => {
  it("fingerprints the same posting identically across sources", () => {
    const board = job();
    const direct = job({
      company: "ACME",
      title: "Sr. Backend Engineer (f/m/x)",
      locations: [parseLocation("Berlin")],
      sources: [link({ source: "greenhouse", sourceId: "42", isDirectFromEmployer: true })],
    });
    expect(board.fingerprint).toBe("v1|acme|senior backend engineer|berlin");
    expect(direct.fingerprint).toBe(board.fingerprint);
    expect(job({ title: "Junior Backend Engineer" }).fingerprint).not.toBe(board.fingerprint);
    expect(job({ locations: [parseLocation("Hamburg, Germany")] }).fingerprint).not.toBe(board.fingerprint);
  });

  it("treats same-company postings with overlapping descriptions as one job", () => {
    const a = job();
    const b = job({ locations: [parseLocation("Germany")], description: `${DESCRIPTION} Apply now!` });
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(isSameJob(a, b)).toBe(true);
    expect(isSameJob(a, job({ company: "Other Co", locations: [parseLocation("Germany")] }))).toBe(false);
  });

  it("merges a direct employer listing into a board job", () => {
    const existing = job({ salary: null, companyDomain: null });
    const incoming = job({
      title: "Senior Backend Engineer",
      companyDomain: "acme.com",
      salary: { min: 70_000, max: 85_000, currency: "EUR", period: "year", estimated: false },
      skills: ["TypeScript", "Go"],
      sources: [
        link({
          source: "greenhouse",
          sourceId: "42",
          url: "https://boards.greenhouse.io/acme/jobs/42",
          applyUrl: "https://boards.greenhouse.io/acme/jobs/42#app",
          isDirectFromEmployer: true,
          title: "Senior Backend Engineer",
          firstSeenAt: T1,
          lastSeenAt: T1,
        }),
      ],
      expiresAt: new Date(T1.getTime() + JOB_STALE_AFTER_DAYS * 86_400_000),
    });
    const merged = mergeJobListing(existing, incoming, T1);
    expect(JobSchema.parse(merged)).toEqual(merged);
    expect(merged.id).toBe("job1");
    expect(merged.fingerprint).toBe(existing.fingerprint);
    expect(merged.sources.map((source) => source.source)).toEqual(["greenhouse", "arbeitnow"]);
    expect(merged.sourceKeys).toEqual(["greenhouse:42", "arbeitnow:a-1"]);
    expect(merged.applyUrl).toBe("https://boards.greenhouse.io/acme/jobs/42#app");
    expect(merged.title).toBe("Senior Backend Engineer");
    expect(merged.companyDomain).toBe("acme.com");
    expect(merged.salary?.min).toBe(70_000);
    expect(merged.skills).toEqual(["TypeScript", "Go", "Node.js", "PostgreSQL", "Kubernetes", "AWS"]);
    expect(merged.createdAt).toBe(T0);
    expect(merged.updatedAt).toBe(T1);
  });

  it("re-sighting a known source keeps firstSeenAt and bumps lastSeenAt", () => {
    const existing = job();
    const merged = mergeJobListing(
      existing,
      job({ sources: [link({ firstSeenAt: T1, lastSeenAt: T1 })] }),
      T1,
    );
    expect(merged.sources).toHaveLength(1);
    expect(merged.sources[0]?.firstSeenAt).toBe(T0);
    expect(merged.sources[0]?.lastSeenAt).toBe(T1);
    expect(merged.expiresAt?.getTime()).toBe(T1.getTime() + JOB_STALE_AFTER_DAYS * 86_400_000);
  });

  it("prefers the direct employer apply route, then any apply URL, then email", () => {
    expect(preferredApplyRoute([link({ applyUrl: "https://board.example/apply" })]).applyUrl).toBe(
      "https://board.example/apply",
    );
    expect(
      preferredApplyRoute([
        link({ applyUrl: "https://board.example/apply" }),
        link({
          source: "lever",
          sourceId: "x",
          url: "https://jobs.lever.co/acme/x",
          isDirectFromEmployer: true,
        }),
      ]).applyUrl,
    ).toBe("https://jobs.lever.co/acme/x");
    expect(preferredApplyRoute([link({ applyEmail: "jobs@acme.com" })])).toEqual({
      applyUrl: null,
      applyEmail: "jobs@acme.com",
    });
  });

  it("expires at the earlier of a published deadline and the stale date", () => {
    const sources = [link({ lastSeenAt: T1 })];
    const deadline = new Date("2026-10-30T00:00:00.000Z");
    expect(jobExpiry(sources, deadline)).toBe(deadline);
    expect(jobExpiry(sources, null).getTime()).toBe(T1.getTime() + JOB_STALE_AFTER_DAYS * 86_400_000);
  });
});

describe("search filters", () => {
  const filters = {
    countryCodes: [],
    remoteTypes: [],
    seniority: [],
    salaryMin: null,
    sources: [],
    postedWithinDays: null,
    visaSponsorship: null,
  } as const;
  const base = job();

  it("passes everything with empty filters", () => {
    expect(
      passesSearchFilters(
        base,
        { ...filters, countryCodes: [], remoteTypes: [], seniority: [], sources: [] },
        T1,
      ),
    ).toBe(true);
  });

  it("applies country, remote, seniority, visa, recency, salary and source filters", () => {
    const f = {
      ...filters,
      countryCodes: [] as string[],
      remoteTypes: [] as ("remote" | "hybrid" | "onsite")[],
      seniority: [] as ("senior" | "junior")[],
      sources: [] as string[],
    };
    expect(passesSearchFilters(base, { ...f, countryCodes: ["TR"] }, T1)).toBe(false);
    expect(passesSearchFilters(base, { ...f, countryCodes: ["DE"] }, T1)).toBe(true);
    expect(passesSearchFilters(base, { ...f, remoteTypes: ["remote"] }, T1)).toBe(false);
    expect(passesSearchFilters(base, { ...f, seniority: ["junior"] }, T1)).toBe(false);
    expect(passesSearchFilters(job({ visaSponsorship: false }), { ...f, visaSponsorship: true }, T1)).toBe(
      false,
    );
    expect(passesSearchFilters(base, { ...f, postedWithinDays: 2 }, T1)).toBe(false);
    expect(passesSearchFilters(base, { ...f, postedWithinDays: 7 }, T1)).toBe(true);
    expect(passesSearchFilters(base, { ...f, sources: ["remotive"] }, T1)).toBe(false);
    const paid = job({
      salary: { min: 4_000, max: 5_000, currency: "EUR", period: "month", estimated: false },
    });
    expect(
      passesSearchFilters(paid, { ...f, salaryMin: { amount: 70_000, currency: "EUR", period: "year" } }, T1),
    ).toBe(false);
    expect(
      passesSearchFilters(paid, { ...f, salaryMin: { amount: 55_000, currency: "EUR", period: "year" } }, T1),
    ).toBe(true);
    // Unknown values pass.
    expect(
      passesSearchFilters(
        job({ salary: null }),
        { ...f, salaryMin: { amount: 1e6, currency: "EUR", period: "year" } },
        T1,
      ),
    ).toBe(true);
  });
});
