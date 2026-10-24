import { JobDraftSchema, jobFromWire, jobSourceKey } from "@bfhr/core";
import { FIXTURE_NOW } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import {
  blankForm,
  buildImportReview,
  checkLink,
  classifyImportError,
  formFromJob,
  formProblems,
  importErrorView,
  importNotes,
  jobFromForm,
  manualImportJob,
  parseAmount,
} from "./model";
import { TEST_IMPORT_URL, testImportResponse } from "./test-response";

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const response = testImportResponse();
const base = jobFromWire(response.job);
const initial = formFromJob(base, response.finalUrl);

describe("checkLink", () => {
  it("accepts https links and adds https:// to bare addresses", () => {
    expect(checkLink("  https://jobs.acme.com/42  ")).toEqual({ url: "https://jobs.acme.com/42" });
    expect(checkLink("jobs.acme.com/42?ref=li")).toEqual({ url: "https://jobs.acme.com/42?ref=li" });
    expect(checkLink("jobs.acme.com:8443/42")).toEqual({ url: "https://jobs.acme.com:8443/42" });
  });

  it("names what's wrong", () => {
    expect(checkLink("   ")).toEqual({ problem: "empty" });
    expect(checkLink("http://jobs.acme.com/42")).toEqual({ problem: "notHttps" });
    expect(checkLink("ftp://jobs.acme.com/42")).toEqual({ problem: "notHttps" });
    expect(checkLink("mailto:jobs@acme.com")).toEqual({ problem: "invalid" });
    expect(checkLink("frontend engineer")).toEqual({ problem: "invalid" });
    expect(checkLink("https://jobs")).toEqual({ problem: "invalid" });
    expect(checkLink(`https://acme.com/${"a".repeat(2100)}`)).toEqual({ problem: "tooLong" });
  });
});

describe("errors", () => {
  const error = (code: string, reason?: string) =>
    Object.assign(new Error(reason ?? code), { code: `functions/${code}`, details: reason ? { reason } : undefined });

  it("picks the kind from details.reason, then the code", () => {
    expect(classifyImportError(error("failed-precondition", "blocked_by_site"), { online: true })).toBe("blocked_by_site");
    expect(classifyImportError(error("resource-exhausted", "daily_cap"), { online: true })).toBe("daily_cap");
    expect(classifyImportError(error("deadline-exceeded"), { online: true })).toBe("timeout");
    expect(classifyImportError(error("unauthenticated"), { online: true })).toBe("signedOut");
    expect(classifyImportError(error("internal", "something_new"), { online: true })).toBe("unknown");
    expect(classifyImportError(new TypeError("fetch"), { online: false })).toBe("offline");
  });

  it("offers Enter it yourself where the page can't be read, Try again where a retry helps", () => {
    const offers = (kind: Parameters<typeof importErrorView>[1]) => {
      const view = importErrorView(intl, kind);
      return view.offerManual ? "manual" : view.offerRetry ? "retry" : null;
    };
    expect(offers("blocked_by_site")).toBe("manual");
    expect(offers("no_job_found")).toBe("manual");
    expect(offers("not_html")).toBe("manual");
    expect(offers("fetch_failed")).toBe("manual");
    expect(offers("offline")).toBe("manual");
    expect(offers("ai_unavailable")).toBe("retry");
    expect(offers("not_found")).toBeNull();
    expect(offers("daily_cap")).toBeNull();
    expect(importErrorView(intl, "blocked_by_site").message).toBe(
      "This site doesn't let us read its pages. You can enter the details yourself.",
    );
    expect(importErrorView(intl, "offline").message).toMatch(/^Reading a link needs a connection\./u);
  });
});

