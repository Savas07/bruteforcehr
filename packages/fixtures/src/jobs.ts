import {
  type DismissReason,
  type EmploymentType,
  type Job,
  type JobMatch,
  type JobMatchState,
  type JobSourceLink,
  jobSourceKey,
  type MatchFactor,
  type RemoteType,
  type SalaryRange,
  type SavedSearch,
  type Seniority,
} from "@bfhr/core";
import { profile } from "./persona";
import { daysAgo } from "./time";

/* ------------------------------------------------------------------------------------------------
 * Compact job rows → full Job + JobMatch documents. Match factors are derived from the persona
 * (skills, target cities, salary floor, work authorization) so reasons and gaps stay coherent.
 * ---------------------------------------------------------------------------------------------- */

type Salary = readonly [
  min: number | null,
  max: number | null,
  currency: string,
  period?: SalaryRange["period"],
];

interface SourceRow {
  readonly source: string;
  readonly sourceId: string | null;
  readonly url: string;
  /** Days ago first seen at this source (defaults to the job's posted day). */
  readonly seen?: number;
  /** This source shows a different salary. */
  readonly salary?: Salary;
  /** This source words the title differently. */
  readonly title?: string;
  readonly locationText?: string;
}

interface JobRow {
  readonly id: string;
  readonly company: string;
  readonly domain: string | null;
  readonly title: string;
  readonly city: string | null;
  readonly country: string | null;
  readonly locationLabel: string;
  readonly remote: RemoteType | null;
  readonly eligibility?: string;
  /** Remote role the persona can take from Türkiye. Defaults to true for remote roles. */
  readonly remoteFromTurkey?: boolean;
  readonly seniority: Seniority | null;
  readonly employment?: EmploymentType;
  readonly salary?: Salary;
  readonly visa: boolean | null;
  readonly relocation: boolean | null;
  readonly language: "en" | "de" | "tr";
  readonly skills: readonly string[];
  readonly posted: number;
  readonly sources: readonly SourceRow[];
  readonly applyEmail?: string;
  readonly blurb: string;
  readonly score: number;
  readonly state?: JobMatchState;
  readonly dismissReasons?: readonly DismissReason[];
  /** Days ago the listing was last seen (closed postings stop being refreshed). */
  readonly lastSeen?: number;
}

const DIRECT_SOURCES = new Set([
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "recruitee",
  "smartrecruiters",
  "web",
]);

const SKILL_LABELS: Record<string, string> = {
  react: "React",
  typescript: "TypeScript",
  javascript: "JavaScript",
  "next.js": "Next.js",
  "react native": "React Native",
  "node.js": "Node.js",
  graphql: "GraphQL",
  css: "CSS",
  "tailwind css": "Tailwind CSS",
  "design systems": "design systems",
  accessibility: "accessibility",
  storybook: "Storybook",
  jest: "Jest",
  playwright: "Playwright",
  figma: "Figma",
  "web performance": "web performance",
  i18n: "internationalization",
  vite: "Vite",
  redux: "Redux",
  "a/b testing": "A/B testing",
  vue: "Vue.js",
  angular: "Angular",
  svelte: "Svelte",
  webgl: "WebGL",
  "three.js": "three.js",
  d3: "D3.js",
  python: "Python",
  go: "Go",
  aws: "AWS",
  kotlin: "Kotlin",
  swift: "Swift",
  unity: "Unity",
  "c#": "C#",
  rxjs: "RxJS",
  sql: "SQL",
  "ruby on rails": "Ruby on Rails",
  flutter: "Flutter",
  cypress: "Cypress",
  "micro-frontends": "micro-frontends",
  elixir: "Elixir",
};

const label = (skill: string) => SKILL_LABELS[skill] ?? skill;
const TARGET_CITIES = new Set(
  profile.locations.map((location) => location.city).filter((city) => city !== null),
);

/** Rough yearly EUR conversion for comparing against the persona's €55k floor. */
const EUR_PER_UNIT: Record<string, number> = { EUR: 1, GBP: 1.16, USD: 0.92, TRY: 0.026 };
const PERIODS_PER_YEAR: Record<SalaryRange["period"], number> = { year: 1, month: 12, day: 220, hour: 1_760 };

function salaryRange([min, max, currency, period = "year"]: Salary, estimated = false): SalaryRange {
  return { min, max, currency, period, estimated };
}

function formatMoney(amount: number, currency: string): string {
  const symbol: Record<string, string> = { EUR: "€", GBP: "£", USD: "$", TRY: "₺" };
  return amount >= 1_000_000
    ? `${symbol[currency] ?? currency}${(amount / 1_000_000).toFixed(1)}M`
    : `${symbol[currency] ?? currency}${Math.round(amount / 1_000)}k`;
}

function describe(row: JobRow): string {
  const skills = row.skills.map(label);
  const main = skills.slice(0, 3).join(", ");
  const rest = skills.slice(3).join(", ");
  const where = row.remote === "remote" ? `Remote — ${row.eligibility ?? "worldwide"}` : row.locationLabel;
  if (row.language === "de") {
    return [
      row.blurb,
      "Deine Aufgaben\n• Du entwickelst neue Produktfunktionen gemeinsam mit Design und Produktmanagement.\n• Du verbesserst Performance, Barrierefreiheit und Testabdeckung unserer Weboberflächen.\n• Du teilst Wissen im Team und gestaltest unsere Frontend-Architektur mit.",
      `Dein Profil\n• Mehrjährige Erfahrung mit ${main}.${rest ? `\n• Kenntnisse in ${rest} sind ein Plus.` : ""}\n• Sehr gute Deutschkenntnisse (mindestens B2) und gute Englischkenntnisse.`,
      `Standort: ${where}`,
    ].join("\n\n");
  }
  if (row.language === "tr") {
    return [
      row.blurb,
      "Neler yapacaksın\n• Tasarım ve ürün ekipleriyle birlikte yeni ürün özellikleri geliştireceksin.\n• Web arayüzlerimizin performansını, erişilebilirliğini ve test kapsamını iyileştireceksin.\n• Frontend mimarimizin gelişimine katkı sağlayacaksın.",
      `Aradığımız nitelikler\n• ${main} ile en az 3 yıl deneyim.${rest ? `\n• ${rest} bilgisi artı.` : ""}\n• İyi derecede İngilizce.`,
      `Lokasyon: ${where}`,
    ].join("\n\n");
  }
  return [
    row.blurb,
    "What you'll do\n• Build product features end to end with design and product.\n• Improve the performance, accessibility and test coverage of our web apps.\n• Help shape our frontend architecture and review your teammates' work.",
    `What we're looking for\n• Solid experience with ${main}.${rest ? `\n• Experience with ${rest} is a plus.` : ""}\n• Clear written communication in English.`,
    `Location: ${where}${row.visa ? "\nWe sponsor visas and help with relocation." : ""}`,
  ].join("\n\n");
}

