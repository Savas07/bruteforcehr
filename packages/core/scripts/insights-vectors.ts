/**
 * Conformance vectors for ports of the Insights metrics (packages/swift/BFHRCore). Expected values
 * come from running the TypeScript implementation; the vectors only choose inputs. Dates serialize
 * as ISO-8601 (`Date.toJSON`).
 */
import {
  addDays,
  addMonths,
  civilDate,
  computeInsights,
  drillDownSearchParams,
  foldLocation,
  INSIGHTS_RANGE_PRESETS,
  type InsightsDrillDown,
  type InsightsInput,
  type InsightsOptions,
  isCivilDate,
  isoWeekday,
  MARKET_KEYWORDS,
  MARKET_ORDER,
  marketOf,
  type MailCategory,
  parseInsightsDrillDown,
  previousRange,
  rangeForPreset,
  REMOTE_KEYWORDS,
  selectDrillDownIds,
  startOfWeek,
} from "../src/index";
import {
  combine,
  DAY_MS,
  daysAgo,
  history,
  type History,
  type HistorySpec,
  type HistoryStep,
  NOW,
} from "../src/insights/test-histories";

/** Bumped when the vector file layout changes (not when the expected values change). */
export const INSIGHTS_VECTORS_FORMAT = 1;

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

/** Deterministic PRNG (mulberry32), so the generated dataset never changes between runs. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const SOURCES = ["greenhouse", "lever", "ashby", "workable", null];
const CHANNELS = ["external_link", "email", "referral", "recruiter", null] as const;
const CVS = ["cv-en", "cv-de", "cv-en-tailored", null];
const LOCATIONS = [
  "Istanbul (hybrid)",
  "Berlin (hybrid)",
  "Amsterdam",
  "Remote (Europe)",
  "London (on-site)",
  "Lisbon",
  null,
];
const MAIL: MailCategory[] = [
  "info_request",
  "application_received",
  "interview_invite",
  "recruiter_outreach",
  "rejection",
];

/** ~80 applications over a year with every kind of history. */
function generated(): InsightsInput {
  const next = random(20261022);
  const pick = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)] as T;
  const histories: History[] = [];
  const mailCategories: Record<string, MailCategory> = {};
  const interviews: { id: string; applicationId: string; startsAt: Date }[] = [];
  for (let index = 0; index < 80; index += 1) {
    const id = `g${String(index).padStart(2, "0")}`;
    const start = Math.floor(next() * 360) + 2;
    const extra: Partial<HistorySpec> = {
      source: pick(SOURCES),
      channel: pick(CHANNELS),
      cvId: pick(CVS),
      location: pick(LOCATIONS),
    };
    const roll = next();
    if (roll < 0.08) {
      histories.push(history({ id, created: daysAgo(start + 1), ...extra }));
      continue;
    }
    if (roll < 0.14) {
      histories.push(
        history({
          id,
          created: daysAgo(Math.max(1, start - 30)),
          initial: pick(["applied", "interviewing", "rejected", "offer"] as const),
          appliedAt: daysAgo(start),
          ...extra,
        }),
      );
      continue;
    }
    let day = start;
    const later = (max: number) => {
      day = Math.max(0.01, day - (next() * max + 0.2));
      return daysAgo(day);
    };
    const steps: HistoryStep[] = [];
    if (next() < 0.5) steps.push({ to: "acknowledged", at: daysAgo(day - 0.05), actor: "rule" });
    if (next() < 0.3) steps.push({ mail: "sent", at: daysAgo(day - 0.01) });
    if (next() < 0.25) steps.push({ mail: "sent", at: later(9) });
    if (next() < 0.3) {
      const messageId = `${id}-mail`;
      mailCategories[messageId] = pick(MAIL);
      steps.push({ mail: "received", at: later(12), messageId });
    }
    const fate = next();
    if (fate < 0.45) {
      steps.push({ to: "screening", at: later(15) });
      if (next() < 0.15) steps.push({ undo: steps.length + 1, at: later(1) });
      else if (next() < 0.6) {
        steps.push({ to: "interviewing", at: later(10), actor: next() < 0.5 ? "ai" : "user" });
        interviews.push({ id: `${id}-i1`, applicationId: id, startsAt: later(5) });
        if (next() < 0.4) steps.push({ to: "offer", at: later(14) });
        else if (next() < 0.5) steps.push({ to: "rejected", at: later(10) });
      }
    } else if (fate < 0.65) steps.push({ to: "rejected", at: later(20), actor: "rule" });
    else if (fate < 0.75) steps.push({ to: "ghosted", at: later(30) });
    else if (fate < 0.8) steps.push({ to: "withdrawn", at: later(10) });
    histories.push(
      applied(
        id,
        start,
        extra,
        steps.filter((step) => step.at.getTime() <= NOW.getTime()),
      ),
    );
  }
  // An interview scheduled for tomorrow is not held yet; one of a deleted application is ignored.
  interviews.push({ id: "future", applicationId: "g05", startsAt: new Date(NOW.getTime() + DAY_MS) });
  interviews.push({ id: "orphan", applicationId: "deleted", startsAt: daysAgo(3) });
  return { ...combine(histories), interviews, mailCategories };
}

