import { describe, expect, it } from "vitest";
import {
  activityWeeks,
  addMonths,
  civilDate,
  computeInsights,
  drillDownSearchParams,
  type InsightsDrillDown,
  type InsightsInput,
  type InsightsOptions,
  isCivilDate,
  isoWeekday,
  marketOf,
  medianDays,
  parseInsightsDrillDown,
  previousRange,
  rangeForPreset,
  selectDrillDownIds,
  startOfWeek,
} from "./index";
import { combine, DAY_MS, daysAgo, history, type HistorySpec, NOW } from "./test-histories";

const TZ = "Europe/Istanbul";
const options = (overrides: Partial<InsightsOptions> = {}): InsightsOptions => ({
  now: NOW,
  timeZone: TZ,
  weekStart: 1,
  range: { from: null, to: civilDate(NOW, TZ) },
  ...overrides,
});

const applied = (
  id: string,
  days: number,
  extra: Partial<HistorySpec> = {},
  steps: HistorySpec["steps"] = [],
) =>
  history({
    id,
    created: daysAgo(days + 1),
    steps: [{ to: "applied", at: daysAgo(days) }, ...steps],
    ...extra,
  });

describe("calendar", () => {
  it("converts instants to local dates", () => {
    expect(civilDate(new Date("2026-10-01T22:30:00Z"), "Europe/Istanbul")).toBe("2026-10-02");
    expect(civilDate(new Date("2026-10-01T22:30:00Z"), "America/New_York")).toBe("2026-10-01");
  });
  it("adds months with clamping", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2024-03-31", -1)).toBe("2024-02-29");
    expect(addMonths("2026-01-15", -12)).toBe("2025-01-15");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });
  it("knows weekdays and week starts", () => {
    expect(isoWeekday("2026-10-22")).toBe(4);
    expect(startOfWeek("2026-10-22", 1)).toBe("2026-10-19");
    expect(startOfWeek("2026-10-22", 7)).toBe("2026-10-18");
    expect(startOfWeek("2026-10-18", 7)).toBe("2026-10-18");
    expect(startOfWeek("2026-10-18", 1)).toBe("2026-10-12");
  });
  it("validates dates", () => {
    expect(isCivilDate("2026-02-29")).toBe(false);
    expect(isCivilDate("2024-02-29")).toBe(true);
    expect(isCivilDate("2026-1-01")).toBe(false);
  });
});

describe("ranges", () => {
  it("covers each preset inclusively", () => {
    expect(rangeForPreset("4w", "2026-10-22")).toEqual({ from: "2026-09-25", to: "2026-10-22" });
    expect(rangeForPreset("30d", "2026-10-22")).toEqual({ from: "2026-09-23", to: "2026-10-22" });
    expect(rangeForPreset("6m", "2026-08-31")).toEqual({ from: "2026-03-01", to: "2026-08-31" });
    expect(rangeForPreset("12m", "2026-10-22")).toEqual({ from: "2025-10-23", to: "2026-10-22" });
    expect(rangeForPreset("all", "2026-10-22")).toEqual({ from: null, to: "2026-10-22" });
  });
  it("finds the previous period", () => {
    expect(previousRange({ from: "2026-09-23", to: "2026-10-22" })).toEqual({
      from: "2026-08-24",
      to: "2026-09-22",
    });
    expect(previousRange({ from: null, to: "2026-10-22" })).toBeNull();
  });
});

describe("market", () => {
  it.each([
    ["Istanbul (hybrid)", "TR"],
    ["İstanbul (hibrit)", "TR"],
    ["München (hybrid)", "DE"],
    ["Dublin or remote (EU)", "IE"],
    ["Remote (Europe)", "remote"],
    ["Uzaktan", "remote"],
    ["Den Haag", "NL"],
    ["Ukraine", null],
    [null, null],
  ])("%s → %s", (location, market) => expect(marketOf(location)).toBe(market));
});