function factor(
  kind: MatchFactor["kind"],
  facet: MatchFactor["facet"],
  text: string,
  status: MatchFactor["status"],
  impact: MatchFactor["impact"],
  evidence: MatchFactor["evidence"],
): MatchFactor {
  return { kind, facet, label: text, status, impact, evidence, source: "rule" };
}

function matchFor(row: JobRow, job: Job): JobMatch {
  const reasons: MatchFactor[] = [];
  const gaps: MatchFactor[] = [];
  const add = (item: MatchFactor) =>
    (["missing", "outside_prefs"].includes(item.status) ? gaps : reasons).push(item);
  const posting = (quote: string) => ({ from: "posting" as const, quote });

  // Location / remote.
  if (row.remote === "remote") {
    add(
      row.remoteFromTurkey === false
        ? factor(
            "requirement",
            "remote",
            `Remote for ${row.eligibility ?? "listed countries"}, which excludes Türkiye`,
            "outside_prefs",
            "most",
            posting(`Remote — ${row.eligibility ?? ""}`.trim()),
          )
        : factor(
            "requirement",
            "remote",
            "Remote role you can take from Türkiye",
            "met",
            "most",
            posting(`Remote — ${row.eligibility ?? "worldwide"}`),
          ),
    );
  } else if (row.city === "Istanbul") {
    add(
      factor(
        "requirement",
        "location",
        "Based in Istanbul, where you live",
        "met",
        "most",
        posting(row.locationLabel),
      ),
    );
  } else if (row.city !== null && TARGET_CITIES.has(row.city)) {
    add(
      factor(
        "requirement",
        "location",
        `${row.city} is one of your target cities`,
        "met",
        "most",
        posting(row.locationLabel),
      ),
    );
  } else {
    add(
      factor(
        "requirement",
        "location",
        `${row.city ?? row.locationLabel} isn't in your target locations`,
        "outside_prefs",
        "most",
        posting(row.locationLabel),
      ),
    );
  }

  // Work authorization (only relevant outside Türkiye).
  if (row.country !== "TR" && !(row.remote === "remote" && row.remoteFromTurkey !== false)) {
    if (row.visa === true)
      add(
        factor(
          "requirement",
          "authorization",
          "Visa sponsorship offered",
          "met",
          "most",
          posting("We sponsor visas and help with relocation."),
        ),
      );
    else if (row.visa === false)
      add(
        factor(
          "requirement",
          "authorization",
          "No visa sponsorship",
          "outside_prefs",
          "most",
          posting("Applicants must already have the right to work."),
        ),
      );
    else add(factor("requirement", "authorization", "Visa sponsorship", "not_stated", "most", null));
  }

  // Salary against the €55k floor.
  if (row.salary === undefined) {
    add(factor("requirement", "salary", "Salary", "not_stated", "some", null));
  } else {
    const [min, max, currency, period = "year"] = row.salary;
    const top = (max ?? min ?? 0) * (EUR_PER_UNIT[currency] ?? 1) * PERIODS_PER_YEAR[period];
    const range = `${min === null ? "" : formatMoney(min, currency)}${min !== null && max !== null ? "–" : ""}${max === null ? "" : formatMoney(max, currency)}`;
    add(
      top >= (profile.salaryFloor?.amount ?? 0)
        ? factor(
            "requirement",
            "salary",
            `Pays ${range} per ${period}, above your floor`,
            "met",
            "some",
            posting(range),
          )
        : factor(
            "requirement",
            "salary",
            `Top of the range (${range}) is below your €55k floor`,
            "outside_prefs",
            "some",
            posting(range),
          ),
    );
  }

  // Seniority.
  if (row.seniority === "mid")
    add(
      factor(
        "requirement",
        "seniority",
        "Mid-level role, like your current one",
        "met",
        "some",
        posting("3+ years of experience"),
      ),
    );
  else if (row.seniority === "senior")
    add(
      factor(
        "requirement",
        "seniority",
        "Asks for senior experience; you have 5 years",
        "partial",
        "some",
        posting("5+ years of experience"),
      ),
    );

  // Language.
  if (row.language === "de") {
    add(
      factor(
        "requirement",
        "language",
        "German at B2 or above; your CV lists A2",
        "missing",
        "most",
        posting("Sehr gute Deutschkenntnisse (mindestens B2)"),
      ),
    );
  }

  // Skills.
  const matched = row.skills.filter((skill) => profile.skills.includes(skill));
  const unmatched = row.skills.filter((skill) => !profile.skills.includes(skill));
  if (matched.length > 0) {
    add(
      factor(
        "skill",
        null,
        `${matched.length} of ${row.skills.length} skills match: ${matched.slice(0, 3).map(label).join(", ")}`,
        matched.length * 2 >= row.skills.length ? "met" : "partial",
        "most",
        { from: "cv", quote: "React + TypeScript, Storybook, Playwright" },
      ),
    );
  }
  if (matched.includes("design systems")) {
    add(
      factor("experience", null, "Design-system work matches your rebuild at Pazarbox", "met", "some", {
        from: "cv",
        quote: "Led the rebuild of the design system (62 components)",
      }),
    );
  }
  for (const skill of unmatched.slice(0, 3))
    add(factor("skill", null, label(skill), "missing", "some", posting(label(skill))));

  const strong = row.score >= 80;
  const cv =
    row.language === "de"
      ? { basedOnCvId: "cv-de", basedOnCvRevisionId: "rev-de-2" }
      : { basedOnCvId: "cv-en", basedOnCvRevisionId: "rev-en-3" };
  const state = row.state ?? "new";
  return {
    id: job.id,
    score: row.score,
    ...cv,
    reasons,
    gaps,
    skills: { matched: [...matched], unmatched: [...unmatched] },
    rationale: strong
      ? `${job.title} at ${job.company} lines up with your React and TypeScript product work and the design-system rebuild you led at Pazarbox. ${gaps.length === 0 ? "Nothing important is missing." : `Worth checking: ${gaps.map((gap) => gap.label).join("; ")}.`}`
      : null,
    state,
    dismissReasons: state === "dismissed" ? [...(row.dismissReasons ?? [])] : [],
    stateChangedAt: state === "new" ? null : daysAgo(Math.max(row.posted - 1, 0.5)),
    computedAt: daysAgo(Math.min(row.posted, 0.3)),
  };
}

