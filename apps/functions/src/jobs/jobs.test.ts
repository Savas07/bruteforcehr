import { serverOnlyPaths } from "@bfhr/api";
import {
  type Job,
  type JobMatch,
  type JobSourceLink,
  jobFingerprint,
  jobSourceKey,
  parseLocation,
  type SavedSearchFilters,
  sourceErrorMessage,
} from "@bfhr/core";
import {
  CONNECTOR_SECRET_NAMES,
  HttpClient,
  SEARCH_CONNECTORS,
  type BoardConnector,
  type Listing,
  type SearchConnector,
  SourceError,
} from "@bfhr/jobs-connectors";
import { describe, expect, it } from "vitest";
import { deleteUserData } from "../account/user-data";
import { JOB_SOURCE_SECRETS, jobSourceSecrets, secretOrNull, UNSET_SECRET } from "../secrets";
import { collectListings, selectConnectors } from "./collect";
import { normalize, dot, jobEmbeddingText, profileEmbeddingText } from "./embeddings";
import { buildMatch, rationaleTargets } from "./matcher";
import { cvContext } from "./profile-context";
import { admitRun, EMPTY_QUOTA_DAY, JOB_BUDGETS, takeUnits } from "./quota";
import { alertCandidates, nextRunAt } from "./run";
import { pickDue } from "./scheduler";
import { admitSourceCall, nextSourceStatus } from "./source-state";
import { planUpserts } from "./store";
import { resolvedFields } from "./triggers";

const NOW = new Date("2026-10-24T08:00:00.000Z");
const FILTERS: SavedSearchFilters = {
  countryCodes: [],
  remoteTypes: [],
  seniority: [],
  salaryMin: null,
  sources: [],
  postedWithinDays: null,
  visaSponsorship: null,
};
const DESCRIPTION =
  "Build payment services with TypeScript and Node.js on AWS. You will own APIs end to end, work with product and mentor engineers. " +
  "We value clear writing, pragmatic testing and calm on-call rotations. Hybrid in Berlin, two office days a week.";

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    source: "fake",
    sourceId: "1",
    url: "https://jobs.example.com/1",
    isDirectFromEmployer: false,
    title: "Senior Backend Engineer",
    company: "Acme GmbH",
    locations: ["Berlin, Germany"],
    description: DESCRIPTION,
    postedAt: NOW,
    ...overrides,
  };
}

function connector(
  overrides: Partial<SearchConnector> & { listings?: Listing[]; error?: unknown },
): SearchConnector {
  const { listings = [], error, ...rest } = overrides;
  return {
    id: "fake",
    label: "Fake",
    kind: "keyless",
    markets: ["DE", "remote"],
    attribution: { label: "Fake", url: "https://fake.example", minSize: null },
    secrets: [],
    adHoc: true,
    callBudget: () => null,
    covers: () => true,
    search: async () => {
      if (error !== undefined) throw error;
      return listings;
    },
    ...rest,
  };
}

function context(secrets: Record<string, string | null> = {}) {
  return {
    http: new HttpClient({
      userAgent: "BruteForceHR/test",
      fetch: (async () => new Response("")) as typeof fetch,
    }),
    cache: { get: async () => null, put: async () => undefined },
    secrets,
    now: NOW,
  };
}

const openGate = { admitSource: async () => true, grantCalls: async (wanted: number) => wanted };

const ARBEITNOW: JobSourceLink = {
  source: "arbeitnow",
  sourceId: "a1",
  url: "https://www.arbeitnow.com/jobs/a1",
  applyUrl: null,
  applyEmail: null,
  isDirectFromEmployer: false,
  title: "Senior Backend Engineer",
  locationText: "Berlin",
  salary: null,
  postedAt: NOW,
  firstSeenAt: NOW,
  lastSeenAt: NOW,
};