/** The edge cases of src/insights/insights.test.ts as one small dataset. */
function edges(): InsightsInput {
  const histories = [
    applied("ack-then-screen", 10, { source: "lever" }, [
      { to: "acknowledged", at: daysAgo(10), actor: "rule" },
      { to: "screening", at: daysAgo(6) },
    ]),
    applied("undone", 12, {}, [
      { to: "screening", at: daysAgo(5) },
      { undo: 2, at: daysAgo(5) },
    ]),
    applied("applied-undone", 9, {}, [{ undo: 1, at: daysAgo(8) }]),
    applied("reply", 14, { channel: "email" }, [{ mail: "received", at: daysAgo(11), messageId: "m-info" }]),
    applied("receipt", 14, {}, [{ mail: "received", at: daysAgo(14), messageId: "m-receipt" }]),
    applied("early-mail", 14, {}, [{ mail: "received", at: daysAgo(14.5), messageId: "m-invite" }]),
    history({
      id: "imported",
      created: daysAgo(1),
      initial: "interviewing",
      appliedAt: daysAgo(30),
      location: "München",
    }),
    history({ id: "one-move", created: daysAgo(5), steps: [{ to: "interviewing", at: daysAgo(4) }] }),
    history({ id: "closed-logged", created: daysAgo(2), initial: "rejected", appliedAt: daysAgo(40) }),
    history({ id: "closed-never", created: daysAgo(2), initial: "rejected" }),
    applied("skip-to-offer", 20, { cvId: "cv-en" }, [{ to: "offer", at: daysAgo(2) }]),
    applied("ghosted", 30, {}, [{ to: "ghosted", at: daysAgo(5) }]),
    applied("withdrawn", 30, {}, [{ to: "withdrawn", at: daysAgo(5) }]),
    history({
      id: "midnight",
      created: new Date("2026-10-01T10:00:00Z"),
      steps: [{ to: "applied", at: new Date("2026-10-01T21:30:00Z") }],
    }),
    applied("follow-ups", 3, {}, [
      { mail: "sent", at: new Date(daysAgo(3).getTime() + 60_000) },
      { mail: "sent", at: daysAgo(1) },
    ]),
  ];
  const gone = applied("gone", 5, {}, [{ to: "screening", at: daysAgo(1) }]);
  return {
    applications: histories.map((entry) => entry.application),
    events: [...histories.flatMap((entry) => entry.events), ...gone.events],
    interviews: [{ id: "i-held", applicationId: "skip-to-offer", startsAt: daysAgo(4) }],
    mailCategories: {
      "m-info": "info_request",
      "m-receipt": "application_received",
      "m-invite": "interview_invite",
    },
  };
}

const ZONES = ["Europe/Istanbul", "Europe/Berlin", "America/New_York", "UTC", "Pacific/Auckland"];

