import { describe, expect, it } from "vitest";
import { ApplicationEventSchema } from "./application";
import { IdSchema, TimeZoneSchema } from "./common";
import { CvContentSchema, RenderedFileSchema, ResumeDateSchema } from "./cv";
import { JobMatchSchema, jobSourceKey, MATCH_BAND_THRESHOLDS, matchBand } from "./job";
import { MAIL_MESSAGE_CLIENT_UPDATABLE_FIELDS, MailReviewUpdateSchema } from "./policy";

const at = new Date("2026-10-01T09:00:00.000Z");

describe("IdSchema", () => {
  it("accepts Firestore document ids only", () => {
    expect(IdSchema.safeParse("a1B2c3").success).toBe(true);
    for (const bad of ["", "a/b", ".", "..", "__id__"]) expect(IdSchema.safeParse(bad).success).toBe(false);
  });
});

describe("TimeZoneSchema", () => {
  it("accepts IANA names", () => {
    for (const tz of ["UTC", "Europe/Istanbul", "America/Argentina/Buenos_Aires", "Etc/GMT+3"]) {
      expect(TimeZoneSchema.safeParse(tz).success).toBe(true);
    }
    for (const tz of ["GMT+3", "europe/berlin", "Berlin"])
      expect(TimeZoneSchema.safeParse(tz).success).toBe(false);
  });
});

describe("ApplicationEventSchema", () => {
  const base = {
    id: "e1",
    applicationId: "a1",
    type: "status_changed",
    fromStatus: "applied",
    toStatus: "screening",
    actor: "user",
    confidence: null,
    evidence: null,
    text: null,
    revertsEventId: null,
    occurredAt: at,
    createdAt: at,
  } as const;

  it("accepts a user status change", () => {
    expect(ApplicationEventSchema.safeParse(base).success).toBe(true);
  });

  it("requires confidence + evidence from automation and none from users", () => {
    expect(ApplicationEventSchema.safeParse({ ...base, actor: "ai" }).success).toBe(false);
    expect(
      ApplicationEventSchema.safeParse({
        ...base,
        actor: "rule",
        confidence: 0.97,
        evidence: { mailMessageId: "m1", reason: "ATS" },
      }).success,
    ).toBe(true);
    expect(ApplicationEventSchema.safeParse({ ...base, confidence: 0.5 }).success).toBe(false);
  });

  it("checks status fields per event type", () => {
    expect(ApplicationEventSchema.safeParse({ ...base, toStatus: "applied" }).success).toBe(false);
    expect(ApplicationEventSchema.safeParse({ ...base, type: "created" }).success).toBe(false);
    expect(ApplicationEventSchema.safeParse({ ...base, type: "created", fromStatus: null }).success).toBe(
      true,
    );
    expect(ApplicationEventSchema.safeParse({ ...base, type: "note", text: "x" }).success).toBe(false);
    expect(
      ApplicationEventSchema.safeParse({ ...base, type: "note", fromStatus: null, toStatus: null, text: "x" })
        .success,
    ).toBe(true);
  });

  it("only lets user status changes revert", () => {
    expect(ApplicationEventSchema.safeParse({ ...base, revertsEventId: "e0" }).success).toBe(true);
    expect(
      ApplicationEventSchema.safeParse({
        ...base,
        actor: "ai",
        confidence: 1,
        evidence: { mailMessageId: null, reason: "r" },
        revertsEventId: "e0",
      }).success,
    ).toBe(false);
  });
});

describe("ResumeDateSchema", () => {
  it.each(["2020", "2020-03", "2020-12-31"])("accepts %s", (date) => {
    expect(ResumeDateSchema.safeParse(date).success).toBe(true);
  });
  it.each(["2020-13", "2020-00", "2020-3", "2020-02-00", "2020-02-32", "20-03"])("rejects %s", (date) => {
    expect(ResumeDateSchema.safeParse(date).success).toBe(false);
  });
});

describe("CvContentSchema", () => {
  const meta = {
    template: "classic",
    theme: {
      accentColor: "#2F6FEB",
      fontPair: "inter-source-serif",
      density: "comfortable",
      paperSize: "a4",
    },
    sectionOrder: ["basics", "work", "custom:talks"],
    customSections: [
      { id: "talks", title: "Talks", items: [{ title: "Design systems at scale", startDate: "2025-05" }] },
    ],
  } as const;

  it("accepts JSON Resume content with the meta extension", () => {
    const parsed = CvContentSchema.parse({
      basics: { name: "Ada", location: { city: "Istanbul", countryCode: "TR" } },
      work: [{ name: "Acme", position: "Engineer", startDate: "2022-03", highlights: ["Shipped"] }],
      meta,
    });
    expect(parsed.meta.customSections[0]?.id).toBe("talks");
  });

  it("rejects bad dates and dangling custom section references", () => {
    expect(CvContentSchema.safeParse({ work: [{ startDate: "03/2022" }], meta }).success).toBe(false);
    expect(CvContentSchema.safeParse({ meta: { ...meta, customSections: [] } }).success).toBe(false);
  });
});