function draft(overrides: Partial<Job> = {}): Omit<Job, "id"> {
  const source = ARBEITNOW;
  const base: Omit<Job, "id"> = {
    sources: [source],
    sourceKeys: [jobSourceKey(source)],
    applyUrl: null,
    applyEmail: null,
    company: "Acme",
    companyDomain: null,
    title: "Senior Backend Engineer",
    locations: [parseLocation("Berlin, Germany")],
    remoteType: "hybrid",
    remoteEligibility: null,
    employmentType: null,
    seniority: "senior",
    salary: null,
    visaSponsorship: null,
    relocationSupport: null,
    language: "en",
    description: DESCRIPTION,
    skills: ["TypeScript"],
    postedAt: NOW,
    expiresAt: null,
    fingerprint: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  return { ...base, fingerprint: jobFingerprint(base) };
}

describe("collectListings", () => {
  it("skips keyed sources without keys, ad-hoc-excluded and uncovered sources", () => {
    const { run, skipped } = selectConnectors({
      query: { query: "backend", filters: FILTERS, limit: 10 },
      mode: "adhoc",
      context: context({ KEY: null }),
      connectors: [
        connector({ id: "keyed", secrets: ["KEY"] }),
        connector({ id: "saved_only", adHoc: false }),
        connector({ id: "elsewhere", covers: () => false }),
        connector({ id: "open" }),
      ],
    });
    expect(run.map((item) => item.id)).toEqual(["open"]);
    expect(skipped).toEqual([{ source: "keyed", status: "skipped", reason: "no_key", count: 0 }]);
  });

  it("normalizes, filters and reports per source; a failing source never fails the run", async () => {
    const result = await collectListings({
      query: { query: "backend", filters: { ...FILTERS, countryCodes: ["DE"] }, limit: 10 },
      mode: "adhoc",
      connectors: [
        connector({
          id: "good",
          listings: [listing(), listing({ sourceId: "2", locations: ["London, UK"] })],
        }),
        connector({
          id: "broken",
          error: new SourceError("unavailable", "https://x.example/?q=my+secret+query user@mail.com"),
        }),
        connector({ id: "crashing", error: new TypeError("boom") }),
      ],
      boards: [],
      watched: [],
      context: context(),
      gate: openGate,
    });
    expect(result.found).toBe(2);
    expect(result.drafts.map((item) => item.locations[0]?.city)).toEqual(["Berlin"]);
    expect(result.reports).toEqual([
      { source: "good", status: "ok", reason: null, count: 2 },
      { source: "broken", status: "error", reason: "unavailable", count: 0 },
      { source: "crashing", status: "error", reason: "unavailable", count: 0 },
    ]);
    // Reports carry enums and counts only; error messages (which could hold request data) are dropped.
    expect(JSON.stringify(result.reports)).not.toMatch(/secret|@|https?:/);
  });

  it("enforces the shared source budget and the per-user call budget", async () => {
    const result = await collectListings({
      query: { query: "backend", filters: FILTERS, limit: 10 },
      mode: "saved",
      connectors: [
        connector({ id: "a", listings: [listing()] }),
        connector({ id: "b", listings: [listing()] }),
        connector({ id: "c" }),
      ],
      boards: [],
      watched: [],
      context: context(),
      gate: { admitSource: async (item) => item.id !== "a", grantCalls: async () => 2 },
    });
    expect(result.reports).toEqual([
      { source: "a", status: "error", reason: "quota_exhausted", count: 0 },
      { source: "b", status: "ok", reason: null, count: 1 },
      { source: "c", status: "error", reason: "rate_limited", count: 0 },
    ]);
  });

  it("reads followed companies' boards for saved searches only, filtered by the query", async () => {
    const board: BoardConnector = {
      id: "greenhouse",
      ats: "greenhouse",
      label: "Greenhouse",
      kind: "keyless",
      markets: ["remote"],
      attribution: { label: "Greenhouse", url: "https://www.greenhouse.com", minSize: null },
      list: async () => [
        listing({ source: "greenhouse", isDirectFromEmployer: true }),
        listing({
          source: "greenhouse",
          sourceId: "2",
          title: "Office Manager",
          description: "Run the office.",
        }),
      ],
    };
    const input = {
      query: { query: "backend", filters: FILTERS, limit: 10 },
      connectors: [],
      boards: [board],
      watched: [{ ats: "greenhouse", boardToken: "acme", region: "us" as const }],
      context: context(),
      gate: openGate,
    };
    const saved = await collectListings({ ...input, mode: "saved" });
    expect(saved.drafts.map((item) => item.title)).toEqual(["Senior Backend Engineer"]);
    expect(saved.drafts[0]?.sources[0]?.isDirectFromEmployer).toBe(true);
    expect((await collectListings({ ...input, mode: "adhoc" })).drafts).toEqual([]);
  });

  it("completes short listings with fetchDetail", async () => {
    const result = await collectListings({
      query: { query: "backend", filters: FILTERS, limit: 10 },
      mode: "adhoc",
      connectors: [
        connector({
          listings: [listing({ description: "Short." })],
          fetchDetail: async (item) => ({ ...item, description: DESCRIPTION }),
        }),
      ],
      boards: [],
      watched: [],
      context: context(),
      gate: openGate,
    });
    expect(result.drafts[0]?.description).toBe(DESCRIPTION);
  });
});

describe("planUpserts", () => {
  let next = 0;
  const newId = () => `new${++next}`;

  it("merges the same posting from two sources into one new job", () => {
    const direct = draft({
      sources: [
        {
          ...ARBEITNOW,
          source: "greenhouse",
          sourceId: "acme:9",
          url: "https://boards.greenhouse.io/acme/jobs/9",
          isDirectFromEmployer: true,
        },
      ],
    });
    direct.sourceKeys = direct.sources.map(jobSourceKey);
    const plan = planUpserts([draft(), direct], [], newId, NOW);
    expect(plan.jobs).toHaveLength(1);
    expect(plan.created).toHaveLength(1);
    expect(plan.jobs[0]?.sources.map((source) => source.source)).toEqual(["greenhouse", "arbeitnow"]);
    expect(plan.jobs[0]?.applyUrl).toBe("https://boards.greenhouse.io/acme/jobs/9");
  });

  it("updates a stored job seen again instead of creating a duplicate", () => {
    const stored: Job = { id: "j1", ...draft(), createdAt: new Date("2026-10-01T00:00:00Z") };
    const plan = planUpserts([draft()], [stored], newId, NOW);
    expect(plan.created).toEqual([]);
    expect(plan.updated).toEqual(["j1"]);
    expect(plan.jobs[0]?.createdAt).toEqual(new Date("2026-10-01T00:00:00Z"));
  });

  it("keeps different postings apart", () => {
    const plan = planUpserts(
      [
        draft(),
        draft({
          title: "Product Designer",
          sources: [{ ...ARBEITNOW, sourceId: "a2" }],
          sourceKeys: ["arbeitnow:a2"],
        }),
      ],
      [],
      newId,
      NOW,
    );
    expect(plan.jobs).toHaveLength(2);
  });
});

describe("matches", () => {
  const computed = {
    score: 82,
    basedOnCvId: "cv1",
    basedOnCvRevisionId: "rev2",
    reasons: [],
    gaps: [],
    skills: { matched: ["TypeScript"], unmatched: [] },
    hardFail: false,
  };
  const existing: JobMatch = {
    id: "j1",
    score: 50,
    basedOnCvId: "cv1",
    basedOnCvRevisionId: "rev1",
    reasons: [],
    gaps: [],
    skills: { matched: [], unmatched: [] },
    rationale: "Old reasoning.",
    state: "dismissed",
    dismissReasons: ["salary"],
    stateChangedAt: NOW,
    computedAt: NOW,
  };

  it("keeps the user's state and drops a rationale from an older CV revision", () => {
    const match = buildMatch({
      jobId: "j1",
      computed,
      existing,
      rationale: null,
      initialState: "new",
      now: NOW,
    });
    expect(match).toMatchObject({
      score: 82,
      state: "dismissed",
      dismissReasons: ["salary"],
      rationale: null,
    });
    const same = buildMatch({
      jobId: "j1",
      computed: { ...computed, basedOnCvRevisionId: "rev1" },
      existing,
      rationale: null,
      initialState: "new",
      now: NOW,
    });
    expect(same.rationale).toBe("Old reasoning.");
    expect(
      buildMatch({ jobId: "j2", computed, existing: null, rationale: null, initialState: "saved", now: NOW })
        .state,
    ).toBe("saved");
  });

  it("picks the best good-band matches without a rationale for AI", () => {
    const base = buildMatch({
      jobId: "x",
      computed,
      existing: null,
      rationale: null,
      initialState: "new",
      now: NOW,
    });
    const targets = rationaleTargets([
      { ...base, id: "low", score: 60 },
      { ...base, id: "a", score: 70 },
      { ...base, id: "b", score: 90 },
      { ...base, id: "done", score: 95, rationale: "x" },
      { ...base, id: "gone", score: 99, state: "dismissed" },
    ]);
    expect(targets.map((match) => match.id)).toEqual(["b", "a"]);
  });

  it("alerts on new matches at or above the threshold only", () => {
    const base = buildMatch({
      jobId: "x",
      computed,
      existing: null,
      rationale: null,
      initialState: "new",
      now: NOW,
    });
    const alerts = alertCandidates(
      [
        { match: { ...base, id: "hit", score: 80 }, isNew: true },
        { match: { ...base, id: "old", score: 90 }, isNew: false },
        { match: { ...base, id: "low", score: 60 }, isNew: true },
      ],
      75,
    );
    expect(alerts.map((outcome) => outcome.match.id)).toEqual(["hit"]);
    expect(nextRunAt("daily", NOW)).toEqual(new Date("2026-10-25T08:00:00.000Z"));
  });
});

describe("quota", () => {
  it("spaces on-demand searches and caps them per day", () => {
    const first = admitRun(EMPTY_QUOTA_DAY, "search", NOW.getTime());
    expect(first?.search).toBe(1);
    expect(first && admitRun(first, "search", NOW.getTime() + 5_000)).toBeNull();
    expect(
      first && admitRun(first, "search", NOW.getTime() + JOB_BUDGETS.searchMinIntervalMs),
    ).not.toBeNull();
    expect(
      admitRun({ ...EMPTY_QUOTA_DAY, search: JOB_BUDGETS.searchesPerDay }, "search", NOW.getTime()),
    ).toBeNull();
    expect(
      admitRun(
        { ...EMPTY_QUOTA_DAY, scheduledRun: JOB_BUDGETS.scheduledRunsPerDay },
        "scheduledRun",
        NOW.getTime(),
      ),
    ).toBeNull();
  });

  it("grants connector calls and rationales up to the daily budget", () => {
    expect(
      takeUnits({ ...EMPTY_QUOTA_DAY, rationales: JOB_BUDGETS.rationalesPerDay - 2 }, "rationales", 5)
        .granted,
    ).toBe(2);
    expect(takeUnits(EMPTY_QUOTA_DAY, "connectorCalls", 10).day.connectorCalls).toBe(10);
  });
});

describe("source state", () => {
  const status = (report: Parameters<typeof nextSourceStatus>[0]["report"], consecutiveFailures = 1) =>
    nextSourceStatus({
      connector: connector({ id: "remotive", label: "Remotive" }),
      previous: null,
      report,
      consecutiveFailures,
      quota: { used: 4, limit: 4 },
      now: NOW,
    });

  it("enforces daily and lifetime call budgets", () => {
    const counters = { day: "2026-10-24", dayCalls: 3, lifetimeCalls: 10, consecutiveFailures: 0 };
    expect(admitSourceCall(counters, { limit: 4, period: "day" }, "2026-10-24")?.dayCalls).toBe(4);
    expect(
      admitSourceCall({ ...counters, dayCalls: 4 }, { limit: 4, period: "day" }, "2026-10-24"),
    ).toBeNull();
    expect(
      admitSourceCall({ ...counters, dayCalls: 4 }, { limit: 4, period: "day" }, "2026-10-25")?.dayCalls,
    ).toBe(1);
    expect(admitSourceCall(counters, { limit: 10, period: "lifetime" }, "2026-10-24")).toBeNull();
  });

  it("stores only fixed, source-level text in the public health document", () => {
    const failed = status({ source: "remotive", status: "error", reason: "blocked", count: 0 });
    expect(failed).toMatchObject({
      state: "degraded",
      reason: "blocked",
      lastError: sourceErrorMessage("blocked"),
    });
    expect(status({ source: "remotive", status: "error", reason: "unavailable", count: 0 }, 3).state).toBe(
      "failing",
    );
    expect(status({ source: "remotive", status: "skipped", reason: "no_key", count: 0 }).state).toBe(
      "skipped",
    );
    // A used-up call budget is expected, not a failure.
    expect(
      status({ source: "remotive", status: "error", reason: "quota_exhausted", count: 0 }, 5).state,
    ).toBe("skipped");
    const ok = status({ source: "remotive", status: "ok", reason: null, count: 12 });
    expect(ok).toMatchObject({
      state: "ok",
      reason: null,
      lastError: null,
      lastResultCount: 12,
      lastSuccessAt: NOW,
    });
    for (const document of [failed, ok]) {
      expect(JSON.stringify(document)).not.toMatch(/uid|@|\?|query/i);
    }
  });
});

describe("embeddings", () => {
  it("normalizes to unit length so dot product is cosine", () => {
    const vector = normalize([3, 4]);
    expect(vector).toEqual([0.6, 0.8]);
    expect(dot(vector, vector)).toBeCloseTo(1);
  });

  it("builds bounded texts for jobs and the profile", () => {
    const text = jobEmbeddingText({ ...draft(), description: "x".repeat(20_000) });
    expect(text.startsWith("Senior Backend Engineer\nAcme\nBerlin, Germany\nTypeScript\n")).toBe(true);
    expect(text.length).toBe(6_000);
    expect(
      profileEmbeddingText(
        { targetRoles: ["Backend Engineer"], seniority: "senior", skills: ["typescript"] },
        null,
      ),
    ).toBe("Target roles: Backend Engineer\nSeniority: senior\nSkills: typescript");
  });

  it("reads CV skills and summary from JSON Resume content", () => {
    const context = cvContext("cv1", {
      id: "rev1",
      content: {
        basics: { label: "Backend engineer", summary: "I build APIs with Go and PostgreSQL." },
        work: [{ name: "Acme", position: "Engineer", highlights: ["Moved services to Kubernetes"] }],
        skills: [{ name: "TypeScript", keywords: ["nodejs"] }],
      },
    } as Parameters<typeof cvContext>[1]);
    expect(context.skills).toEqual(["TypeScript", "Node.js", "Go", "PostgreSQL", "Kubernetes"]);
    expect(context.summary).toContain("Engineer at Acme");
  });
});

describe("watchlist resolution", () => {
  it("records the detected board and open postings", () => {
    expect(
      resolvedFields({
        careersUrl: "https://jobs.lever.co/acme",
        outcome: { listings: [listing(), listing()] },
        now: NOW,
      }),
    ).toMatchObject({
      ats: "lever",
      boardToken: "acme",
      status: "ok",
      openJobs: 2,
      lastError: null,
    });
  });

  it("uses fixed messages for missing and failing boards", () => {
    const missing = resolvedFields({
      careersUrl: "https://acme.com/careers",
      outcome: { listings: [] },
      now: NOW,
    });
    expect(missing).toMatchObject({ ats: "web", status: "not_found", companyDomain: "acme.com" });
    const failing = resolvedFields({
      careersUrl: "https://jobs.lever.co/acme",
      outcome: { error: new SourceError("unavailable", "socket hang up at https://jobs.lever.co/acme?x") },
      now: NOW,
    });
    expect(failing.status).toBe("error");
    expect(failing.lastError).not.toContain("http");
  });
});

describe("scheduler", () => {
  it("picks one due search per user", () => {
    const doc = (uid: string, id: string) => ({
      id,
      ref: { path: `users/${uid}/savedSearches/${id}`, parent: { parent: { id: uid } } },
      exists: true,
      data: () => ({
        name: "Backend",
        query: "backend",
        filters: FILTERS,
        schedule: "daily",
        alertThreshold: 75,
        dailyDigest: true,
        enabled: true,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: NOW,
        updatedAt: NOW,
        schemaVersion: 1,
      }),
    });
    const due = pickDue([doc("u1", "s1"), doc("u1", "s2"), doc("u2", "s3")] as unknown as Parameters<
      typeof pickDue
    >[0]);
    expect(due.map((item) => `${item.uid}/${item.search.id}`)).toEqual(["u1/s1", "u2/s3"]);
  });
});

describe("secrets", () => {
  it("defines every secret the connectors read", () => {
    expect(JOB_SOURCE_SECRETS.map((secret) => secret.name).sort()).toEqual(
      [...CONNECTOR_SECRET_NAMES].sort(),
    );
  });

  it("reports keyed sources as skipped · no_key while their secrets hold the placeholder", () => {
    for (const secret of JOB_SOURCE_SECRETS) process.env[secret.name] = UNSET_SECRET;
    process.env["REED_API_KEY"] = "";
    try {
      const secrets = jobSourceSecrets();
      expect(Object.values(secrets).every((value) => value === null)).toBe(true);
      const { run, skipped } = selectConnectors({
        query: { query: "backend", filters: FILTERS, limit: 10 },
        mode: "saved",
        context: context(secrets),
        connectors: SEARCH_CONNECTORS,
      });
      expect(skipped.map((report) => report.source).sort()).toEqual(["adzuna", "jooble", "reed", "usajobs"]);
      expect(run.every((item) => item.kind !== "keyed")).toBe(true);
      const health = skipped.map((report) =>
        nextSourceStatus({
          connector: SEARCH_CONNECTORS.find((item) => item.id === report.source) ?? connector({}),
          previous: null,
          report,
          consecutiveFailures: 0,
          quota: null,
          now: NOW,
        }),
      );
      expect(
        health.every(
          (doc) =>
            doc.state === "skipped" &&
            doc.reason === "no_key" &&
            doc.lastError === sourceErrorMessage("no_key"),
        ),
      ).toBe(true);
    } finally {
      for (const secret of JOB_SOURCE_SECRETS) Reflect.deleteProperty(process.env, secret.name);
    }
  });

  it("treats the placeholder and empty values as not configured", () => {
    expect(secretOrNull({ value: () => UNSET_SECRET })).toBeNull();
    expect(secretOrNull({ value: () => "  " })).toBeNull();
    expect(secretOrNull({ value: () => "abc" })).toBe("abc");
  });
});

describe("deleteUserData", () => {
  it("recursively deletes every per-user root and the Storage prefix", async () => {
    const deleted: string[] = [];
    let prefix = "";
    await deleteUserData(
      {
        doc: ((path: string) => ({ path })) as never,
        recursiveDelete: (async (ref: { path: string }) => {
          deleted.push(ref.path);
        }) as never,
      },
      {
        deleteFiles: async (options) => {
          prefix = options.prefix;
        },
      },
      "u1",
    );
    expect(deleted).toEqual([
      "users/u1",
      "serverOnly/aiUsage/users/u1",
      "serverOnly/jobAlerts/users/u1",
      "serverOnly/jobQuota/users/u1",
      "serverOnly/mail/users/u1",
    ]);
    expect(deleted.some((root) => serverOnlyPaths.jobAlert("u1", "j").startsWith(root))).toBe(true);
    expect(prefix).toBe("users/u1/");
  });
});