export function buildInsightsVectors() {
  const datasets = { generated: generated(), edges: edges(), empty: { applications: [], events: [] } };
  const reports: {
    name: string;
    dataset: keyof typeof datasets;
    options: InsightsOptions;
    expected: unknown;
  }[] = [];
  const drillDowns: {
    name: string;
    dataset: keyof typeof datasets;
    drill: InsightsDrillDown;
    now: Date;
    timeZone: string;
    expected: string[];
  }[] = [];

  for (const dataset of Object.keys(datasets) as (keyof typeof datasets)[]) {
    const input = datasets[dataset];
    for (const [timeZone, weekStart] of [
      ["Europe/Istanbul", 1],
      ["America/New_York", 7],
    ] as const) {
      const today = civilDate(NOW, timeZone);
      for (const preset of INSIGHTS_RANGE_PRESETS) {
        const range = rangeForPreset(preset, today);
        const options: InsightsOptions = { now: NOW, timeZone, weekStart, range };
        reports.push({
          name: `${dataset} ${timeZone} ${preset}`,
          dataset,
          options,
          expected: computeInsights(input, options),
        });
      }
      const filtered: InsightsOptions[] = [
        {
          now: NOW,
          timeZone,
          weekStart,
          range: rangeForPreset("12m", today),
          filters: { source: "greenhouse" },
        },
        {
          now: NOW,
          timeZone,
          weekStart,
          range: rangeForPreset("all", today),
          filters: { channel: "none", market: "TR" },
        },
        {
          now: NOW,
          timeZone,
          weekStart,
          range: { from: "2026-10-02", to: "2026-10-22" },
          filters: { cv: "cv-en" },
        },
        { now: NOW, timeZone, weekStart, range: { from: "2026-09-01", to: "2026-10-01" } },
      ];
      filtered.forEach((options, index) =>
        reports.push({
          name: `${dataset} ${timeZone} custom ${index}`,
          dataset,
          options,
          expected: computeInsights(input, options),
        }),
      );

      const range = rangeForPreset("90d", today);
      const drills: InsightsDrillDown[] = [
        ...(
          ["applied", "responded", "interview", "offer", "waiting", "no_response", "withdrawn"] as const
        ).map((stage): InsightsDrillDown => ({ stage, from: range.from ?? "", to: range.to })),
        { stage: "responded" },
        { stage: "applied", filters: { source: "lever" } },
        { stage: "responded", from: "2026-01-01", filters: { cv: "cv-de", market: "remote" } },
        { activity: "applied", from: "2026-10-05", to: "2026-10-11" },
        { activity: "follow_up", from: addDays(today, -83) },
        { activity: "interview", from: addDays(today, -83), to: today },
      ];
      drills.forEach((drill, index) =>
        drillDowns.push({
          name: `${dataset} ${timeZone} drill ${index}`,
          dataset,
          drill,
          now: NOW,
          timeZone,
          expected: selectDrillDownIds(input, drill, { now: NOW, timeZone }),
        }),
      );
    }
  }

  const instants = Array.from(
    { length: 24 },
    (_, index) => new Date(Date.UTC(2026, index % 12, 1 + index, (index * 7) % 24, 30)),
  );
  const dates = [
    "2026-01-01",
    "2026-02-28",
    "2024-02-29",
    "2026-03-29",
    "2026-08-31",
    "2026-10-22",
    "2026-12-31",
    "2000-01-01",
  ];
  const params: Record<string, string>[] = [
    { view: "table", stage: "interview", from: "2026-07-24", to: "2026-10-22", source: "greenhouse" },
    { stage: "bogus", activity: "follow_up", from: "2026-13-01", to: "2026-02-30" },
    { status: "applied" },
    { stage: "waiting", channel: "", cv: "cv-en", market: "remote" },
    { activity: "interview", stage: "offer" },
  ];

  return {
    format: INSIGHTS_VECTORS_FORMAT,
    now: NOW,
    calendar: {
      civilDate: ZONES.flatMap((timeZone) =>
        instants.map((instant) => ({ instant, timeZone, date: civilDate(instant, timeZone) })),
      ),
      isCivilDate: ["2026-02-29", "2024-02-29", "2026-1-01", "2026-12-31", "2026-00-10", "abcd-ef-gh"].map(
        (value) => ({
          value,
          valid: isCivilDate(value),
        }),
      ),
      dates: dates.map((date) => ({
        date,
        isoWeekday: isoWeekday(date),
        startOfWeekMonday: startOfWeek(date, 1),
        startOfWeekSunday: startOfWeek(date, 7),
        addDays: [-400, -84, -1, 1, 365].map((days) => ({ days, date: addDays(date, days) })),
        addMonths: [-12, -6, -1, 1, 13].map((months) => ({ months, date: addMonths(date, months) })),
        presets: INSIGHTS_RANGE_PRESETS.map((preset) => {
          const range = rangeForPreset(preset, date);
          return { preset, range, previous: previousRange(range) };
        }),
      })),
    },
    market: {
      order: MARKET_ORDER,
      keywords: MARKET_KEYWORDS,
      remote: REMOTE_KEYWORDS,
      cases: [
        "Istanbul (hybrid)",
        "İstanbul (hibrit)",
        "Kervan Teknoloji, Caferağa Mah. Moda Cad. 112, Kadıköy, İstanbul",
        "München (hybrid)",
        "Düsseldorf",
        "Dublin or remote (EU)",
        "Remote (Europe)",
        "Remote — US",
        "Uzaktan çalışma",
        "Den Haag",
        "Ukraine",
        "Zürich",
        "  ",
        "",
      ].map((location) => ({ location, folded: foldLocation(location), market: marketOf(location) })),
    },
    datasets,
    reports,
    drillDowns,
    parse: params.map((input) => {
      const drill = parseInsightsDrillDown(input);
      return {
        params: input,
        expected: drill,
        searchParams: drill === null ? null : drillDownSearchParams(drill),
      };
    }),
  };
}