describe("computeInsights", () => {
  it("reports an empty account without fake zeros", () => {
    const report = computeInsights({ applications: [], events: [] }, options());
    expect(report.applications).toBe(0);
    expect(report.responseRate).toEqual({ count: 0, of: 0, value: null });
    expect(report.medianDaysToFirstResponse).toEqual({ n: 0, days: null });
    expect(report.weekly).toHaveLength(12);
    expect(report.weekly.at(-1)?.weekStart).toBe("2026-10-19");
    expect(report.breakdowns.source).toEqual([]);
  });

  it("counts status responses, not receipts, and measures their time", () => {
    const input = combine([
      applied("a", 10, {}, [
        { to: "acknowledged", at: daysAgo(10), actor: "rule" },
        { to: "screening", at: daysAgo(6) },
      ]),
      applied("b", 9, {}, [{ to: "acknowledged", at: daysAgo(9), actor: "rule" }]),
    ]);
    const report = computeInsights(input, options());
    expect(report.responseRate).toEqual({ count: 1, of: 2, value: null });
    expect(report.funnel[1]?.daysFromPrevious).toEqual({ n: 1, days: null });
    expect(report.stillWaiting).toBe(1);
  });

  it("ignores undone moves", () => {
    const input = combine([
      applied("a", 10, {}, [
        { to: "screening", at: daysAgo(5) },
        { undo: 2, at: daysAgo(5) },
      ]),
    ]);
    const report = computeInsights(input, options());
    expect(report.applications).toBe(1);
    expect(report.responseRate.count).toBe(0);
  });

  it("drops applications whose Applied move was undone", () => {
    const input = combine([applied("a", 10, {}, [{ undo: 1, at: daysAgo(9) }])]);
    expect(computeInsights(input, options()).applications).toBe(0);
  });

  it("counts human replies through the linked mail category", () => {
    const input: InsightsInput = {
      ...combine([
        applied("reply", 10, {}, [{ mail: "received", at: daysAgo(7), messageId: "m1" }]),
        applied("receipt", 10, {}, [{ mail: "received", at: daysAgo(10), messageId: "m2" }]),
        applied("unlinked", 10, {}, [{ mail: "received", at: daysAgo(8) }]),
        applied("early", 10, {}, [{ mail: "received", at: daysAgo(10.5), messageId: "m3" }]),
      ]),
      mailCategories: { m1: "info_request", m2: "application_received", m3: "interview_invite" },
    };
    const ids = selectDrillDownIds(input, { stage: "responded" }, { now: NOW, timeZone: TZ });
    expect(ids).toEqual(["reply"]);
  });

  it("takes the earlier of a reply email and a status move", () => {
    const input: InsightsInput = {
      ...combine(
        ["a", "b", "c", "d", "e"].map((id) =>
          applied(id, 20, {}, [
            { mail: "received", at: daysAgo(17), messageId: `m-${id}` },
            { to: "screening", at: daysAgo(12) },
          ]),
        ),
      ),
      mailCategories: Object.fromEntries(
        ["a", "b", "c", "d", "e"].map((id) => [`m-${id}`, "assessment" as const]),
      ),
    };
    expect(computeInsights(input, options()).medianDaysToFirstResponse).toEqual({ n: 5, days: 3 });
  });

  it("treats a logged-later stage as reached with an unknown time", () => {
    const imported = history({
      id: "imp",
      created: daysAgo(1),
      initial: "interviewing",
      appliedAt: daysAgo(30),
    });
    const oneMove = history({
      id: "jump",
      created: daysAgo(5),
      steps: [{ to: "interviewing", at: daysAgo(4) }],
    });
    const report = computeInsights(combine([imported, oneMove]), options());
    expect(report.funnel.map((step) => step.reached)).toEqual([2, 2, 2, 0]);
    expect(report.medianDaysToFirstResponse.n).toBe(0);
    expect(
      selectDrillDownIds(
        combine([imported]),
        { stage: "applied", from: "2026-09-22", to: "2026-09-22" },
        { now: NOW, timeZone: TZ },
      ),
    ).toEqual(["imp"]);
  });

  it("counts a closed application logged with its applied date", () => {
    const closed = history({ id: "x", created: daysAgo(1), initial: "rejected", appliedAt: daysAgo(20) });
    const never = history({ id: "y", created: daysAgo(1), initial: "rejected" });
    const report = computeInsights(combine([closed, never]), options());
    expect(report.applications).toBe(1);
    expect(report.responseRate.count).toBe(1);
  });

  it("keeps the funnel monotonic when a stage is skipped", () => {
    const input = combine([applied("a", 10, {}, [{ to: "offer", at: daysAgo(2) }])]);
    const report = computeInsights(input, options());
    expect(report.funnel.map((step) => step.reached)).toEqual([1, 1, 1, 1]);
  });

  it("separates rejections, no response and withdrawn", () => {
    const input = combine([
      applied("rej", 30, {}, [{ to: "rejected", at: daysAgo(20), actor: "ai" }]),
      applied("gho", 30, {}, [{ to: "ghosted", at: daysAgo(5) }]),
      applied("wd", 30, {}, [{ to: "withdrawn", at: daysAgo(5) }]),
      applied("wait", 3),
    ]);
    const report = computeInsights(input, options());
    expect(report.responseRate.count).toBe(1);
    expect([report.stillWaiting, report.noResponse, report.withdrawn]).toEqual([1, 1, 1]);
  });

  it("suppresses rates below five and shows them from five", () => {
    const four = combine(
      [0, 1, 2, 3].map((index) =>
        applied(`a${index}`, 10 + index, {}, [{ to: "screening", at: daysAgo(5) }]),
      ),
    );
    expect(computeInsights(four, options()).responseRate.value).toBeNull();
    const five = combine(
      [0, 1, 2, 3, 4].map((index) =>
        applied(`a${index}`, 10 + index, {}, index < 2 ? [{ to: "screening", at: daysAgo(5) }] : []),
      ),
    );
    expect(computeInsights(five, options()).responseRate).toEqual({ count: 2, of: 5, value: 0.4 });
  });

  it("bounds the cohort by local applied date, inclusively", () => {
    // 21:30 UTC is 00:30 the next day in Istanbul.
    const late = history({
      id: "late",
      created: new Date("2026-10-01T10:00:00Z"),
      steps: [{ to: "applied", at: new Date("2026-10-01T21:30:00Z") }],
    });
    const edge = history({
      id: "edge",
      created: new Date("2026-10-01T10:00:00Z"),
      steps: [{ to: "applied", at: new Date("2026-10-01T20:30:00Z") }],
    });
    const input = combine([late, edge]);
    expect(
      computeInsights(input, options({ range: { from: "2026-10-02", to: "2026-10-22" } })).applications,
    ).toBe(1);
    expect(
      computeInsights(input, options({ range: { from: "2026-09-01", to: "2026-10-01" } })).applications,
    ).toBe(1);
  });

  it("breaks responses down by source, channel and CV, low samples last", () => {
    const rows = [
      ...[0, 1, 2, 3, 4].map((i) =>
        applied(
          `g${i}`,
          20 + i,
          { source: "greenhouse", channel: "external_link", cvId: "cv-en" },
          i < 3 ? [{ to: "screening", at: daysAgo(10) }] : [],
        ),
      ),
      ...[0, 1, 2, 3, 4, 5].map((i) =>
        applied(
          `l${i}`,
          20 + i,
          { source: "lever", channel: "email", cvId: "cv-en" },
          i < 1 ? [{ to: "rejected", at: daysAgo(10) }] : [],
        ),
      ),
      ...[0, 1].map((i) =>
        applied(`m${i}`, 20 + i, { channel: "referral", cvId: "cv-de" }, [
          { to: "screening", at: daysAgo(10) },
        ]),
      ),
    ];
    const report = computeInsights(combine(rows), options());
    expect(report.breakdowns.source.map((row) => [row.key, row.rate.value])).toEqual([
      ["greenhouse", 0.6],
      ["lever", 1 / 6],
      ["none", null],
    ]);
    expect(report.breakdowns.cv.map((row) => row.key)).toEqual(["cv-en", "cv-de"]);
    const filtered = computeInsights(combine(rows), options({ filters: { channel: "email" } }));
    expect(filtered.applications).toBe(6);
  });

  it("computes medians over odd and even samples", () => {
    expect(medianDays([5, 1, 3, 2, 4])).toEqual({ n: 5, days: 3 });
    expect(medianDays([1, 2, 3, 4, 5, 10])).toEqual({ n: 6, days: 3.5 });
    expect(medianDays([1, 2])).toEqual({ n: 2, days: null });
  });

  it("counts weekly activity by local week, follow-ups after the application mail, held interviews", () => {
    const a = applied("a", 3, {}, [
      { mail: "sent", at: new Date(daysAgo(3).getTime() + 60_000) },
      { mail: "sent", at: daysAgo(1) },
    ]);
    const b = applied("b", 10);
    const old = applied("old", 200);
    const input: InsightsInput = {
      ...combine([a, b, old]),
      interviews: [
        { id: "i1", applicationId: "b", startsAt: daysAgo(2) },
        { id: "i2", applicationId: "b", startsAt: new Date(NOW.getTime() + DAY_MS) },
        { id: "i3", applicationId: "gone", startsAt: daysAgo(2) },
      ],
    };
    const report = computeInsights(input, options());
    const current = report.weekly.at(-1);
    expect(current).toEqual({ weekStart: "2026-10-19", applied: 1, followUps: 1, interviews: 1 });
    expect(report.weekly.at(-2)).toEqual({
      weekStart: "2026-10-12",
      applied: 1,
      followUps: 0,
      interviews: 0,
    });
    expect(report.weekly.reduce((sum, week) => sum + week.applied, 0)).toBe(2);
    expect(activityWeeks("2026-10-22", 7)[11]).toBe("2026-10-18");
  });

  it("ignores events of applications that no longer exist", () => {
    const kept = applied("kept", 5);
    const gone = applied("gone", 5, {}, [{ to: "screening", at: daysAgo(1) }]);
    const report = computeInsights(
      { applications: [kept.application], events: [...kept.events, ...gone.events] },
      options(),
    );
    expect(report.applications).toBe(1);
    expect(report.responseRate.count).toBe(0);
  });
});

