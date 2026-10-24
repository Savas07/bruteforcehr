import { describe, expect, it } from "vitest";
import { DailyCapError } from "./budget";
import { cutDescription, extractJobPosting, groundJobExtraction, JOB_EXTRACT_MODEL } from "./job-extract";
import type { JobExtractOutput } from "./prompts/job-extract";
import { memoryLedger, scriptedProvider } from "./test-helpers";

const PAGE = `Senior Software Engineer | Jobs at

Your mission

Who we are
Established in 2010, Ultralytics boasts a global presence. At Ultralytics, we commit to innovation.

What You'll Do
As a Senior Software Engineer at Ultralytics, you'll build vision AI.
• Ship Python services
• Review code

Location: Madrid, Remote EURO
Full-time · €70,000 – €90,000 per year
Apply by 2026-11-30 at jobs@ultralytics.com

Similar jobs
Junior Designer`;

const reply = (overrides: Partial<JobExtractOutput> = {}): JobExtractOutput => ({
  isJobPosting: true,
  title: "Senior Software Engineer",
  company: "Ultralytics",
  locations: ["Madrid", "Remote EURO"],
  workplace: "remote",
  employmentType: "full_time",
  salary: { min: 70000, max: 90000, currency: "EUR", period: "year" },
  datePosted: null,
  validThrough: "2026-11-30",
  applyEmail: "jobs@ultralytics.com",
  descriptionStart: "Who we are Established in 2010,",
  descriptionEnd: "at jobs@ultralytics.com",
  ...overrides,
});

describe("groundJobExtraction", () => {
  it("keeps values the page states and cuts the description out of the page", () => {
    const grounded = groundJobExtraction(reply(), PAGE);
    expect(grounded.warnings).toEqual([]);
    expect(grounded.posting).toMatchObject({
      title: "Senior Software Engineer",
      company: "Ultralytics",
      remoteType: "remote",
      employmentType: "full_time",
      seniority: "senior",
      salary: { min: 70000, max: 90000, currency: "EUR", period: "year", estimated: false },
      applyEmail: "jobs@ultralytics.com",
    });
    expect(grounded.posting?.validThrough?.toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(grounded.posting?.locations.map((location) => location.label)).toEqual(["Madrid", "Remote EURO"]);
    expect(grounded.posting?.description).toMatch(/^Who we are\nEstablished in 2010/);
    expect(grounded.posting?.description).toMatch(/jobs@ultralytics\.com$/);
    expect(grounded.posting?.description).not.toContain("Similar jobs");
    expect(grounded.confidence.title).toBe(0.9);
  });

  it("drops a company, salary, date and email the page never states", () => {
    const grounded = groundJobExtraction(
      reply({
        company: "Ultralytics Inc.",
        salary: { min: 120000, max: null, currency: "USD", period: "year" },
        datePosted: "2026-10-01",
        applyEmail: "hr@ultralytics.com",
      }),
      PAGE,
    );
    expect(grounded.warnings).toEqual(
      expect.arrayContaining([
        "dropped_ungrounded:company",
        "dropped_ungrounded:salary",
        "dropped_ungrounded:postedAt",
        "dropped_ungrounded:applyEmail",
      ]),
    );
    // Without a grounded company there is no posting to offer.
    expect(grounded.posting).toBeNull();
  });

  it("drops an invented location but keeps the grounded ones", () => {
    const grounded = groundJobExtraction(reply({ locations: ["Madrid", "Berlin"] }), PAGE);
    expect(grounded.posting?.locations.map((location) => location.label)).toEqual(["Madrid"]);
    expect(grounded.warnings).toContain("dropped_ungrounded:locations");
  });

  it("reports pages that are not a single posting", () => {
    expect(groundJobExtraction(reply({ isJobPosting: false }), PAGE)).toEqual({
      posting: null,
      confidence: {},
      warnings: ["not_a_job_posting"],
    });
  });

  it("leaves the description empty when the anchors are not on the page", () => {
    const grounded = groundJobExtraction(reply({ descriptionStart: "We are a stealth startup" }), PAGE);
    expect(grounded.warnings).toContain("description_not_found");
    expect(grounded.posting?.description).toBe("");
    expect(grounded.confidence.description).toBeUndefined();
  });
});

describe("cutDescription", () => {
  it("matches anchors across line breaks and spacing", () => {
    expect(cutDescription("a b\nc  d e f", "b c", "d e")).toBe("b\nc  d e");
    expect(cutDescription("a b c", "x", "c")).toBeNull();
  });
});

describe("extractJobPosting", () => {
  it("runs one metered Haiku call with the page as data", async () => {
    const provider = scriptedProvider([reply()]);
    const { ledger, state } = memoryLedger();
    const result = await extractJobPosting("https://ultralytics.jobs.personio.com/job/1", PAGE, {
      provider,
      ledger,
    });
    expect(result.posting?.company).toBe("Ultralytics");
    expect(result.model).toBe(JOB_EXTRACT_MODEL);
    expect(provider.requests[0]?.user).toContain("<page_text>");
    expect(provider.requests[0]?.system).not.toContain("Ultralytics");
    expect(state.settles).toHaveLength(1);
  });

  it("refuses over the daily cap without calling the model", async () => {
    const provider = scriptedProvider([reply()]);
    const { ledger } = memoryLedger(0);
    await expect(
      extractJobPosting("https://x.example/job", PAGE, { provider, ledger }),
    ).rejects.toBeInstanceOf(DailyCapError);
    expect(provider.requests).toHaveLength(0);
  });
});
