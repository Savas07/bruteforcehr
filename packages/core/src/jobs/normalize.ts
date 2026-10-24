import type { JobLocation } from "../job";
import type { RemoteType, Seniority } from "../enums";

/**
 * Text normalization shared by connectors, dedupe and matching. Pure and deterministic, so the same
 * posting always yields the same fingerprint and skills on every platform.
 */

/** Lower-case, diacritics removed (Turkish dotless ı and German ß included), whitespace collapsed. */
export function foldText(value: string): string {
  return value
    .replace(/ß/g, "ss")
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  euro: "€",
  pound: "£",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  ccedil: "ç",
  Ccedil: "Ç",
  eacute: "é",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return ENTITIES[entity] ?? match;
  });
}

/**
 * Plain text with paragraph breaks from posting HTML: scripts/styles dropped, block elements become
 * line breaks, list items get a bullet, entities decoded. Text without tags passes through trimmed.
 * Some APIs double-encode (`&lt;p&gt;`), so entity-encoded markup is decoded first.
 */
export function htmlToText(html: string): string {
  let source = html;
  if (!/<[a-z]/i.test(source) && /&lt;[a-z/]/i.test(source)) source = decodeEntities(source);
  const text = source
    .replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol|section|article|tr|table|blockquote)>/gi, "\n")
    .replace(/<(p|div|h[1-6]|ul|ol|section|article|tr|table|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const LEGAL_SUFFIXES: readonly string[] = [
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "plc",
  "gmbh",
  "mbh",
  "ag",
  "se",
  "kg",
  "co",
  "corp",
  "corporation",
  "company",
  "bv",
  "nv",
  "sa",
  "sas",
  "srl",
  "as",
  "a s",
  "sti",
  "ltd sti",
  "anonim sirketi",
  "limited sirketi",
  "holding",
  "group",
  "ug",
  "haftungsbeschrankt",
  "oy",
  "ab",
  "aps",
  "spa",
  "pty",
];

/** Company name for comparison: folded, punctuation and legal-form suffixes removed ("Acme GmbH" → "acme"). */
export function normalizeCompanyName(name: string): string {
  const words = foldText(name)
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "");
  while (words.length > 1) {
    const last = words[words.length - 1] ?? "";
    const lastTwo = words.slice(-2).join(" ");
    if (LEGAL_SUFFIXES.includes(lastTwo) && words.length > 2) words.splice(-2, 2);
    else if (LEGAL_SUFFIXES.includes(last)) words.pop();
    else break;
  }
  return words.join(" ");
}

const TITLE_ABBREVIATIONS: Readonly<Record<string, string>> = {
  sr: "senior",
  snr: "senior",
  jr: "junior",
  jnr: "junior",
  eng: "engineer",
  engr: "engineer",
  dev: "developer",
  mgr: "manager",
  swe: "software engineer",
  fe: "frontend",
  be: "backend",
  "front end": "frontend",
  "back end": "backend",
  "full stack": "fullstack",
  "full-stack": "fullstack",
};

const TITLE_ABBREVIATION_PATTERNS: readonly (readonly [RegExp, string])[] = Object.entries(
  TITLE_ABBREVIATIONS,
).map(([short, long]) => [
  new RegExp(`(^|[^\\p{L}])${escapeRegExp(short)}\\.?(?=$|[^\\p{L}])`, "gu"),
  `$1${long}`,
]);

/**
 * Title for comparison: folded, gender markers ("(m/w/d)", "(f/m/x)", "(all genders)") and
 * bracketed extras removed, abbreviations expanded.
 */
export function normalizeTitle(title: string): string {
  let value = foldText(title)
    .replace(/\((?:[mwfdxh]\s*[/|,]\s*)+[mwfdxh]\)/g, " ")
    .replace(/\b(?:[mwfdx]\s*\/\s*){2,}[mwfdx]\b/g, " ")
    .replace(/\(\s*(?:all genders?|alle geschlechter|gn|d\/f\/m|w\/m\/d|m\/f\/d)\s*\)/g, " ")
    .replace(/\*in\b|:in\b|_in\b/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  for (const [pattern, replacement] of TITLE_ABBREVIATION_PATTERNS)
    value = value.replace(pattern, replacement);
  return value
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface PlaceInfo {
  readonly countryCode: string;
  readonly city: string | null;
}

/** Folded names → place. Cities cover the target markets (TR, DE, NL, UK, US) and common hubs. */
const PLACES: Readonly<Record<string, PlaceInfo>> = (() => {
  const places: Record<string, PlaceInfo> = {};
  const countries: Record<string, readonly string[]> = {
    TR: ["turkey", "turkiye", "türkiye"],
    DE: ["germany", "deutschland", "almanya"],
    NL: ["netherlands", "the netherlands", "nederland", "holland"],
    GB: ["united kingdom", "uk", "great britain", "england", "scotland", "wales", "northern ireland", "gb"],
    US: ["united states", "united states of america", "usa", "us", "u.s.", "u.s.a."],
    AT: ["austria", "osterreich"],
    CH: ["switzerland", "schweiz"],
    IE: ["ireland"],
    FR: ["france"],
    ES: ["spain", "espana"],
    PT: ["portugal"],
    IT: ["italy", "italia"],
    PL: ["poland", "polska"],
    BE: ["belgium"],
    SE: ["sweden"],
    DK: ["denmark"],
    NO: ["norway"],
    FI: ["finland"],
    CZ: ["czech republic", "czechia"],
    CA: ["canada"],
    AU: ["australia"],
    AE: ["united arab emirates", "uae"],
  };
  for (const [code, names] of Object.entries(countries)) {
    for (const name of names) places[foldText(name)] = { countryCode: code, city: null };
  }
  const cities: Record<string, readonly (readonly [string, ...string[]])[]> = {
    TR: [
      ["Istanbul", "istanbul", "İstanbul"],
      ["Ankara"],
      ["Izmir", "izmir", "İzmir"],
      ["Bursa"],
      ["Antalya"],
      ["Kocaeli"],
    ],
    DE: [
      ["Berlin"],
      ["Munich", "München", "muenchen"],
      ["Hamburg"],
      ["Frankfurt", "Frankfurt am Main"],
      ["Cologne", "Köln", "koeln"],
      ["Stuttgart"],
      ["Düsseldorf", "dusseldorf", "duesseldorf"],
      ["Leipzig"],
      ["Dresden"],
      ["Hanover", "Hannover"],
      ["Nuremberg", "Nürnberg"],
      ["Karlsruhe"],
      ["Bonn"],
      ["Essen"],
      ["Dortmund"],
      ["Mannheim"],
      ["Bremen"],
    ],
    NL: [["Amsterdam"], ["Rotterdam"], ["Utrecht"], ["Eindhoven"], ["The Hague", "Den Haag"], ["Delft"]],
    GB: [
      ["London"],
      ["Manchester"],
      ["Edinburgh"],
      ["Bristol"],
      ["Cambridge"],
      ["Oxford"],
      ["Birmingham"],
      ["Leeds"],
      ["Glasgow"],
    ],
    US: [
      ["New York", "NYC", "New York City"],
      ["San Francisco", "SF"],
      ["Seattle"],
      ["Boston"],
      ["Austin"],
      ["Chicago"],
      ["Los Angeles"],
      ["Washington", "Washington DC", "Washington, D.C."],
      ["Denver"],
      ["Atlanta"],
    ],
    AT: [["Vienna", "Wien"]],
    CH: [["Zurich", "Zürich"], ["Geneva", "Genève"], ["Basel"]],
    IE: [["Dublin"]],
    FR: [["Paris"]],
    ES: [["Madrid"], ["Barcelona"]],
    PT: [["Lisbon", "Lisboa"], ["Porto"]],
    PL: [
      ["Warsaw", "Warszawa"],
      ["Krakow", "Kraków"],
    ],
    SE: [["Stockholm"]],
    DK: [["Copenhagen"]],
    CZ: [["Prague", "Praha"]],
    CA: [["Toronto"], ["Vancouver"], ["Montreal"]],
  };
  for (const [code, list] of Object.entries(cities)) {
    for (const [city, ...aliases] of list) {
      for (const name of [city, ...aliases]) places[foldText(name)] = { countryCode: code, city };
    }
  }
  return places;
})();

const US_STATES: readonly string[] =
  "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc".split(
    " ",
  );

const REMOTE_WORDS =
  /\b(remote|anywhere|worldwide|distributed|home ?office|uzaktan|fernarbeit|mobiles arbeiten)\b/;

/**
 * A location label as `JobLocation`: city and ISO country from the comma-separated parts
 * ("Berlin, Germany", "Austin, TX", "İstanbul, Türkiye"). Unknown places keep the label only.
 */
export function parseLocation(label: string): JobLocation {
  const trimmed = label.replace(/\s+/g, " ").trim().slice(0, 200);
  const parts = trimmed
    .split(/[,/|;–-]| \(|\)/)
    .map((part) => foldText(part).replace(/\.$/, ""))
    .filter((part) => part !== "");
  let city: string | null = null;
  let countryCode: string | null = null;
  for (const part of parts) {
    const place = PLACES[part];
    if (place !== undefined) {
      countryCode ??= place.countryCode;
      if (place.city !== null && city === null && place.countryCode === countryCode) city = place.city;
    } else if (US_STATES.includes(part) && parts.length > 1) {
      countryCode ??= "US";
    }
  }
  if (city === null && countryCode !== null && parts.length > 1) {
    const first = parts[0] ?? "";
    if (PLACES[first] === undefined && !REMOTE_WORDS.test(first) && /^[\p{L} .'-]{2,60}$/u.test(first)) {
      // An unknown place before a known country/state ("Bielefeld, Germany"): keep its own wording.
      const original = trimmed.split(",")[0]?.trim();
      if (original !== undefined && original !== "") city = original.slice(0, 120);
    }
  }
  return { label: trimmed === "" ? "Unknown" : trimmed, city, countryCode };
}

/** Remote/hybrid/onsite from explicit flags first, then the wording of location and title. */
export function detectRemoteType(text: string, explicitRemote?: boolean | null): RemoteType | null {
  const folded = foldText(text);
  if (/\bhybrid\b|\bhibrit\b/.test(folded)) return "hybrid";
  if (explicitRemote === true || REMOTE_WORDS.test(folded)) return "remote";
  if (explicitRemote === false) return "onsite";
  if (/\b(on-?site|in office|office based|vor ort|ofisten)\b/.test(folded)) return "onsite";
  return null;
}

const SENIORITY_PATTERNS: readonly (readonly [Seniority, RegExp])[] = [
  ["intern", /\b(intern|internship|praktikum|praktikant|stajyer|werkstudent|working student)\b/],
  ["director", /\b(director|head of|vp|vice president|direktor|direktör)\b/],
  ["principal", /\bprincipal\b/],
  ["staff", /\bstaff\b/],
  ["lead", /\b(lead|tech lead|team lead|lider)\b/],
  ["manager", /\b(manager|leiter|mudur|müdür)\b/],
  ["senior", /\b(senior|sr|kidemli|kıdemli)\b/],
  ["junior", /\b(junior|jr|graduate|entry level|einsteiger|berufseinsteiger)\b/],
  ["mid", /\b(mid|intermediate|mid-level|regular)\b/],
];

/** Seniority from the title wording, or null when the title does not say. */
export function detectSeniority(title: string): Seniority | null {
  const folded = foldText(title);
  for (const [seniority, pattern] of SENIORITY_PATTERNS) if (pattern.test(folded)) return seniority;
  return null;
}

/** Explicit visa sponsorship statements: true/false when the posting says so, else null. */
export function detectVisaSponsorship(text: string): boolean | null {
  const folded = foldText(text);
  if (
    /\b(no|not|unable to|cannot|can't|do not|don't|will not|won't)\b[^.\n]{0,40}\b(visa )?sponsor/.test(
      folded,
    ) ||
    /\bsponsorship (is )?not (available|offered|possible)\b/.test(folded) ||
    /\bkein(e)? (visa|visum)/.test(folded)
  ) {
    return false;
  }
  if (
    /\bvisa sponsorship\b|\bsponsor(s|ing)? (your |a |work )?visa|\brelocation and visa\b|\bvisa support\b|\bvisum(sunterstutzung)?\b/.test(
      folded,
    )
  ) {
    return true;
  }
  return null;
}

/** Explicit relocation support: true when the posting offers it, else null. */
export function detectRelocationSupport(text: string): boolean | null {
  const folded = foldText(text);
  if (/\bno relocation\b|\brelocation (is )?not (offered|available|provided)\b/.test(folded)) return false;
  if (
    /\brelocation (support|assistance|package|bonus|budget)\b|\bumzugs(hilfe|unterstutzung|kosten)\b/.test(
      folded,
    )
  ) {
    return true;
  }
  return null;
}

const LANGUAGE_WORDS: Readonly<Record<string, readonly string[]>> = {
  en: ["the", "and", "you", "with", "our", "for", "will", "are", "your", "we", "experience", "team"],
  de: [
    "und",
    "der",
    "die",
    "das",
    "mit",
    "fur",
    "wir",
    "du",
    "sie",
    "ihre",
    "deine",
    "erfahrung",
    "bei",
    "eine",
  ],
  tr: ["ve", "ile", "bir", "icin", "olarak", "deneyim", "olan", "konusunda", "sahip", "en", "az", "tercihen"],
  nl: ["en", "het", "een", "van", "met", "voor", "wij", "jouw", "je", "ervaring", "zijn"],
  fr: ["et", "les", "des", "une", "pour", "vous", "avec", "nous", "votre", "experience"],
  es: ["y", "los", "las", "una", "para", "con", "nuestro", "experiencia", "del"],
};

/** Posting language (BCP 47 primary tag) from function words; `und` when unclear. */
export function detectPostingLanguage(text: string): string {
  const words = foldText(text.slice(0, 5_000)).match(/\p{L}+/gu) ?? [];
  if (words.length < 5) return "und";
  const scores = new Map<string, number>();
  for (const word of words) {
    for (const [language, list] of Object.entries(LANGUAGE_WORDS)) {
      if (list.includes(word)) scores.set(language, (scores.get(language) ?? 0) + 1);
    }
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  const second = ranked[1];
  if (best === undefined || best[1] < 3 || (second !== undefined && second[1] * 1.5 > best[1])) return "und";
  return best[0];
}

/**
 * Canonical skill names with folded aliases. Kept deliberately compact: these are what job
 * postings and CVs in the target roles mention most; the AI rationale call adds the rest.
 */
const SKILLS: readonly (readonly [string, ...string[]])[] = [
  ["JavaScript", "javascript", "js", "ecmascript"],
  ["TypeScript", "typescript", "ts"],
  ["Python", "python"],
  ["Java", "java"],
  ["Kotlin", "kotlin"],
  ["Swift", "swift"],
  ["SwiftUI", "swiftui"],
  ["Objective-C", "objective-c", "objective c"],
  ["Go", "golang", "go lang"],
  ["Rust", "rust"],
  ["C#", "c#", "csharp"],
  ["C++", "c++", "cpp"],
  ["PHP", "php"],
  ["Ruby", "ruby"],
  ["Ruby on Rails", "rails", "ruby on rails"],
  ["Scala", "scala"],
  ["Elixir", "elixir"],
  ["Dart", "dart"],
  ["Flutter", "flutter"],
  ["React", "react", "react.js", "reactjs"],
  ["React Native", "react native"],
  ["Next.js", "next.js", "nextjs"],
  ["Vue", "vue", "vue.js", "vuejs"],
  ["Nuxt", "nuxt", "nuxt.js"],
  ["Angular", "angular", "angularjs"],
  ["Svelte", "svelte", "sveltekit"],
  ["Node.js", "node.js", "nodejs", "node"],
  ["Deno", "deno"],
  ["Express.js", "express.js", "expressjs"],
  ["NestJS", "nestjs", "nest.js"],
  ["Django", "django"],
  ["Flask", "flask"],
  ["FastAPI", "fastapi"],
  ["Spring", "spring", "spring boot", "springboot"],
  [".NET", ".net", "dotnet", "asp.net"],
  ["Laravel", "laravel"],
  ["GraphQL", "graphql"],
  ["REST", "rest", "restful", "rest api", "rest apis"],
  ["gRPC", "grpc"],
  ["HTML", "html", "html5"],
  ["CSS", "css", "css3"],
  ["Tailwind CSS", "tailwind", "tailwindcss", "tailwind css"],
  ["SQL", "sql"],
  ["PostgreSQL", "postgresql", "postgres"],
  ["MySQL", "mysql"],
  ["SQLite", "sqlite"],
  ["MongoDB", "mongodb", "mongo"],
  ["Redis", "redis"],
  ["Elasticsearch", "elasticsearch", "opensearch"],
  ["Kafka", "kafka", "apache kafka"],
  ["RabbitMQ", "rabbitmq"],
  ["Firebase", "firebase", "firestore"],
  ["Supabase", "supabase"],
  ["AWS", "aws", "amazon web services"],
  ["GCP", "gcp", "google cloud", "google cloud platform"],
  ["Azure", "azure", "microsoft azure"],
  ["Docker", "docker"],
  ["Kubernetes", "kubernetes", "k8s"],
  ["Terraform", "terraform"],
  ["Ansible", "ansible"],
  ["Linux", "linux"],
  ["CI/CD", "ci/cd", "ci cd", "continuous integration", "continuous delivery"],
  ["GitHub Actions", "github actions"],
  ["Git", "git"],
  ["Microservices", "microservices", "micro-services"],
  ["Serverless", "serverless", "lambda", "cloud functions"],
  ["Machine Learning", "machine learning", "ml"],
  ["Deep Learning", "deep learning"],
  ["LLM", "llm", "llms", "large language models"],
  ["NLP", "nlp", "natural language processing"],
  ["PyTorch", "pytorch"],
  ["TensorFlow", "tensorflow"],
  ["Pandas", "pandas"],
  ["NumPy", "numpy"],
  ["Spark", "spark", "apache spark", "pyspark"],
  ["Airflow", "airflow"],
  ["dbt", "dbt"],
  ["Snowflake", "snowflake"],
  ["BigQuery", "bigquery"],
  ["Data Engineering", "data engineering"],
  ["Data Analysis", "data analysis", "data analytics"],
  ["Tableau", "tableau"],
  ["Power BI", "power bi", "powerbi"],
  ["Excel", "excel", "microsoft excel"],
  ["iOS", "ios"],
  ["Android", "android"],
  ["Xcode", "xcode"],
  ["Electron", "electron"],
  ["Tauri", "tauri"],
  ["Figma", "figma"],
  ["UX Design", "ux", "ux design", "user experience"],
  ["UI Design", "ui design", "user interface design"],
  ["Accessibility", "accessibility", "a11y", "wcag"],
  ["Testing", "unit testing", "test automation", "tdd"],
  ["Jest", "jest"],
  ["Vitest", "vitest"],
  ["Cypress", "cypress"],
  ["Playwright", "playwright"],
  ["Selenium", "selenium"],
  ["Security", "security", "application security", "appsec", "cybersecurity"],
  ["OAuth", "oauth", "oauth2", "openid connect", "oidc"],
  ["Agile", "agile"],
  ["Scrum", "scrum"],
  ["Kanban", "kanban"],
  ["Jira", "jira"],
  ["Product Management", "product management"],
  ["Project Management", "project management"],
  ["Stakeholder Management", "stakeholder management"],
  ["SEO", "seo"],
  ["SaaS", "saas"],
  ["B2B", "b2b"],
  ["Salesforce", "salesforce"],
  ["SAP", "sap"],
  ["Embedded", "embedded", "embedded systems"],
  ["Distributed Systems", "distributed systems"],
  ["System Design", "system design"],
  ["Observability", "observability", "monitoring", "prometheus", "grafana", "datadog"],
  ["WebSockets", "websocket", "websockets"],
];

const SKILL_ALIASES: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [name, ...aliases] of SKILLS) {
    map.set(foldText(name), name);
    for (const alias of aliases) map.set(foldText(alias), name);
  }
  return map;
})();

/** Aliases that are common English words; only matched with their canonical capitalization. */
const AMBIGUOUS_ALIASES: readonly string[] = [
  "go",
  "rust",
  "swift",
  "spark",
  "node",
  "rest",
  "ml",
  "ts",
  "js",
  "spring",
  "sap",
  "git",
  "dart",
  "ruby",
  "scala",
  "elixir",
  "lambda",
];

/** Canonical skill name for a free-text skill ("reactjs" → "React"); unknown skills keep their wording. */
export function normalizeSkill(skill: string): string {
  const trimmed = skill.trim().replace(/\s+/g, " ").slice(0, 60);
  return SKILL_ALIASES.get(foldText(trimmed)) ?? trimmed;
}

/** Folded key of a skill, for set comparisons (`normalizeSkill` first). */
export function skillKey(skill: string): string {
  return foldText(normalizeSkill(skill));
}

/** Escapes a literal for use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const SKILL_MATCHERS: readonly (readonly [string, RegExp, RegExp | null])[] = [
  ...SKILL_ALIASES.entries(),
].map(([alias, name]) => {
  const pattern = `(^|[^\\p{L}\\p{N}+#.])${escapeRegExp(alias)}(?=$|[^\\p{L}\\p{N}+#]|\\.(?:\\s|$))`;
  // Ambiguous aliases must appear exactly as the canonical spelling in the original text ("Go", "Rust").
  const strict = AMBIGUOUS_ALIASES.includes(alias)
    ? new RegExp(`(^|[^\\p{L}\\p{N}+#.])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}+#]|\\.(?:\\s|$))`, "u")
    : null;
  return [name, new RegExp(pattern, "u"), strict] as const;
});

/** Skills the dictionary finds in a posting or CV text, canonical names in first-seen order (≤ 100). */
export function extractSkills(text: string): string[] {
  const folded = foldText(text);
  const found = new Map<string, number>();
  for (const [name, loose, strict] of SKILL_MATCHERS) {
    if (found.has(name)) continue;
    const match = strict === null ? loose.exec(folded) : strict.exec(text);
    if (match !== null) found.set(name, match.index);
  }
  return [...found.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name)
    .slice(0, 100);
}

/** Overlapping word 3-gram shingles of a text (description similarity for dedupe). */
export function shingles(text: string, size = 3): Set<string> {
  const words = foldText(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  const result = new Set<string>();
  for (let i = 0; i + size <= words.length && result.size < 5_000; i++) {
    result.add(words.slice(i, i + size).join(" "));
  }
  return result;
}

/** Jaccard similarity of two sets (0 when both are empty). */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Host (lower case), path and query parameters of an http(s) URL; core has no `URL` global. */
export function httpUrlParts(
  url: string,
): { host: string; pathname: string; query: Readonly<Record<string, string>> } | null {
  const match = /^https?:\/\/(?:[^@/?#]*@)?([^/?#:]+)(?::\d+)?([^?#]*)(?:\?([^#]*))?/i.exec(url.trim());
  if (match === null) return null;
  const query: Record<string, string> = {};
  for (const pair of (match[3] ?? "").split("&")) {
    const [key, value = ""] = pair.split("=");
    if (key === undefined || key === "") continue;
    try {
      query[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
      query[key] = value;
    }
  }
  return { host: (match[1] ?? "").toLowerCase(), pathname: match[2] === "" ? "/" : (match[2] ?? "/"), query };
}

/** Registrable-looking host of a URL without `www.` (`https://www.acme.com/jobs` → `acme.com`). */
export function hostOf(url: string): string | null {
  const host = httpUrlParts(url)?.host.replace(/^www\./, "");
  return host !== undefined && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
}