describe("drill-downs", () => {
  it("round-trips through search params", () => {
    const drill: InsightsDrillDown = {
      stage: "interview",
      from: "2026-07-24",
      to: "2026-10-22",
      filters: { source: "greenhouse", cv: "cv-en" },
    };
    const params = drillDownSearchParams(drill);
    expect(params).toEqual({
      stage: "interview",
      from: "2026-07-24",
      to: "2026-10-22",
      source: "greenhouse",
      cv: "cv-en",
    });
    expect(parseInsightsDrillDown({ view: "table", ...params })).toEqual(drill);
    expect(parseInsightsDrillDown({ view: "table", status: "applied" })).toBeNull();
    expect(parseInsightsDrillDown({ stage: "bogus", activity: "follow_up", from: "2026-13-01" })).toEqual({
      activity: "follow_up",
    });
  });

  it("selects exactly what the report counts", () => {
    const input = combine([
      applied("a", 10, { source: "lever" }, [
        { to: "screening", at: daysAgo(6) },
        { to: "interviewing", at: daysAgo(3) },
      ]),
      applied("b", 12, { source: "lever" }, [{ to: "rejected", at: daysAgo(2) }]),
      applied("c", 40, { source: "lever" }),
      applied("d", 11, { source: "greenhouse" }),
    ]);
    const range = rangeForPreset("30d", civilDate(NOW, TZ));
    const report = computeInsights(input, options({ range }));
    const ctx = { now: NOW, timeZone: TZ };
    const bounds = { from: range.from ?? undefined, to: range.to };
    for (const step of report.funnel) {
      expect(
        selectDrillDownIds(input, { stage: step.stage, from: bounds.from as string, to: bounds.to }, ctx),
      ).toHaveLength(step.reached);
    }
    expect(
      selectDrillDownIds(input, { stage: "waiting", from: bounds.from as string, to: bounds.to }, ctx),
    ).toEqual(["d"]);
    expect(
      selectDrillDownIds(
        input,
        { stage: "responded", from: bounds.from as string, filters: { source: "lever" } },
        ctx,
      ),
    ).toEqual(["a", "b"]);
    const week = report.weekly.at(-3);
    expect(week).toMatchObject({ weekStart: "2026-10-05", applied: 2 });
    expect(
      selectDrillDownIds(input, { activity: "applied", from: "2026-10-05", to: "2026-10-11" }, ctx),
    ).toEqual(["b", "d"]);
  });
});
