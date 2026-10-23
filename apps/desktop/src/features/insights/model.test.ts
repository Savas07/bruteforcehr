import { computeInsights, civilDate, rangeForPreset, selectDrillDownIds } from "@bfhr/core";
import { emptyDataset, FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { fixtureContext } from "../../shared/model/fixture-context";
import {
  buildInsightsModel,
  insightsInput,
  insightsSearch,
  localeWeekStart,
  readInsightsParams,
} from "./model";

const ctx = fixtureContext(populatedDataset);

describe("buildInsightsModel", () => {
  it("summarises the populated account over 90 days", () => {
    const model = buildInsightsModel(populatedDataset, ctx, {});
    const today = civilDate(FIXTURE_NOW, ctx.timeZone);
    const report = computeInsights(insightsInput(populatedDataset), {
      now: FIXTURE_NOW,
      timeZone: ctx.timeZone,
      weekStart: 1,
      range: rangeForPreset("90d", today),
    });
    expect(model.empty).toBeNull();
    expect(model.params.range).toBe("90d");
    expect(model.kpis.map((kpi) => kpi.id)).toEqual([
      "applications",
      "response",
      "interview",
      "offer",
      "firstResponse",
    ]);
    expect(model.kpis[0]?.value).toBe(String(report.applications));
    expect(model.funnel.steps.map((step) => step.reached)).toEqual(report.funnel.map((step) => step.reached));
    expect(model.funnel.title).toBe(
      `${report.responseRate.count} of ${report.applications} applications got a response`,
    );
    expect(model.weekly.weeks).toHaveLength(12);
    expect(model.csv.split("\n")[0]).toMatch(/^Range,/u);
  });

  it("drills every funnel step into the Tracker table with the same ids", () => {
    const model = buildInsightsModel(populatedDataset, ctx, { range: "all" });
    for (const step of model.funnel.steps) {
      expect(step.drill.view).toBe("table");
      expect(step.drill.stage).toBe(step.stage);
      const ids = selectDrillDownIds(
        insightsInput(populatedDataset),
        {
          stage: step.stage,
          ...(step.drill.from ? { from: step.drill.from } : {}),
          ...(step.drill.to ? { to: step.drill.to } : {}),
        },
        { now: FIXTURE_NOW, timeZone: ctx.timeZone },
      );
      expect(ids).toHaveLength(step.reached);
    }
  });

  it("labels sources, channels and CVs", () => {
    const model = buildInsightsModel(populatedDataset, ctx, { range: "all" });
    expect(model.breakdown.rows.length).toBeGreaterThan(1);
    expect(
      model.breakdown.rows.every(
        (row) => (row.label.length > 0 && row.label !== row.key) || row.key === row.label,
      ),
    ).toBe(true);
    const cv = buildInsightsModel(populatedDataset, ctx, { range: "all", by: "cv" });
    expect(cv.breakdown.rows.map((row) => row.label)).not.toContain("cv-en");
    const market = model.filters.find((filter) => filter.dimension === "market");
    expect(market?.options.some((option) => option.label === "Türkiye" || option.label === "Turkey")).toBe(
      true,
    );
  });

  it("shows the first-use state without data and filters narrow the cohort", () => {
    expect(buildInsightsModel(emptyDataset, fixtureContext(emptyDataset), {}).empty).toBe("firstUse");
    const all = buildInsightsModel(populatedDataset, ctx, { range: "all" });
    const lever = buildInsightsModel(populatedDataset, ctx, { range: "all", source: "lever" });
    expect(Number(lever.kpis[0]?.value)).toBeLessThan(Number(all.kpis[0]?.value));
    expect(lever.filtersActive).toBe(true);
  });

  it("compares neutrally with the previous period", () => {
    const model = buildInsightsModel(populatedDataset, ctx, { range: "30d", compare: "1" });
    expect(model.kpis[0]?.delta).toMatch(/vs\. previous 30 days$/u);
  });

  it("round-trips params and picks the locale week start", () => {
    const params = readInsightsParams({
      range: "custom",
      from: "2026-08-01",
      to: "2026-09-30",
      cv: "cv-en",
      compare: "1",
      by: "channel",
    });
    expect(insightsSearch(params)).toEqual({
      range: "custom",
      from: "2026-08-01",
      to: "2026-09-30",
      cv: "cv-en",
      compare: "1",
      by: "channel",
    });
    expect(readInsightsParams({ range: "bogus" }).range).toBe("90d");
    expect(localeWeekStart("en-US")).toBe(7);
    expect(localeWeekStart("de-DE")).toBe(1);
    expect(localeWeekStart("tr-TR")).toBe(1);
  });
});

describe("drillDownLabel", () => {
  it("names the set, the dates and the filters", async () => {
    const { drillDownLabel } = await import("./drilldown");
    expect(
      drillDownLabel(ctx.intl, {
        stage: "interview",
        from: "2026-07-25",
        to: "2026-10-22",
        filters: { source: "greenhouse" },
      }),
    ).toBe("Reached interview · 25 Jul 2026 – 22 Oct 2026 · Greenhouse");
    expect(drillDownLabel(ctx.intl, { activity: "follow_up", from: "2026-10-12" })).toBe(
      "Follow-ups sent · since 12 Oct 2026",
    );
  });
});