function build(row: JobRow): { job: Job; match: JobMatch } {
  const lastSeen = daysAgo(row.lastSeen ?? 0.2);
  const sources: JobSourceLink[] = row.sources.map((source) => ({
    source: source.source,
    sourceId: source.sourceId,
    url: source.url,
    applyUrl: DIRECT_SOURCES.has(source.source) ? source.url : null,
    applyEmail: null,
    isDirectFromEmployer: DIRECT_SOURCES.has(source.source),
    title: source.title ?? row.title,
    locationText: source.locationText ?? row.locationLabel,
    salary:
      (source.salary ?? row.salary) === undefined
        ? null
        : salaryRange((source.salary ?? row.salary) as Salary),
    postedAt: daysAgo(source.seen ?? row.posted),
    firstSeenAt: daysAgo(source.seen ?? row.posted, 2),
    lastSeenAt: lastSeen,
  }));
  const direct = sources.find((source) => source.isDirectFromEmployer);
  const job: Job = {
    id: row.id,
    sources,
    sourceKeys: sources.map(jobSourceKey),
    applyUrl: row.applyEmail === undefined ? (direct?.applyUrl ?? sources[0]?.url ?? null) : null,
    applyEmail: row.applyEmail ?? null,
    company: row.company,
    companyDomain: row.domain,
    title: row.title,
    locations:
      row.city === null && row.country === null
        ? []
        : [{ label: row.locationLabel, city: row.city, countryCode: row.country }],
    remoteType: row.remote,
    remoteEligibility: row.eligibility ?? null,
    employmentType: row.employment ?? "full_time",
    seniority: row.seniority,
    salary: row.salary === undefined ? null : salaryRange(row.salary),
    visaSponsorship: row.visa,
    relocationSupport: row.relocation,
    language: row.language,
    description: describe(row),
    skills: [...row.skills],
    postedAt: daysAgo(row.posted),
    expiresAt: null,
    fingerprint: `${row.company}|${row.title}|${row.city ?? "remote"}`
      .toLowerCase()
      .replace(/[^a-z0-9|]+/g, "-"),
    createdAt: daysAgo(row.posted, 2),
    updatedAt: lastSeen,
  };
  return { job, match: matchFor(row, job) };
}

/* ------------------------------------------------------------------------------------------------
 * 40 jobs: 24 behind tracker applications, 16 only in the feed (new / saved / dismissed).
 * ---------------------------------------------------------------------------------------------- */

