import { describe, expect, it } from "vitest";
import { type Job, JobMatchSchema, jobSourceKey, matchBand } from "../job";
import { jobFingerprint } from "../jobs/dedupe";
import { parseLocation } from "../jobs/normalize";
import {
  type ComputedMatch,
  computeMatch,
  HARD_FAIL_SCORE_CAP,
  initialMatchState,
  isHiddenCompany,
  type MatchProfile,
} from "./score";

const T0 = new Date("2026-10-20T08:00:00.000Z");

function job(overrides: Partial<Job> = {}): Job {
  const source = {
    source: "greenhouse",
    sourceId: "42",
    url: "https://boards.greenhouse.io/acme/jobs/42",
    applyUrl: null,
    applyEmail: null,
    isDirectFromEmployer: true,
    title: "Senior Backend Engineer",
    locationText: "Berlin, Germany",
    salary: null,
    postedAt: T0,
    firstSeenAt: T0,
    lastSeenAt: T0,
  };
  const base: Job = {
    id: "job1",
    sources: [source],
    sourceKeys: [jobSourceKey(source)],
    applyUrl: source.url,
    applyEmail: null,
    company: "Acme",
    companyDomain: "acme.com",
    title: "Senior Backend Engineer",
    locations: [parseLocation("Berlin, Germany")],
    remoteType: "hybrid",
    remoteEligibility: null,
    employmentType: "full_time",
    seniority: "senior",
    salary: { min: 75_000, max: 90_000, currency: "EUR", period: "year", estimated: false },
    visaSponsorship: true,
    relocationSupport: true,
    language: "en",
    description: "Build payments services with TypeScript and Node.js.",
    skills: ["TypeScript", "Node.js", "PostgreSQL", "Kubernetes"],
    postedAt: T0,
    expiresAt: null,
    fingerprint: "v1|acme|senior backend engineer|berlin",
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
  return { ...base, fingerprint: jobFingerprint(base) };
}

const profile: MatchProfile = {
  locations: [
    { label: "Istanbul", city: "Istanbul", countryCode: "TR", relocation: false },
    { label: "Berlin", city: "Berlin", countryCode: "DE", relocation: true },
    { label: "Netherlands", city: null, countryCode: "NL", relocation: true },
  ],
  remotePreferences: ["remote", "hybrid"],
  salaryFloor: { amount: 70_000, currency: "EUR", period: "year" },
  workAuthorization: [
    { region: "TR", status: "citizen" },
    { region: "EU", status: "needs_sponsorship" },
  ],
  languages: [
    { language: "tr", level: "native" },
    { language: "en", level: "C1" },
    { language: "de", level: "A2" },
  ],
  seniority: "senior",
  targetRoles: ["Backend Engineer", "Platform Engineer"],
  skills: ["typescript", "nodejs"],
  hiddenCompanies: [],
};

const cv = { cvId: "cv1", revisionId: "rev3", skills: ["PostgreSQL", "React"] };

function stored(computed: ComputedMatch) {
  const { hardFail: _hardFail, ...fields } = computed;
  return JobMatchSchema.parse({
    id: "job1",
    ...fields,
    rationale: null,
    state: "new",
    dismissReasons: [],
    stateChangedAt: null,
    computedAt: T0,
  });
}

describe("computeMatch", () => {
  it("scores a strong fit high with met requirements and skill chips", () => {
    const match = computeMatch({ job: job(), profile, cv, similarity: 0.8 });
    expect(stored(match).score).toBe(match.score);
    expect(match.hardFail).toBe(false);
    expect(matchBand(match.score)).toBe("strong");
    expect(match.basedOnCvRevisionId).toBe("rev3");
    expect(match.skills).toEqual({
      matched: ["TypeScript", "Node.js", "PostgreSQL"],
      unmatched: ["Kubernetes"],
    });
    const facets = Object.fromEntries(
      match.reasons
        .filter((factor) => factor.kind === "requirement")
        .map((factor) => [factor.facet, factor.status]),
    );
    expect(facets).toEqual({
      location: "met",
      remote: "met",
      authorization: "met",
      salary: "met",
      seniority: "met",
      language: "met",
    });
    expect(match.reasons.find((factor) => factor.kind === "experience")).toMatchObject({
      label: "Backend Engineer",
      status: "met",
    });
    expect(match.gaps).toEqual([
      {
        kind: "skill",
        facet: null,
        label: "Kubernetes",
        status: "missing",
        impact: "some",
        evidence: null,
        source: "rule",
      },
    ]);
  });

  it("caps the score when a requirement that matters most is outside preferences", () => {
    const onsite = computeMatch({ job: job({ remoteType: "onsite" }), profile, cv, similarity: 0.8 });
    expect(onsite.hardFail).toBe(true);
    expect(onsite.score).toBeLessThanOrEqual(HARD_FAIL_SCORE_CAP);
    expect(onsite.gaps[0]).toMatchObject({ facet: "remote", status: "outside_prefs", impact: "most" });

    const noVisa = computeMatch({ job: job({ visaSponsorship: false }), profile, cv, similarity: 0.8 });
    expect(noVisa.gaps.find((factor) => factor.facet === "authorization")?.status).toBe("outside_prefs");
    expect(noVisa.score).toBeLessThanOrEqual(HARD_FAIL_SCORE_CAP);

    const lowPay = computeMatch({
      job: job({ salary: { min: 40_000, max: 50_000, currency: "EUR", period: "year", estimated: false } }),
      profile,
      cv,
      similarity: 0.8,
    });
    expect(lowPay.gaps.find((factor) => factor.facet === "salary")).toMatchObject({
      label: "EUR 40,000–50,000 / year",
    });
    expect(lowPay.hardFail).toBe(true);
  });

  it("keeps not-stated requirements neutral, never gaps", () => {
    const vague = computeMatch({
      job: job({ salary: null, visaSponsorship: null, remoteType: null }),
      profile,
      cv,
      similarity: null,
    });
    expect(vague.hardFail).toBe(false);
    expect(vague.gaps.every((factor) => factor.kind !== "requirement")).toBe(true);
    expect(
      vague.reasons
        .filter((factor) => factor.status === "not_stated")
        .map((factor) => factor.facet)
        .sort(),
    ).toEqual(["authorization", "remote", "salary"]);
  });

  it("handles relocation, other cities and other countries", () => {
    const munich = computeMatch({
      job: job({ locations: [parseLocation("Munich, Germany")] }),
      profile,
      cv,
      similarity: null,
    });
    expect(munich.reasons.find((factor) => factor.facet === "location")?.status).toBe("partial");
    const london = computeMatch({
      job: job({ locations: [parseLocation("London, UK")] }),
      profile,
      cv,
      similarity: null,
    });
    expect(london.gaps.find((factor) => factor.facet === "location")?.status).toBe("outside_prefs");
    const amsterdam = computeMatch({
      job: job({ locations: [parseLocation("Amsterdam")] }),
      profile,
      cv,
      similarity: null,
    });
    expect(amsterdam.reasons.find((factor) => factor.facet === "location")?.status).toBe("met");
    const remoteUs = computeMatch({
      job: job({ remoteType: "remote", locations: [parseLocation("Remote, USA")], visaSponsorship: null }),
      profile,
      cv,
      similarity: null,
    });
    expect(remoteUs.gaps.find((factor) => factor.facet === "location")).toMatchObject({
      status: "outside_prefs",
      impact: "some",
    });
  });

  it("flags a posting language the user doesn't speak well", () => {
    const german = computeMatch({ job: job({ language: "de" }), profile, cv, similarity: null });
    expect(german.gaps.find((factor) => factor.facet === "language")).toMatchObject({
      label: "German",
      status: "missing",
    });
  });

  it("uses similarity and title fit to separate otherwise equal jobs", () => {
    const close = computeMatch({ job: job(), profile, cv, similarity: 0.85 });
    const far = computeMatch({ job: job({ title: "Account Executive" }), profile, cv, similarity: 0.55 });
    expect(close.score).toBeGreaterThan(far.score + 20);
  });

  it("is deterministic and always in 0–100", () => {
    const input = { job: job(), profile, cv, similarity: 1.2 };
    expect(computeMatch(input)).toEqual(computeMatch(input));
    expect(computeMatch(input).score).toBeLessThanOrEqual(100);
    expect(computeMatch({ ...input, similarity: -1 }).score).toBeGreaterThanOrEqual(0);
  });

  it("works without a CV or preferences", () => {
    const bare = computeMatch({
      job: job(),
      profile: {
        locations: [],
        remotePreferences: [],
        salaryFloor: null,
        workAuthorization: [],
        languages: [],
        seniority: null,
        targetRoles: [],
        skills: [],
        hiddenCompanies: [],
      },
      cv: null,
      similarity: null,
    });
    expect(stored(bare).basedOnCvId).toBeNull();
    expect(bare.skills.unmatched).toHaveLength(4);
  });
});

describe("helpers", () => {
  it("hides companies by domain or name", () => {
    const hidden = { name: "ACME GmbH", domain: null, hiddenAt: T0 };
    expect(isHiddenCompany(job(), { hiddenCompanies: [hidden] })).toBe(true);
    expect(
      isHiddenCompany(job(), { hiddenCompanies: [{ name: "x", domain: "acme.com", hiddenAt: T0 }] }),
    ).toBe(true);
    expect(isHiddenCompany(job(), { hiddenCompanies: [] })).toBe(false);
  });

  it("starts client-saved imports as saved", () => {
    expect(initialMatchState(job())).toBe("new");
    const imported = job();
    const [primary] = imported.sources;
    if (primary === undefined) throw new Error("fixture job has a source");
    imported.sources = [{ ...primary, source: "url_import", sourceId: null }];
    expect(initialMatchState(imported)).toBe("saved");
  });
});
