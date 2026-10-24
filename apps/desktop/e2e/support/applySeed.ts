/**
 * Documents the apply spec seeds ("the server wrote them"), as plain values: a posting, its match,
 * a CV with one revision and an answer. No WebdriverIO imports, so a unit test
 * (src/test/e2eSeeds.test.ts) can check them against the @bfhr/core schemas the app decodes with:
 * a document that fails them is skipped by the listeners and the spec would wait for nothing.
 */
import { APPLY_CV_CONTENT } from "./recordedData";

export function seedJob(entry: { id: string; company: string }, apply: { url: string | null; email: string | null }, now: Date) {
  const url = apply.url ?? `https://example.com/jobs/${entry.id}`;
  return {
    sources: [
      {
        // A board listing with its own id, so `sourceKeys` matches `jobSourceKey` (JobSchema checks it).
        source: "greenhouse",
        sourceId: entry.id,
        url,
        applyUrl: apply.url,
        applyEmail: apply.email,
        isDirectFromEmployer: true,
        title: "Frontend Engineer",
        locationText: "Berlin",
        salary: null,
        postedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    ],
    sourceKeys: [`greenhouse:${entry.id}`],
    applyUrl: apply.url,
    applyEmail: apply.email,
    company: entry.company,
    companyDomain: null,
    title: "Frontend Engineer",
    locations: [{ label: "Berlin", city: "Berlin", countryCode: "DE" }],
    remoteType: "hybrid",
    remoteEligibility: null,
    employmentType: "full_time",
    seniority: "mid",
    salary: null,
    visaSponsorship: null,
    relocationSupport: null,
    language: "en",
    description: `${entry.company} wants fast, measurable frontend work in TypeScript.`,
    skills: ["typescript", "react"],
    postedAt: now,
    expiresAt: null,
    fingerprint: `${entry.company}|frontend engineer`.toLowerCase(),
    createdAt: now,
    updatedAt: now,
  };
}

export function seedMatch(now: Date) {
  return {
    score: 90,
    basedOnCvId: null,
    basedOnCvRevisionId: null,
    reasons: [],
    gaps: [],
    skills: { matched: ["typescript"], unmatched: [] },
    rationale: null,
    state: "new",
    dismissReasons: [],
    stateChangedAt: null,
    computedAt: now,
  };
}

export function seedRevision(now: Date) {
  return { content: APPLY_CV_CONTENT, source: "manual", basedOnRevisionId: null, jobId: null, diffSummary: null, createdAt: now };
}

export function seedCv(title: string, revisionId: string, now: Date) {
  return {
    title,
    language: "en",
    parentCvId: null,
    currentRevisionId: revisionId,
    templateId: "classic",
    theme: APPLY_CV_CONTENT.meta.theme,
    isDefault: false,
    archivedAt: null,
    version: 1,
    importedFrom: null,
    createdAt: now,
    // Newest, so the Apply panels pick it by default.
    updatedAt: new Date(now.getTime() + 60_000),
  };
}

export function seedAnswer(text: string, now: Date) {
  return {
    kind: "notice_period",
    label: "Notice period",
    values: [{ language: "en", text }],
    countries: [],
    currency: null,
    position: 0,
    createdAt: now,
    updatedAt: now,
  };
}