describe("parseAmount", () => {
  it("reads common groupings and decimals", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("65000")).toBe(65_000);
    expect(parseAmount("65,000")).toBe(65_000);
    expect(parseAmount("65.000")).toBe(65_000);
    expect(parseAmount("65 000")).toBe(65_000);
    expect(parseAmount("1.234.567")).toBe(1_234_567);
    expect(parseAmount("65,000.50")).toBe(65_000.5);
    expect(parseAmount("65.000,50")).toBe(65_000.5);
    expect(parseAmount("22.50")).toBe(22.5);
    expect(parseAmount("22,5")).toBe(22.5);
    expect(parseAmount("about 60k")).toBeNaN();
    expect(parseAmount("1.2.3")).toBeNaN();
  });
});

describe("form ↔ job", () => {
  it("fills the form from the draft", () => {
    expect(initial).toMatchObject({
      postingUrl: TEST_IMPORT_URL,
      title: "Senior Frontend Engineer",
      company: "Lindenhof Mobility",
      location: "Berlin · Munich",
      remoteType: "hybrid",
      employmentType: "full_time",
      seniority: "senior",
      salaryMin: "70000",
      salaryMax: "85000",
      salaryCurrency: "EUR",
      salaryPeriod: "year",
      salaryEstimated: false,
      visaSponsorship: "yes",
      applyUrl: `${TEST_IMPORT_URL}/apply`,
      applyEmail: "",
    });
  });

  it("returns the draft unchanged when nothing was edited", () => {
    expect(jobFromForm(initial, initial, base)).toEqual(base);
  });

  it("applies edits to the job and its url_import listing, keeping sourceKeys", () => {
    const job = jobFromForm(
      {
        ...initial,
        title: "  Staff Frontend Engineer ",
        location: "Berlin",
        remoteType: "",
        salaryMin: "75.000",
        salaryEstimated: true,
        visaSponsorship: "unknown",
        applyUrl: "",
        applyEmail: "Jobs@Lindenhof.de",
        description: "Edited.",
      },
      initial,
      base,
    );
    expect(job).toMatchObject({
      title: "Staff Frontend Engineer",
      company: "Lindenhof Mobility",
      locations: [{ label: "Berlin", city: null, countryCode: null }],
      remoteType: null,
      salary: { min: 75_000, max: 85_000, currency: "EUR", period: "year", estimated: true },
      visaSponsorship: null,
      applyUrl: null,
      applyEmail: "jobs@lindenhof.de",
      description: "Edited.",
      sourceKeys: base.sourceKeys,
      fingerprint: base.fingerprint,
    });
    expect(job.sources[0]).toMatchObject({
      url: TEST_IMPORT_URL,
      title: "Staff Frontend Engineer",
      locationText: "Berlin",
      salary: job.salary,
      applyUrl: null,
      applyEmail: "jobs@lindenhof.de",
    });
    expect(JobDraftSchema.safeParse(job).success).toBe(true);
  });

  it("updates only the url_import listing of a merged job", () => {
    const [imported] = base.sources;
    if (!imported) throw new Error("no source");
    const board = { ...imported, source: "greenhouse", sourceId: "4821", title: "Sr. Frontend Engineer" };
    const merged = { ...base, sources: [board, imported], sourceKeys: [jobSourceKey(board), jobSourceKey(imported)] };
    const form = formFromJob(merged, TEST_IMPORT_URL);
    const job = jobFromForm({ ...form, title: "Frontend Engineer" }, form, merged);
    expect(job.sources.map((source) => source.title)).toEqual(["Sr. Frontend Engineer", "Frontend Engineer"]);
    expect(job.sourceKeys).toEqual(merged.sourceKeys);
  });

  it("removes the salary when both amounts are cleared", () => {
    const job = jobFromForm({ ...initial, salaryMin: "", salaryMax: "" }, initial, base);
    expect(job.salary).toBeNull();
    expect(job.sources[0]?.salary).toBeNull();
  });
});