describe("RenderedFileSchema", () => {
  const file = {
    id: "f1",
    kind: "pdf",
    cvId: "cv1",
    cvRevisionId: "r1",
    coverLetterId: null,
    storagePath: "users/u/rendered/f1",
    fileName: "Ada-Lovelace-CV.pdf",
    sizeBytes: 81234,
    sha256: "a".repeat(64),
    createdAt: at,
  } as const;

  it("needs exactly one subject", () => {
    expect(RenderedFileSchema.safeParse(file).success).toBe(true);
    expect(RenderedFileSchema.safeParse({ ...file, coverLetterId: "c1" }).success).toBe(false);
    expect(RenderedFileSchema.safeParse({ ...file, cvId: null, cvRevisionId: null }).success).toBe(false);
    expect(
      RenderedFileSchema.safeParse({ ...file, cvId: null, cvRevisionId: null, coverLetterId: "c1" }).success,
    ).toBe(true);
  });
});

describe("JobMatchSchema", () => {
  const reason = {
    kind: "requirement",
    facet: "remote",
    label: "Remote within Europe",
    status: "met",
    impact: "most",
    evidence: { from: "posting", quote: "Remote (EMEA time zones)" },
    source: "rule",
  } as const;
  const gap = {
    kind: "skill",
    facet: null,
    label: "Vue.js",
    status: "missing",
    impact: "some",
    evidence: null,
    source: "rule",
  } as const;
  const match = {
    id: "j1",
    score: 82,
    basedOnCvId: "cv1",
    basedOnCvRevisionId: "r1",
    reasons: [reason],
    gaps: [gap],
    skills: { matched: ["react"], unmatched: ["vue"] },
    rationale: null,
    state: "new",
    dismissReasons: [],
    stateChangedAt: null,
    computedAt: at,
  } as const;

  it("accepts structured reasons and gaps", () => {
    expect(JobMatchSchema.safeParse(match).success).toBe(true);
    expect(JobMatchSchema.safeParse({ ...match, score: 101 }).success).toBe(false);
  });

  it("keeps statuses in the right list and facets on requirements only", () => {
    expect(
      JobMatchSchema.safeParse({ ...match, reasons: [{ ...reason, status: "not_stated" }] }).success,
    ).toBe(true);
    expect(JobMatchSchema.safeParse({ ...match, reasons: [{ ...reason, status: "missing" }] }).success).toBe(
      false,
    );
    expect(JobMatchSchema.safeParse({ ...match, gaps: [{ ...gap, status: "met" }] }).success).toBe(false);
    expect(JobMatchSchema.safeParse({ ...match, gaps: [{ ...gap, facet: "salary" }] }).success).toBe(false);
    expect(JobMatchSchema.safeParse({ ...match, reasons: [{ ...reason, facet: null }] }).success).toBe(false);
  });

  it("allows dismiss reasons (optional, multi-select) only when dismissed", () => {
    expect(JobMatchSchema.safeParse({ ...match, dismissReasons: ["salary"] }).success).toBe(false);
    expect(JobMatchSchema.safeParse({ ...match, state: "dismissed" }).success).toBe(true);
    expect(
      JobMatchSchema.safeParse({ ...match, state: "dismissed", dismissReasons: ["salary", "location"] })
        .success,
    ).toBe(true);
  });

  it("needs CV and revision together", () => {
    expect(JobMatchSchema.safeParse({ ...match, basedOnCvRevisionId: null }).success).toBe(false);
    expect(JobMatchSchema.safeParse({ ...match, basedOnCvId: null, basedOnCvRevisionId: null }).success).toBe(
      true,
    );
  });
});

describe("matchBand", () => {
  it("bands scores at the named thresholds", () => {
    expect([100, 80, 79, 65, 64, 45, 44, 0].map(matchBand)).toEqual([
      "strong",
      "strong",
      "good",
      "good",
      "partial",
      "partial",
      "stretch",
      "stretch",
    ]);
    expect(MATCH_BAND_THRESHOLDS).toEqual({ strong: 80, good: 65, partial: 45 });
  });
});

describe("policy", () => {
  it("source keys prefer the source id", () => {
    expect(jobSourceKey({ source: "greenhouse", sourceId: "123", url: "https://x.io" })).toBe(
      "greenhouse:123",
    );
    expect(jobSourceKey({ source: "url_import", sourceId: null, url: "https://x.io/j" })).toBe(
      "url_import:https://x.io/j",
    );
  });

  it("mail review updates carry exactly the client-updatable fields", () => {
    const update = MailReviewUpdateSchema.parse({
      reviewState: "confirmed",
      applicationId: "a1",
      category: "rejection",
      reviewedAt: at,
    });
    expect(Object.keys(update).sort()).toEqual([...MAIL_MESSAGE_CLIENT_UPDATABLE_FIELDS].sort());
    expect(MailReviewUpdateSchema.safeParse({ ...update, reviewState: "auto_applied" }).success).toBe(false);
  });
});
