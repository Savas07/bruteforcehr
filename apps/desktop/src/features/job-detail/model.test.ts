import { emptyDataset, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import { shortDate } from "../../shared/model/format";
import { buildJobDetailModel, type JobDetailVM, type MatchSectionVM } from "./model";

const ctx = fixtureContext(populatedDataset);

function detailOf(jobId: string, pending: readonly string[] = []): JobDetailVM {
  const model = buildJobDetailModel(populatedDataset, fixtureContext(populatedDataset, pending), { jobId });
  expect(model.selectedJobId).toBe(jobId);
  if (!model.detail) throw new Error(`no detail for ${jobId}`);
  return model.detail;
}

function ready(section: MatchSectionVM): Extract<MatchSectionVM, { state: "ready" }> {
  if (section.state !== "ready") throw new Error(`match is ${section.state}`);
  return section;
}

describe("buildJobDetailModel — list pane", () => {
  const model = buildJobDetailModel(populatedDataset, ctx, {});

  it("lists every job except dismissed ones, ranked by band then newest", () => {
    const ids = model.list.rows.map((row) => row.jobId);
    expect(ids).toHaveLength(37);
    expect(model.list.countLabel).toBe("37 jobs");
    for (const dismissed of ["job-spinach-angular", "job-hollowpine-unity", "job-bergmann-frontend"])
      expect(ids).not.toContain(dismissed);
    const bands = model.list.rows.map((row) => row.match?.band);
    expect(bands.indexOf("good")).toBeGreaterThan(bands.lastIndexOf("strong"));
    expect(bands.indexOf("partial")).toBeGreaterThan(bands.lastIndexOf("good"));
    expect(bands.indexOf("stretch")).toBeGreaterThan(bands.lastIndexOf("partial"));
    // Strong jobs posted yesterday come first; the higher score breaks the tie.
    expect(ids.slice(0, 4)).toEqual([
      "job-pixelpost-design-systems",
      "job-lighthouse-senior-frontend",
      "job-mercator-frontend",
      "job-aire-frontend",
    ]);
    expect(ids.at(-1)).toBe("job-zuiderzee-webgl");
    expect(model.list.sortLabel).toBe("Best match");
    expect(model.list.rankingInfo).toBe(
      "Sorted by match, then newest. Scores are a rough guide, not a prediction.",
    );
    expect(model.list.empty).toBeNull();
  });

  it("shows rows with company, place, salary provenance, band and saved / applied state", () => {
    const brisk = model.list.rows.find((row) => row.jobId === "job-brisk-frontend");
    expect(brisk).toMatchObject({
      title: "Frontend Engineer",
      company: { name: "Brisk Payments", monogram: "BP" },
      where: "Remote · Europe, including Türkiye (CET ±3 h)",
      salary: {
        provenance: "stated",
        text: "€55,000–€68,000 a year · from employer",
        shortText: "€55,000–€68,000 a year · employer",
      },
      match: { score: 92, band: "strong", bandLabel: "Strong" },
      scoreCaption: "92 of 100",
      status: { key: "acknowledged", label: "Acknowledged" },
      sourceCount: "3 sources",
      sourceNames: ["Greenhouse", "Remotive", "Arbeitnow"],
      pendingSync: false,
    });
    const moda = model.list.rows.find((row) => row.jobId === "job-moda-frontend");
    expect(moda).toMatchObject({
      where: "İstanbul (Beşiktaş), hibrit · Hybrid",
      salary: { provenance: "notStated", amount: null, text: "Salary not stated" },
      saved: false,
      status: null,
      sourceCount: null,
    });
    expect(moda?.posted?.label).toBe("2 days ago");
    const gridline = model.list.rows.find((row) => row.jobId === "job-gridline-product");
    expect(gridline).toMatchObject({ saved: true, status: null, where: "Amsterdam, hybrid" });
    // A Saved application keeps the bookmark, not a status chip.
    const sail = model.list.rows.find((row) => row.jobId === "job-sail-product");
    expect(sail).toMatchObject({ saved: true, status: null });
  });

  it("flags rows with local writes as waiting to sync", () => {
    const pending = buildJobDetailModel(
      populatedDataset,
      fixtureContext(populatedDataset, ["job-moda-frontend", "app-brisk"]),
      {},
    );
    const flagged = pending.list.rows.filter((row) => row.pendingSync).map((row) => row.jobId);
    expect(flagged.sort()).toEqual(["job-brisk-frontend", "job-moda-frontend"]);
  });
});

describe("buildJobDetailModel — search and reasons", () => {
  it("filters rows by title, company or place and keeps the band order", () => {
    const all = buildJobDetailModel(populatedDataset, ctx, {});
    const model = buildJobDetailModel(populatedDataset, ctx, { q: "  FRONTEND " });
    expect(model.list.query).toBe("FRONTEND");
    expect(model.list.rows.length).toBeGreaterThan(0);
    expect(model.list.rows.length).toBeLessThan(all.list.rows.length);
    for (const row of model.list.rows)
      expect(`${row.title} ${row.company.name} ${row.where ?? ""}`.toLowerCase()).toContain("frontend");
    const order = all.list.rows.map((row) => row.jobId).filter((id) => model.list.rows.some((row) => row.jobId === id));
    expect(model.list.rows.map((row) => row.jobId)).toEqual(order);
    expect(model.selectedJobId).toBe(model.list.rows[0]?.jobId);
  });

  it("says when the search hides every job and offers to clear it", () => {
    const model = buildJobDetailModel(populatedDataset, ctx, { q: "zzz-nothing" });
    expect(model.list.rows).toEqual([]);
    expect(model.list.empty).toEqual({
      kind: "noResults",
      title: "No jobs match “zzz-nothing”",
      body: "Try another word, or clear the search to see all your jobs.",
      action: "Clear search",
    });
  });

  it("lists the dismiss reasons in the core order, and the CVs for the basis menu", () => {
    const model = buildJobDetailModel(populatedDataset, ctx, {});
    expect(model.dismissReasons.map((reason) => reason.key)).toEqual([
      "not_relevant",
      "location",
      "salary",
      "seniority",
      "company",
      "language",
      "visa",
      "already_applied",
      "other",
    ]);
    expect(model.dismissReasons[7]?.label).toBe("Already applied");
    const match = ready(detailOf("job-brisk-frontend").match);
    const active = populatedDataset.cvs.filter((cv) => cv.archivedAt === null);
    expect(match.cvOptions.map((cv) => cv.id)).toEqual(active.map((cv) => cv.id));
    expect(match.cvOptions.some((cv) => cv.id === match.basedOnCvId)).toBe(true);
  });
});

describe("buildJobDetailModel — scopes", () => {
  it("shows only saved jobs in Saved and only hidden ones in Hidden jobs", () => {
    const saved = buildJobDetailModel(populatedDataset, ctx, { scope: "saved" });
    expect(saved.scope).toBe("saved");
    expect(saved.list.rows.length).toBeGreaterThan(0);
    expect(saved.list.rows.every((row) => row.saved)).toBe(true);
    const hidden = buildJobDetailModel(populatedDataset, ctx, { scope: "hidden" });
    const ids = hidden.list.rows.map((row) => row.jobId);
    for (const dismissed of ["job-spinach-angular", "job-hollowpine-unity", "job-bergmann-frontend"])
      expect(ids).toContain(dismissed);
    expect(hidden.detail?.hidden).toBe(true);
    expect(buildJobDetailModel(populatedDataset, ctx, { scope: "bogus" }).scope).toBe("all");
  });

  it("words an empty scope by what arrives there", () => {
    const model = buildJobDetailModel(emptyDataset, fixtureContext(emptyDataset), { scope: "saved" });
    expect(model.list.empty?.kind).toBe("firstUse");
  });
});

describe("buildJobDetailModel — selection", () => {
  it("selects the top row when no job is in the route", () => {
    const model = buildJobDetailModel(populatedDataset, ctx, {});
    expect(model.selectedJobId).toBe("job-pixelpost-design-systems");
    expect(model.detail?.title).toBe("Design Systems Engineer");
    expect(model.detail?.previousJobId).toBeNull();
    expect(model.detail?.nextJobId).toBe("job-lighthouse-senior-frontend");
    expect(model.noSelection).toEqual({
      title: "Select a job to see the details",
      hint: "↑ ↓ to move · Enter to open",
    });
  });

  it("falls back to the top row for an unknown id", () => {
    const model = buildJobDetailModel(populatedDataset, ctx, { jobId: "job-does-not-exist" });
    expect(model.selectedJobId).toBe("job-pixelpost-design-systems");
    expect(model.detail?.company.name).toBe("Pixelpost");
  });

  it("opens a dismissed job from a deep link with the hidden banner", () => {
    const detail = detailOf("job-spinach-angular");
    expect(detail.hidden).toBe(true);
    expect(detail.previousJobId).toBeNull();
    expect(detail.nextJobId).toBeNull();
  });
});

describe("buildJobDetailModel — detail", () => {
  it("builds the header, facts, salary and match for an applied job", () => {
    const detail = detailOf("job-brisk-frontend");
    expect(detail).toMatchObject({
      title: "Frontend Engineer",
      company: {
        name: "Brisk Payments",
        domain: populatedDataset.jobs.find((job) => job.id === "job-brisk-frontend")?.companyDomain,
      },
      location: null,
      workMode: "Remote",
      remoteEligibility: "Europe, including Türkiye (CET ±3 h)",
      employmentType: "Full-time",
      seniority: "Mid-level",
      salary: { provenance: "stated", amount: "€55,000–€68,000 a year" },
      hidden: false,
      delisted: null,
      noDescription: null,
      descriptionLanguage: "en",
      descriptionCollapsedLines: 12,
    });
    expect(detail.facts.map((fact) => [fact.label, fact.value])).toEqual([
      ["Salary", "€55,000–€68,000 a year · from employer"],
      ["Work mode", "Remote"],
      ["Where they hire", "Remote · Europe, including Türkiye (CET ±3 h)"],
      ["Visa sponsorship", "Not stated"],
      ["Relocation", "Not offered"],
      ["Employment type", "Full-time"],
      ["Last seen", expect.stringMatching(/ago$/u)],
    ]);
    expect(detail.facts.find((fact) => fact.key === "visa")?.notStated).toBe(true);
    expect(detail.description).toHaveLength(4);
    expect(detail.description[1]).toMatch(/^What you'll do\n• /u);

    const match = ready(detail.match);
    expect(match).toMatchObject({
      match: { score: 92, band: "strong" },
      bandText: "Strong match",
      scoreCaption: "92 of 100",
      basedOnCvId: "cv-en",
      defaultOpen: true,
      outsidePreferences: null,
      summaryNote: null,
    });
    expect(match.basisLine).toMatch(/^Based on CV "Base CV — English" · updated .+ ago$/u);
    expect(match.aiSummary).toMatch(/^Frontend Engineer at Brisk Payments lines up/u);
    expect(match.requirements.map((item) => [item.facetLabel, item.statusLabel])).toEqual([
      ["Remote", "Met"],
      ["Salary", "Met"],
      ["Seniority", "Met"],
    ]);
    expect(match.countsLine).toMatch(/^3 of 3 requirements met · \d+ of \d+ skills/u);
    expect(match.accessibleSummary).toMatch(/^Strong match, 92 of 100\. 3 of 3 requirements met\./u);

    // Applied: summary block and "Applied {date} · View in Tracker" instead of Apply.
    const application = populatedDataset.applications.find((candidate) => candidate.id === "app-brisk");
    expect(detail.application).toMatchObject({
      applicationId: "app-brisk",
      status: { key: "acknowledged" },
      cv: { id: "cv-en" },
    });
    expect(detail.applied).toEqual({
      applicationId: "app-brisk",
      label: application?.appliedAt ? `Applied ${shortDate(application.appliedAt, ctx)}` : "Applied",
      linkLabel: "View in Tracker",
    });
    expect(detail.submitPrompt).toBeNull();
  });

  it("groups the sources and marks the one Apply uses", () => {
    const detail = detailOf("job-brisk-frontend");
    expect(detail.sources.title).toBe("Found on 3 sites");
    expect(detail.sources.groups.map((group) => [group.label, group.rows.map((row) => row.name)])).toEqual([
      ["Direct from employer", ["Greenhouse"]],
      ["Job boards", ["Remotive", "Arbeitnow"]],
    ]);
    const greenhouse = detail.sources.groups[0]?.rows[0];
    expect(greenhouse).toMatchObject({
      usedForApply: true,
      badge: { kind: "employer", label: "Direct from employer" },
      unreachable: null,
    });
    expect(detail.sources.showAllLabel).toBeNull();
    expect(detail.apply).toMatchObject({
      route: "companySite",
      label: "Apply on company site",
      external: true,
      target: "https://job-boards.greenhouse.io/briskpayments/jobs/6633019",
      offlineReason: "Needs a connection",
    });
  });

  it("notes listings that show different values", () => {
    const sources = detailOf("job-thames-frontend").sources;
    const reed = sources.groups[1]?.rows[0];
    expect(reed?.name).toBe("Reed");
    expect(reed?.differences).toEqual([
      "Title: Front End Engineer (React)",
      "Salary: £65,000–£75,000 a year",
    ]);
  });

  it("labels Apply by route: job board and email", () => {
    const copperleaf = detailOf("job-copperleaf-frontend");
    expect(copperleaf.apply).toMatchObject({ route: "jobBoard", label: "Apply on Reed", external: true });
    expect(copperleaf.sources.groups).toEqual([expect.objectContaining({ label: "Job boards" })]);
    expect(copperleaf.applied).toBeNull();
    expect(copperleaf.application).toBeNull();

    const halden = detailOf("job-halden-product");
    expect(halden.apply).toEqual({
      route: "email",
      label: "Apply by email",
      external: false,
      target: "careers@haldenfreight.co.uk",
      offlineReason: "Needs a connection",
    });
    expect(halden.sources.groups.flatMap((group) => group.rows).some((row) => row.usedForApply)).toBe(false);
  });

  it("explains gaps, outside-preference requirements and the non-top-N note", () => {
    const fernweh = ready(detailOf("job-fernweh-frontend").match);
    expect(fernweh).toMatchObject({
      bandText: "Partial match",
      scoreCaption: "52 of 100",
      defaultOpen: false,
      aiSummary: null,
    });
    expect(fernweh.summaryNote).toBe("A written summary is created for your top matches.");
    expect(fernweh.basisLine).toMatch(/^Based on CV "Lebenslauf — Deutsch"/u);
    expect(fernweh.gaps.map((gap) => gap.text)).toContain("German at B2 or above; your CV lists A2");
    expect(fernweh.gaps.map((gap) => gap.text)).toContain("Not in your CV yet: Vue.js");
    for (const gap of fernweh.gaps) expect(gap.correctable).toBe(gap.status === "missing");
    expect(fernweh.gaps.some((gap) => gap.correctable)).toBe(true);

    const tidewater = ready(detailOf("job-tidewater-product").match);
    expect(tidewater.outsidePreferences).toMatch(/^Outside your preferences: Remote for US residents only.* and No visa sponsorship$/u);
    const remote = tidewater.requirements.find((item) => item.facet === "remote");
    expect(remote).toMatchObject({
      status: "outside_prefs",
      statusLabel: "Outside your preferences",
      impactLabel: "Matters most",
    });
    expect(remote?.evidence).toEqual({ fromLabel: "From the posting", quote: "Remote — US residents only" });
  });

  it("shows stated-not-stated salary and the delisted note for a closed posting", () => {
    const lumenpay = detailOf("job-lumenpay-frontend");
    const lastSeen = populatedDataset.jobs.find((job) => job.id === "job-lumenpay-frontend")?.sources[0]
      ?.lastSeenAt;
    if (!lastSeen) throw new Error("fixture changed");
    expect(lumenpay.delisted).toBe(
      `This job is no longer listed. Greenhouse removed it on ${shortDate(lastSeen, ctx)}. Your saved copy is below.`,
    );
    expect(lumenpay.sources.groups[0]?.rows[0]?.unreachable).toMatch(
      /^Not seen on this site since .+\. The listing may have closed\.$/u,
    );
    expect(lumenpay.salary.text).toBe(
      "TRY 1,900,000–TRY 2,400,000 a year · from employer".replace(/TRY /gu, "TRY\u00a0"),
    );

    const ada = detailOf("job-ada-frontend");
    expect(ada.salary).toEqual({
      provenance: "notStated",
      amount: null,
      text: "Salary not stated",
      shortText: "Salary not stated",
    });
    expect(ada.facts.find((fact) => fact.key === "salary")).toMatchObject({
      value: "Not stated",
      notStated: true,
    });
  });

  it("asks whether the user submitted while Preparing on an external route", () => {
    const northstar = detailOf("job-northstar-frontend", ["job-northstar-frontend"]);
    expect(northstar.submitPrompt).toEqual({
      applicationId: "app-northstar",
      question: "Did you submit your application to Northstar Maps?",
    });
    expect(northstar.applied).toBeNull();
    expect(northstar.application).toBeNull();
    expect(northstar.pendingSync).toBe(true);
  });
});

describe("buildJobDetailModel — Turkish", () => {
  it("formats labels with the Turkish catalog", () => {
    const turkish = fixtureContext(populatedDataset, [], createAppIntl({ language: "tr", locale: "tr-TR" }));
    const model = buildJobDetailModel(populatedDataset, turkish, { jobId: "job-brisk-frontend" });
    expect(model.list.sortLabel).not.toBe("Best match");
    expect(model.detail?.apply.label).not.toBe("Apply on company site");
    expect(model.detail?.sources.title).not.toBe("Found on 3 sites");
  });
});

describe("buildJobDetailModel — empty dataset", () => {
  it("returns the first-use list and no selection", () => {
    const model = buildJobDetailModel(emptyDataset, fixtureContext(emptyDataset), {
      jobId: "job-brisk-frontend",
    });
    expect(model.list.rows).toEqual([]);
    expect(model.list.countLabel).toBe("0 jobs");
    expect(model.list.empty).toEqual({
      kind: "firstUse",
      title: "No jobs yet",
      body: "Search for a role and save the search. We'll collect matching jobs here and rank them against your CV.",
      action: "Search jobs",
    });
    expect(model.selectedJobId).toBeNull();
    expect(model.detail).toBeNull();
    expect(model.noSelection.title).toBe("Select a job to see the details");
  });
});