describe("formProblems", () => {
  it("needs a role and company; checks amounts, currency, links and email", () => {
    expect(formProblems(initial, { manual: false })).toEqual({});
    expect(
      formProblems(
        {
          ...initial,
          title: " ",
          company: "",
          salaryMin: "90000",
          salaryCurrency: "Euro",
          applyUrl: "apply here",
          applyEmail: "jobs at acme",
        },
        { manual: false },
      ),
    ).toEqual({
      title: "titleMissing",
      company: "companyMissing",
      salaryMax: "rangeInverted",
      salaryCurrency: "currencyInvalid",
      applyUrl: "urlInvalid",
      applyEmail: "emailInvalid",
    });
    expect(formProblems({ ...initial, salaryMin: "lots" }, { manual: false })).toEqual({ salaryMin: "amountInvalid" });
  });

  it("checks the posting link only when entering the job by hand", () => {
    const form = { ...blankForm("not a link", "EUR"), title: "Designer", company: "Acme", applyUrl: "" };
    expect(formProblems(form, { manual: true })).toEqual({ postingUrl: "urlInvalid" });
    expect(formProblems(form, { manual: false })).toEqual({});
  });
});

describe("manualImportJob", () => {
  it("builds a url_import job like manualJob, with the form's details", () => {
    const form = {
      ...blankForm("https://careers.acme.com/jobs/7", "EUR"),
      title: "Product Designer",
      company: "Acme Robotics",
      location: "Remote, EU",
      remoteType: "remote" as const,
      salaryMin: "60000",
      description: "Pasted text.",
    };
    const job = manualImportJob(form, FIXTURE_NOW);
    expect(JobDraftSchema.safeParse(job).success).toBe(true);
    expect(job).toMatchObject({
      title: "Product Designer",
      company: "Acme Robotics",
      locations: [{ label: "Remote, EU", city: null, countryCode: null }],
      remoteType: "remote",
      salary: { min: 60_000, max: null, currency: "EUR", period: "year", estimated: false },
      applyUrl: "https://careers.acme.com/jobs/7",
      language: "und",
      skills: [],
      description: "Pasted text.",
      fingerprint: "manual|acme robotics|product designer",
      sourceKeys: ["url_import:https://careers.acme.com/jobs/7"],
      createdAt: FIXTURE_NOW,
    });
    expect(job.sources).toEqual([
      expect.objectContaining({
        source: "url_import",
        sourceId: null,
        url: "https://careers.acme.com/jobs/7",
        applyUrl: "https://careers.acme.com/jobs/7",
        isDirectFromEmployer: false,
        title: "Product Designer",
        locationText: "Remote, EU",
      }),
    ]);
  });
});

describe("review", () => {
  it("names the source, flags low-confidence fields and notes the existing job", () => {
    const review = buildImportReview(intl, response);
    expect(review.provenance).toEqual({
      text: "Read from the page's job data · boards.example-ats.com",
      ai: false,
    });
    expect([...review.check]).toEqual(["salaryMin"]);
    expect(review.existingNote).toBeNull();
    const ai = buildImportReview(intl, { ...response, method: "ai", existingJobId: "job-1", confidence: { company: 0.6 } });
    expect(ai.provenance).toEqual({ text: "Read by AI · can be wrong · boards.example-ats.com", ai: true });
    expect([...ai.check]).toEqual(["company"]);
    expect(ai.existingNote).toBe("You already have this job. We'll add this link to it.");
  });

  it("turns warnings into calm notes, each once, skipping unknown codes", () => {
    expect(
      importNotes(intl, [
        "dropped_ungrounded:salary",
        "dropped_ungrounded:applyEmail",
        "description_truncated",
        "no_description",
        "description_not_found",
        "dropped_ungrounded:mystery",
        "something_new",
      ]),
    ).toEqual([
      "We left out the salary because the page didn't clearly say it.",
      "We left out the apply email because the page didn't clearly say it.",
      "The description was very long, so we kept the first part.",
      "We couldn't find a description on the page. You can paste it below.",
    ]);
  });
});