const rows: JobRow[] = [
  // --- Jobs with applications -----------------------------------------------------------------
  {
    id: "job-lumenpay-frontend",
    company: "Lumenpay",
    domain: "lumenpay.com.tr",
    title: "Frontend Engineer, Merchant Dashboard",
    city: "Istanbul",
    country: "TR",
    locationLabel: "Istanbul (Maslak), hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [1_900_000, 2_400_000, "TRY"],
    visa: null,
    relocation: null,
    language: "en",
    skills: ["react", "typescript", "next.js", "design systems", "jest", "graphql"],
    posted: 46,
    sources: [
      {
        source: "greenhouse",
        sourceId: "7012448",
        url: "https://job-boards.greenhouse.io/lumenpay/jobs/7012448",
      },
      {
        source: "web",
        sourceId: null,
        url: "https://www.kariyer.net/is-ilani/lumenpay-frontend-engineer-3988121",
        seen: 44,
        salary: [150_000, 190_000, "TRY", "month"],
      },
    ],
    blurb: "Lumenpay builds payment and invoicing tools for 60,000 Turkish merchants.",
    score: 91,
    state: "saved",
    lastSeen: 30,
  },
  {
    id: "job-kervan-product",
    company: "Kervan Teknoloji",
    domain: "kervan.tech",
    title: "Product Engineer (Frontend)",
    city: "Istanbul",
    country: "TR",
    locationLabel: "Istanbul (Kadıköy), hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [1_700_000, 2_200_000, "TRY"],
    visa: null,
    relocation: null,
    language: "tr",
    skills: ["react", "typescript", "node.js", "a/b testing", "figma"],
    posted: 30,
    sources: [
      {
        source: "workable",
        sourceId: "4A1C9E2B7F",
        url: "https://apply.workable.com/kervan-teknoloji/j/4A1C9E2B7F/",
      },
    ],
    blurb:
      "Kervan Teknoloji, Türkiye genelinde 2.000'den fazla nakliye firmasını yükle buluşturan bir lojistik platformu.",
    score: 87,
    state: "saved",
  },
  {
    id: "job-thames-frontend",
    company: "Thames Ledger",
    domain: "thamesledger.co.uk",
    title: "Frontend Engineer, Invoicing",
    city: "London",
    country: "GB",
    locationLabel: "London (Shoreditch), hybrid · 2 days in office",
    remote: "hybrid",
    seniority: "mid",
    salary: [60_000, 75_000, "GBP"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["react", "typescript", "redux", "accessibility", "playwright", "graphql"],
    posted: 24,
    sources: [
      {
        source: "lever",
        sourceId: "c3f1a7e2-5b9d-4c11-9e0f-2d7a8b6c4e19",
        url: "https://jobs.lever.co/thamesledger/c3f1a7e2-5b9d-4c11-9e0f-2d7a8b6c4e19",
      },
      {
        source: "reed",
        sourceId: "53120987",
        url: "https://www.reed.co.uk/jobs/frontend-engineer/53120987",
        seen: 22,
        salary: [65_000, 75_000, "GBP"],
        title: "Front End Engineer (React)",
      },
    ],
    blurb:
      "Thames Ledger is the accounting app 120,000 UK sole traders use to send invoices and file their taxes.",
    score: 89,
    state: "saved",
  },
  {
    id: "job-brightwave-frontend",
    company: "Brightwave",
    domain: "brightwave.io",
    title: "Frontend Engineer, Editor",
    city: null,
    country: null,
    locationLabel: "Remote",
    remote: "remote",
    eligibility: "Americas & Europe time zones (UTC−8 to UTC+3)",
    seniority: "mid",
    employment: "contract",
    salary: [120_000, 150_000, "USD"],
    visa: null,
    relocation: false,
    language: "en",
    skills: ["react", "typescript", "web performance", "storybook", "svelte"],
    posted: 21,
    sources: [
      {
        source: "ashby",
        sourceId: "9f2e6c1d-0a3b-4e5f-8d7c-6b5a4f3e2d1c",
        url: "https://jobs.ashbyhq.com/brightwave/9f2e6c1d-0a3b-4e5f-8d7c-6b5a4f3e2d1c",
      },
      {
        source: "remotive",
        sourceId: "1984455",
        url: "https://remotive.com/remote-jobs/software-dev/frontend-engineer-editor-1984455",
        seen: 20,
      },
    ],
    blurb:
      "Brightwave makes the collaborative slide editor used by 9,000 sales teams. We are fully remote across 14 countries.",
    score: 86,
    state: "saved",
  },
  {
    id: "job-grachten-frontend",
    company: "Grachten Commerce",
    domain: "grachten.nl",
    title: "Frontend Developer, Checkout",
    city: "Amsterdam",
    country: "NL",
    locationLabel: "Amsterdam, hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [58_000, 72_000, "EUR"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["react", "typescript", "web performance", "a/b testing", "cypress"],
    posted: 19,
    sources: [
      {
        source: "recruitee",
        sourceId: "frontend-developer-checkout",
        url: "https://grachten.recruitee.com/o/frontend-developer-checkout",
      },
    ],
    blurb: "Grachten Commerce runs the checkout for 1,400 Dutch and Belgian web shops.",
    score: 88,
    state: "saved",
  },
  {
    id: "job-kiez-frontend",
    company: "Kiez Health",
    domain: "kiezhealth.de",
    title: "Frontend Engineer (React)",
    city: "Berlin",
    country: "DE",
    locationLabel: "Berlin (Kreuzberg), hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [62_000, 72_000, "EUR"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["react", "typescript", "accessibility", "i18n", "react native"],
    posted: 52,
    sources: [
      {
        source: "ashby",
        sourceId: "1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081",
        url: "https://jobs.ashbyhq.com/kiezhealth/1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081",
      },
      {
        source: "arbeitnow",
        sourceId: "kiez-health-frontend-engineer-react-412233",
        url: "https://www.arbeitnow.com/jobs/companies/kiez-health/frontend-engineer-react-412233",
        seen: 50,
      },
    ],
    blurb: "Kiez Health helps 300 Berlin GP practices run online appointments and prescriptions.",
    score: 90,
    state: "saved",
    lastSeen: 20,
  },
  {
    id: "job-brisk-frontend",
    company: "Brisk Payments",
    domain: "briskpayments.eu",
    title: "Frontend Engineer",
    city: null,
    country: null,
    locationLabel: "Remote (Europe)",
    remote: "remote",
    eligibility: "Europe, including Türkiye (CET ±3 h)",
    seniority: "mid",
    salary: [55_000, 68_000, "EUR"],
    visa: null,
    relocation: false,
    language: "en",
    skills: ["react", "typescript", "next.js", "tailwind css", "playwright"],
    posted: 15,
    sources: [
      {
        source: "greenhouse",
        sourceId: "6633019",
        url: "https://job-boards.greenhouse.io/briskpayments/jobs/6633019",
      },
      {
        source: "remotive",
        sourceId: "1990112",
        url: "https://remotive.com/remote-jobs/software-dev/frontend-engineer-1990112",
        seen: 14,
      },
      {
        source: "arbeitnow",
        sourceId: "brisk-payments-frontend-engineer-418870",
        url: "https://www.arbeitnow.com/jobs/companies/brisk-payments/frontend-engineer-418870",
        seen: 13,
        salary: [60_000, 68_000, "EUR"],
      },
    ],
    blurb: "Brisk Payments gives European marketplaces instant payouts in 28 currencies.",
    score: 92,
    state: "saved",
  },
  {
    id: "job-ada-frontend",
    company: "Ada Sigorta Teknoloji",
    domain: "adasigorta.com.tr",
    title: "Frontend Geliştirici",
    city: "Istanbul",
    country: "TR",
    locationLabel: "İstanbul (Ataşehir), hibrit",
    remote: "hybrid",
    seniority: "mid",
    visa: null,
    relocation: null,
    language: "tr",
    skills: ["react", "typescript", "redux", "jest", "angular"],
    posted: 12,
    sources: [
      { source: "web", sourceId: null, url: "https://kariyer.adasigorta.com.tr/ilan/frontend-gelistirici" },
    ],
    blurb:
      "Ada Sigorta Teknoloji, 3 milyon poliçe sahibine hizmet veren dijital sigorta platformunu geliştiriyor.",
    score: 74,
    state: "saved",
  },
  {
    id: "job-nordlicht-frontend",
    company: "Nordlicht Mobility",
    domain: "nordlicht-mobility.de",
    title: "Frontend Engineer, Rider App (Web)",
    city: "Berlin",
    country: "DE",
    locationLabel: "Berlin (Friedrichshain), hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [58_000, 70_000, "EUR"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["react", "typescript", "react native", "web performance", "graphql", "kotlin"],
    posted: 18,
    sources: [
      {
        source: "smartrecruiters",
        sourceId: "744000099812345",
        url: "https://jobs.smartrecruiters.com/NordlichtMobility/744000099812345-frontend-engineer-rider-app-web-",
      },
      { source: "adzuna", sourceId: "4987712345", url: "https://www.adzuna.de/details/4987712345", seen: 16 },
    ],
    blurb: "Nordlicht Mobility runs e-bike and e-moped sharing in 22 German and Nordic cities.",
    score: 85,
    state: "saved",
  },
  {
    id: "job-kumsal-frontend",
    company: "Kumsal Games",
    domain: "kumsalgames.com",
    title: "Frontend Engineer, Web Platform",
    city: "Istanbul",
    country: "TR",
    locationLabel: "Istanbul (Levent), on-site",
    remote: "onsite",
    seniority: "mid",
    salary: [1_600_000, 2_000_000, "TRY"],
    visa: null,
    relocation: null,
    language: "en",
    skills: ["react", "typescript", "webgl", "web performance", "node.js"],
    posted: 14,
    sources: [
      {
        source: "lever",
        sourceId: "5e4d3c2b-1a09-4f8e-b7d6-c5b4a3928170",
        url: "https://jobs.lever.co/kumsalgames/5e4d3c2b-1a09-4f8e-b7d6-c5b4a3928170",
      },
    ],
    blurb: "Kumsal Games makes casual puzzle games played by 40 million people a month.",
    score: 78,
    state: "saved",
  },
  {
    id: "job-tannenbaum-frontend",
    company: "Tannenbaum Software",
    domain: "tannenbaum-software.de",
    title: "Frontend-Entwickler:in (React)",
    city: "Munich",
    country: "DE",
    locationLabel: "München, hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [55_000, 65_000, "EUR"],
    visa: null,
    relocation: true,
    language: "de",
    skills: ["react", "typescript", "design systems", "storybook", "accessibility"],
    posted: 11,
    sources: [
      {
        source: "web",
        sourceId: null,
        url: "https://tannenbaum-software.de/karriere/frontend-entwickler-react",
      },
    ],
    blurb:
      "Tannenbaum Software entwickelt ERP-Software für 4.000 mittelständische Unternehmen in der DACH-Region.",
    score: 72,
    state: "saved",
  },
  {
    id: "job-quill-frontend",
    company: "Quill Docs",
    domain: "quilldocs.com",
    title: "Frontend Engineer",
    city: null,
    country: null,
    locationLabel: "Remote",
    remote: "remote",
    eligibility: "US or EU time zones; contractors welcome",
    seniority: "mid",
    employment: "contract",
    salary: [110_000, 135_000, "USD"],
    visa: null,
    relocation: false,
    language: "en",
    skills: ["react", "typescript", "accessibility", "i18n", "vite"],
    posted: 13,
    sources: [
      {
        source: "greenhouse",
        sourceId: "5528801",
        url: "https://job-boards.greenhouse.io/quilldocs/jobs/5528801",
      },
      {
        source: "jooble",
        sourceId: "-7712093345511200",
        url: "https://jooble.org/desc/-7712093345511200",
        seen: 12,
      },
    ],
    blurb: "Quill Docs is the contract-drafting tool used by 2,500 law firms.",
    score: 83,
    state: "saved",
  },
  {
    id: "job-halden-product",
    company: "Halden Freight",
    domain: "haldenfreight.co.uk",
    title: "Product Engineer",
    city: "Manchester",
    country: "GB",
    locationLabel: "Manchester, hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [50_000, 62_000, "GBP"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["react", "typescript", "node.js", "react native", "sql"],
    posted: 6,
    sources: [{ source: "web", sourceId: null, url: "https://haldenfreight.co.uk/careers/product-engineer" }],
    applyEmail: "careers@haldenfreight.co.uk",
    blurb: "Halden Freight books pallet deliveries for 9,000 UK small businesses.",
    score: 76,
    state: "saved",
  },
  {
    id: "job-northstar-frontend",
    company: "Northstar Maps",
    domain: "northstarmaps.nl",
    title: "Frontend Engineer, Map Platform",
    city: "Amsterdam",
    country: "NL",
    locationLabel: "Amsterdam, hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [60_000, 74_000, "EUR"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["react", "typescript", "webgl", "d3", "web performance"],
    posted: 5,
    sources: [
      {
        source: "recruitee",
        sourceId: "frontend-engineer-map-platform",
        url: "https://northstarmaps.recruitee.com/o/frontend-engineer-map-platform",
      },
      { source: "adzuna", sourceId: "4301299871", url: "https://www.adzuna.nl/details/4301299871", seen: 4 },
    ],
    blurb: "Northstar Maps provides indoor maps for 600 airports, hospitals and malls.",
    score: 81,
    state: "saved",
  },
  {
    id: "job-polder-frontend",
    company: "Polder Energy",
    domain: "polderenergy.nl",
    title: "Frontend Developer",
    city: "Rotterdam",
    country: "NL",
    locationLabel: "Rotterdam, hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [55_000, 66_000, "EUR"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["react", "typescript", "d3", "graphql", "accessibility"],
    posted: 4,
    sources: [
      {
        source: "workable",
        sourceId: "8C2D4E6F10",
        url: "https://apply.workable.com/polder-energy/j/8C2D4E6F10/",
      },
    ],
    blurb: "Polder Energy helps 180,000 Dutch households share solar power with their neighbours.",
    score: 77,
    state: "saved",
  },
  {
    id: "job-sail-product",
    company: "Sail Analytics",
    domain: "sailanalytics.com",
    title: "Product Engineer, Growth",
    city: null,
    country: null,
    locationLabel: "Remote",
    remote: "remote",
    eligibility: "Anywhere between UTC−5 and UTC+3",
    seniority: "mid",
    salary: [115_000, 140_000, "USD"],
    visa: null,
    relocation: false,
    language: "en",
    skills: ["react", "typescript", "a/b testing", "node.js", "sql"],
    posted: 3,
    sources: [
      {
        source: "ashby",
        sourceId: "0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
        url: "https://jobs.ashbyhq.com/sailanalytics/0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
      },
    ],
    blurb: "Sail Analytics is product analytics for mobile-first startups.",
    score: 84,
    state: "saved",
  },
  {
    id: "job-bosphorus-frontend",
    company: "Bosphorus Bank Digital",
    domain: "bosphorusbank.com.tr",
    title: "Senior Frontend Engineer, Mobile Web",
    city: "Istanbul",
    country: "TR",
    locationLabel: "Istanbul (Levent), hybrid",
    remote: "hybrid",
    seniority: "senior",
    salary: [2_400_000, 3_000_000, "TRY"],
    visa: null,
    relocation: null,
    language: "en",
    skills: ["react", "typescript", "micro-frontends", "accessibility", "jest"],
    posted: 2,
    sources: [
      {
        source: "web",
        sourceId: null,
        url: "https://kariyer.bosphorusbank.com.tr/ilan/senior-frontend-engineer-mobile-web",
      },
    ],
    blurb: "Bosphorus Bank Digital builds the mobile and web banking apps for 6 million customers.",
    score: 79,
    state: "saved",
  },
  {
    id: "job-aire-frontend",
    company: "Aire Digital Health",
    domain: "airedigitalhealth.co.uk",
    title: "Frontend Engineer",
    city: "Leeds",
    country: "GB",
    locationLabel: "Leeds, hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [48_000, 58_000, "GBP"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["react", "typescript", "accessibility", "next.js"],
    posted: 1,
    sources: [
      { source: "reed", sourceId: "53300114", url: "https://www.reed.co.uk/jobs/frontend-engineer/53300114" },
    ],
    blurb: "Aire Digital Health builds the patient portal used by 40 NHS trusts.",
    score: 80,
    state: "saved",
  },
  {
    id: "job-fjordline-frontend",
    company: "Fjordline Health",
    domain: "fjordline-health.de",
    title: "Frontend Engineer (m/w/d)",
    city: "Hamburg",
    country: "DE",
    locationLabel: "Hamburg, hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [56_000, 66_000, "EUR"],
    visa: null,
    relocation: true,
    language: "de",
    skills: ["react", "typescript", "accessibility", "vue"],
    posted: 40,
    sources: [
      { source: "web", sourceId: null, url: "https://fjordline-health.jobs.personio.de/job/1450981" },
    ],
    blurb: "Fjordline Health digitalisiert die Pflegedokumentation für 900 Einrichtungen in Norddeutschland.",
    score: 66,
    state: "saved",
    lastSeen: 15,
  },
  {
    id: "job-cadence-frontend",
    company: "Cadence Analytics",
    domain: "cadenceanalytics.io",
    title: "Frontend Engineer, Dashboards",
    city: "Dublin",
    country: "IE",
    locationLabel: "Dublin or remote (EU)",
    remote: "remote",
    eligibility: "EU residents with the right to work",
    remoteFromTurkey: false,
    seniority: "mid",
    salary: [65_000, 80_000, "EUR"],
    visa: false,
    relocation: false,
    language: "en",
    skills: ["react", "typescript", "d3", "graphql"],
    posted: 35,
    sources: [
      {
        source: "lever",
        sourceId: "8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d",
        url: "https://jobs.lever.co/cadenceanalytics/8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d",
      },
    ],
    blurb: "Cadence Analytics turns warehouse sensor data into live dashboards for 200 logistics operators.",
    score: 63,
    state: "saved",
    lastSeen: 10,
  },
  {
    id: "job-helio-frontend",
    company: "Helio Energy",
    domain: "helio-energy.de",
    title: "Frontend Engineer, Customer Portal",
    city: "Berlin",
    country: "DE",
    locationLabel: "Berlin, hybrid",
    remote: "hybrid",
    seniority: "senior",
    salary: [70_000, 85_000, "EUR"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["react", "typescript", "next.js", "aws"],
    posted: 64,
    sources: [
      {
        source: "greenhouse",
        sourceId: "4410021",
        url: "https://job-boards.greenhouse.io/helioenergy/jobs/4410021",
      },
    ],
    blurb: "Helio Energy installs rooftop solar and batteries for 50,000 German homes.",
    score: 82,
    state: "saved",
    lastSeen: 35,
  },
  {
    id: "job-otterly-frontend",
    company: "Otterly",
    domain: "otterly.app",
    title: "Frontend Engineer",
    city: "London",
    country: "GB",
    locationLabel: "London, on-site 4 days",
    remote: "onsite",
    seniority: "mid",
    salary: [58_000, 68_000, "GBP"],
    visa: true,
    relocation: false,
    language: "en",
    skills: ["react", "typescript", "react native", "figma"],
    posted: 33,
    sources: [
      {
        source: "ashby",
        sourceId: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
        url: "https://jobs.ashbyhq.com/otterly/2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
      },
    ],
    blurb: "Otterly is a budgeting app for families with 300,000 UK users.",
    score: 75,
    state: "saved",
    lastSeen: 12,
  },
  {
    id: "job-vela-frontend",
    company: "Vela Travel",
    domain: "velatravel.es",
    title: "Frontend Engineer",
    city: "Barcelona",
    country: "ES",
    locationLabel: "Barcelona, hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [48_000, 58_000, "EUR"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["react", "typescript", "redux", "web performance"],
    posted: 58,
    sources: [
      {
        source: "workable",
        sourceId: "3B5D7F9A1C",
        url: "https://apply.workable.com/vela-travel/j/3B5D7F9A1C/",
      },
      {
        source: "arbeitnow",
        sourceId: "vela-travel-frontend-engineer-399120",
        url: "https://www.arbeitnow.com/jobs/companies/vela-travel/frontend-engineer-399120",
        seen: 56,
      },
    ],
    blurb: "Vela Travel sells multi-city rail and ferry trips across Southern Europe.",
    score: 70,
    state: "saved",
    lastSeen: 25,
  },
  {
    id: "job-atlas-frontend",
    company: "Atlas Mobility",
    domain: "atlasmobility.com.tr",
    title: "Frontend Engineer",
    city: "Istanbul",
    country: "TR",
    locationLabel: "Istanbul (Şişli), on-site",
    remote: "onsite",
    seniority: "mid",
    salary: [1_300_000, 1_500_000, "TRY"],
    visa: null,
    relocation: null,
    language: "en",
    skills: ["react", "typescript", "redux", "react native"],
    posted: 62,
    sources: [
      { source: "web", sourceId: null, url: "https://atlasmobility.com.tr/kariyer/frontend-engineer" },
    ],
    blurb: "Atlas Mobility runs ride-hailing for taxis in Istanbul, Ankara and İzmir.",
    score: 71,
    state: "saved",
    lastSeen: 30,
  },

  // --- Feed only ------------------------------------------------------------------------------
  {
    id: "job-lighthouse-senior-frontend",
    company: "Lighthouse Learning",
    domain: "lighthouselearning.com",
    title: "Senior Frontend Engineer",
    city: null,
    country: null,
    locationLabel: "Remote (Europe)",
    remote: "remote",
    eligibility: "Europe, UK and Türkiye",
    seniority: "senior",
    salary: [70_000, 85_000, "EUR"],
    visa: null,
    relocation: false,
    language: "en",
    skills: ["react", "typescript", "accessibility", "design systems", "storybook", "vue"],
    posted: 1,
    sources: [
      {
        source: "workable",
        sourceId: "5E7A9C1B3D",
        url: "https://apply.workable.com/lighthouse-learning/j/5E7A9C1B3D/",
      },
      {
        source: "remotive",
        sourceId: "1998843",
        url: "https://remotive.com/remote-jobs/software-dev/senior-frontend-engineer-1998843",
        seen: 0.8,
      },
      {
        source: "jooble",
        sourceId: "-3388129900417762",
        url: "https://jooble.org/desc/-3388129900417762",
        seen: 0.5,
        salary: [75_000, 85_000, "EUR"],
      },
    ],
    blurb: "Lighthouse Learning makes reading apps that 2 million primary-school children use every week.",
    score: 84,
  },
  {
    id: "job-pixelpost-design-systems",
    company: "Pixelpost",
    domain: "pixelpost.de",
    title: "Design Systems Engineer",
    city: "Berlin",
    country: "DE",
    locationLabel: "Berlin (Mitte), hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [65_000, 78_000, "EUR"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["react", "typescript", "design systems", "storybook", "figma", "accessibility"],
    posted: 0.5,
    sources: [
      {
        source: "greenhouse",
        sourceId: "7120334",
        url: "https://job-boards.greenhouse.io/pixelpost/jobs/7120334",
      },
      {
        source: "arbeitnow",
        sourceId: "pixelpost-design-systems-engineer-421907",
        url: "https://www.arbeitnow.com/jobs/companies/pixelpost/design-systems-engineer-421907",
        seen: 0.3,
      },
    ],
    blurb: "Pixelpost is the newsletter platform behind 30,000 independent publications.",
    score: 88,
  },
  {
    id: "job-moda-frontend",
    company: "Moda Market",
    domain: "modamarket.com.tr",
    title: "Frontend Engineer (React)",
    city: "Istanbul",
    country: "TR",
    locationLabel: "İstanbul (Beşiktaş), hibrit",
    remote: "hybrid",
    seniority: "mid",
    visa: null,
    relocation: null,
    language: "tr",
    skills: ["react", "next.js", "typescript", "web performance"],
    posted: 2,
    sources: [
      {
        source: "web",
        sourceId: null,
        url: "https://www.kariyer.net/is-ilani/moda-market-frontend-engineer-react-4012270",
      },
    ],
    blurb: "Moda Market, 400 butik markayı tek bir alışveriş deneyiminde buluşturan moda pazaryeri.",
    score: 79,
  },
  {
    id: "job-fernweh-frontend",
    company: "Fernweh Reisen",
    domain: "fernweh-reisen.de",
    title: "Frontend-Entwickler:in (Vue.js)",
    city: "Hamburg",
    country: "DE",
    locationLabel: "Hamburg, hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [52_000, 62_000, "EUR"],
    visa: null,
    relocation: true,
    language: "de",
    skills: ["vue", "typescript", "css", "cypress"],
    posted: 3,
    sources: [
      {
        source: "arbeitnow",
        sourceId: "fernweh-reisen-frontend-entwicklerin-vuejs-420019",
        url: "https://www.arbeitnow.com/jobs/companies/fernweh-reisen/frontend-entwicklerin-vuejs-420019",
      },
    ],
    blurb: "Fernweh Reisen ist ein Online-Reiseveranstalter für nachhaltige Rundreisen.",
    score: 52,
  },
  {
    id: "job-copperleaf-frontend",
    company: "Copperleaf Insurance",
    domain: "copperleaf.co.uk",
    title: "Frontend Developer",
    city: "London",
    country: "GB",
    locationLabel: "London, hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [55_000, 65_000, "GBP"],
    visa: false,
    relocation: false,
    language: "en",
    skills: ["angular", "typescript", "rxjs", "css"],
    posted: 2,
    sources: [
      {
        source: "reed",
        sourceId: "53288710",
        url: "https://www.reed.co.uk/jobs/frontend-developer/53288710",
      },
      {
        source: "adzuna",
        sourceId: "4999102267",
        url: "https://www.adzuna.co.uk/jobs/details/4999102267",
        seen: 1.5,
      },
    ],
    blurb: "Copperleaf Insurance sells pet and travel insurance online across the UK.",
    score: 47,
  },
  {
    id: "job-tidewater-product",
    company: "Tidewater Data",
    domain: "tidewaterdata.com",
    title: "Product Engineer",
    city: null,
    country: "US",
    locationLabel: "Remote (US)",
    remote: "remote",
    eligibility: "US residents only",
    remoteFromTurkey: false,
    seniority: "mid",
    salary: [130_000, 160_000, "USD"],
    visa: false,
    relocation: false,
    language: "en",
    skills: ["react", "typescript", "python", "sql"],
    posted: 1,
    sources: [
      {
        source: "greenhouse",
        sourceId: "7133301",
        url: "https://job-boards.greenhouse.io/tidewaterdata/jobs/7133301",
      },
    ],
    blurb: "Tidewater Data builds flood-risk models for US insurers and cities.",
    score: 49,
  },
  {
    id: "job-kanal-senior-frontend",
    company: "Kanal Media",
    domain: "kanalmedia.com.tr",
    title: "Senior Frontend Engineer",
    city: "Istanbul",
    country: "TR",
    locationLabel: "Istanbul (Maslak), hybrid",
    remote: "hybrid",
    seniority: "senior",
    salary: [2_200_000, 2_800_000, "TRY"],
    visa: null,
    relocation: null,
    language: "en",
    skills: ["react", "typescript", "next.js", "web performance", "graphql", "aws"],
    posted: 4,
    sources: [
      {
        source: "lever",
        sourceId: "6f5e4d3c-2b1a-4098-8f7e-6d5c4b3a2918",
        url: "https://jobs.lever.co/kanalmedia/6f5e4d3c-2b1a-4098-8f7e-6d5c4b3a2918",
      },
    ],
    blurb: "Kanal Media runs news and video sites that reach 25 million readers a month.",
    score: 73,
  },
  {
    id: "job-zuiderzee-webgl",
    company: "Zuiderzee Robotics",
    domain: "zuiderzee-robotics.nl",
    title: "Frontend Engineer (WebGL)",
    city: "Eindhoven",
    country: "NL",
    locationLabel: "Eindhoven, on-site",
    remote: "onsite",
    seniority: "mid",
    salary: [55_000, 68_000, "EUR"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["typescript", "webgl", "three.js", "python"],
    posted: 6,
    sources: [
      {
        source: "recruitee",
        sourceId: "frontend-engineer-webgl",
        url: "https://zuiderzeerobotics.recruitee.com/o/frontend-engineer-webgl",
      },
    ],
    blurb: "Zuiderzee Robotics builds autonomous greenhouse robots and the 3D tools that plan their routes.",
    score: 41,
  },
  {
    id: "job-aurora-react-native",
    company: "Aurora Fintech",
    domain: "aurorafintech.eu",
    title: "React Native Engineer",
    city: null,
    country: null,
    locationLabel: "Remote (EU + Türkiye)",
    remote: "remote",
    eligibility: "EU, UK and Türkiye",
    seniority: "mid",
    salary: [60_000, 72_000, "EUR"],
    visa: null,
    relocation: false,
    language: "en",
    skills: ["react native", "typescript", "redux", "jest", "swift"],
    posted: 5,
    sources: [
      {
        source: "ashby",
        sourceId: "3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7",
        url: "https://jobs.ashbyhq.com/aurorafintech/3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7",
      },
    ],
    blurb: "Aurora Fintech is a savings app for freelancers in 11 European countries.",
    score: 76,
    state: "saved",
  },
  {
    id: "job-gridline-product",
    company: "Gridline",
    domain: "gridline.nl",
    title: "Product Engineer, Frontend",
    city: "Amsterdam",
    country: "NL",
    locationLabel: "Amsterdam, hybrid",
    remote: "hybrid",
    seniority: "mid",
    salary: [62_000, 76_000, "EUR"],
    visa: true,
    relocation: true,
    language: "en",
    skills: ["react", "typescript", "next.js", "a/b testing", "node.js"],
    posted: 3,
    sources: [
      {
        source: "recruitee",
        sourceId: "product-engineer-frontend",
        url: "https://gridline.recruitee.com/o/product-engineer-frontend",
      },
      {
        source: "adzuna",
        sourceId: "4302877120",
        url: "https://www.adzuna.nl/details/4302877120",
        seen: 2,
        salary: [65_000, 76_000, "EUR"],
      },
    ],
    blurb: "Gridline schedules shifts for 12,000 hospitals, warehouses and shops.",
    score: 82,
    state: "saved",
  },
  {
    id: "job-spinach-angular",
    company: "Spinach Ads",
    domain: "spinachads.com",
    title: "Angular Developer",
    city: null,
    country: null,
    locationLabel: "Remote",
    remote: "remote",
    eligibility: "Worldwide",
    seniority: "junior",
    salary: [30_000, 40_000, "EUR"],
    visa: null,
    relocation: false,
    language: "en",
    skills: ["angular", "rxjs", "typescript"],
    posted: 7,
    sources: [
      { source: "jooble", sourceId: "-9011223344556677", url: "https://jooble.org/desc/-9011223344556677" },
    ],
    blurb: "Spinach Ads builds ad-campaign tools for small agencies.",
    score: 33,
    state: "dismissed",
    dismissReasons: ["not_relevant", "salary"],
  },
  {
    id: "job-hollowpine-unity",
    company: "Hollow Pine Games",
    domain: "hollowpine.games",
    title: "UI Developer (Unity)",
    city: null,
    country: null,
    locationLabel: "Remote",
    remote: "remote",
    eligibility: "Europe",
    seniority: "mid",
    visa: null,
    relocation: false,
    language: "en",
    skills: ["unity", "c#", "figma"],
    posted: 8,
    sources: [
      {
        source: "remotive",
        sourceId: "1979020",
        url: "https://remotive.com/remote-jobs/software-dev/ui-developer-unity-1979020",
      },
    ],
    blurb: "Hollow Pine Games is an indie studio making cosy narrative games.",
    score: 28,
    state: "dismissed",
    dismissReasons: [],
  },
  {
    id: "job-bergmann-frontend",
    company: "Bergmann Logistik",
    domain: "bergmann-logistik.de",
    title: "Frontend-Entwickler (Angular)",
    city: "Stuttgart",
    country: "DE",
    locationLabel: "Stuttgart, vor Ort",
    remote: "onsite",
    seniority: "mid",
    salary: [54_000, 62_000, "EUR"],
    visa: null,
    relocation: false,
    language: "de",
    skills: ["angular", "typescript", "rxjs", "sql"],
    posted: 9,
    sources: [{ source: "adzuna", sourceId: "4988120034", url: "https://www.adzuna.de/details/4988120034" }],
    blurb: "Bergmann Logistik betreibt 40 Lagerstandorte in Süddeutschland.",
    score: 44,
    state: "dismissed",
    dismissReasons: ["language", "location"],
  },
  // From the job-alert email (mail-job-alert).
  {
    id: "job-northbeam-frontend",
    company: "Northbeam Studio",
    domain: "northbeam.studio",
    title: "Frontend Engineer",
    city: "London",
    country: "GB",
    locationLabel: "London, hybrid",
    remote: "hybrid",
    seniority: "mid",
    visa: null,
    relocation: null,
    language: "en",
    skills: ["react", "typescript", "three.js", "figma"],
    posted: 1,
    sources: [
      { source: "alert_email", sourceId: "4051229871", url: "https://www.linkedin.com/jobs/view/4051229871" },
    ],
    blurb: "Northbeam Studio designs and builds interactive websites for museums and cultural brands.",
    score: 68,
  },
  {
    id: "job-mercator-frontend",
    company: "Mercator Travel",
    domain: "mercatortravel.com",
    title: "Frontend Engineer, Booking",
    city: null,
    country: null,
    locationLabel: "Remote (Europe)",
    remote: "remote",
    eligibility: "Europe",
    seniority: "mid",
    salary: [58_000, 70_000, "EUR"],
    visa: null,
    relocation: false,
    language: "en",
    skills: ["react", "typescript", "web performance", "i18n"],
    posted: 1,
    sources: [
      { source: "alert_email", sourceId: "4051230017", url: "https://www.linkedin.com/jobs/view/4051230017" },
    ],
    blurb: "Mercator Travel sells city breaks and train tickets in 9 European languages.",
    score: 81,
  },
  {
    id: "job-balticbyte-fullstack",
    company: "Baltic Byte",
    domain: "balticbyte.ee",
    title: "Full-stack Engineer (TypeScript)",
    city: null,
    country: null,
    locationLabel: "Remote",
    remote: "remote",
    eligibility: "EU time zones",
    seniority: "mid",
    salary: [50_000, 64_000, "EUR"],
    visa: null,
    relocation: false,
    language: "en",
    skills: ["typescript", "react", "node.js", "go", "aws"],
    posted: 1,
    sources: [
      { source: "alert_email", sourceId: "4051231190", url: "https://www.linkedin.com/jobs/view/4051231190" },
    ],
    blurb: "Baltic Byte builds e-residency and company-formation tools.",
    score: 62,
  },
];

const built = rows.map(build);

export const jobs: Job[] = built.map(({ job }) => job);
export const jobMatches: JobMatch[] = built.map(({ match }) => match);

export const savedSearches: SavedSearch[] = [
  {
    id: "search-react-europe-remote",
    name: "React · Remote Europe",
    query: "react typescript frontend",
    filters: {
      countryCodes: [],
      remoteTypes: ["remote"],
      seniority: ["mid", "senior"],
      salaryMin: { amount: 55_000, currency: "EUR", period: "year" },
      sources: [],
      postedWithinDays: 14,
      visaSponsorship: null,
    },
    schedule: "daily",
    alertThreshold: 80,
    dailyDigest: true,
    enabled: true,
    lastRunAt: daysAgo(0, -2),
    nextRunAt: daysAgo(-1, -2),
    createdAt: daysAgo(60),
    updatedAt: daysAgo(10),
  },
  {
    id: "search-berlin-amsterdam-relocation",
    name: "Berlin & Amsterdam · visa sponsorship",
    query: "frontend engineer OR product engineer",
    filters: {
      countryCodes: ["DE", "NL"],
      remoteTypes: ["hybrid", "onsite"],
      seniority: ["mid"],
      salaryMin: null,
      sources: [],
      postedWithinDays: 30,
      visaSponsorship: true,
    },
    schedule: "daily",
    alertThreshold: 75,
    dailyDigest: false,
    enabled: true,
    lastRunAt: daysAgo(0, -1),
    nextRunAt: daysAgo(-1, -1),
    createdAt: daysAgo(45),
    updatedAt: daysAgo(45),
  },
  {
    id: "search-istanbul-hybrid",
    name: "Istanbul · hybrid",
    query: "frontend",
    filters: {
      countryCodes: ["TR"],
      remoteTypes: ["hybrid"],
      seniority: ["mid", "senior"],
      salaryMin: null,
      sources: [],
      postedWithinDays: 7,
      visaSponsorship: null,
    },
    schedule: "weekly",
    alertThreshold: 85,
    dailyDigest: false,
    enabled: false,
    lastRunAt: daysAgo(9),
    nextRunAt: null,
    createdAt: daysAgo(68),
    updatedAt: daysAgo(9),
  },
];
