import { type Job, type JobSourceLink, jobSourceKey, type SalaryRange } from "../job";
import { jobExpiry, jobFingerprint, preferredApplyRoute } from "../jobs/dedupe";
import {
  decodeEntities,
  detectRemoteType,
  detectSeniority,
  extractSkills,
  foldText,
  htmlToText,
  httpUrlParts,
  parseLocation,
} from "../jobs/normalize";

/**
 * Job-alert emails → postings (docs/adr/0012-mail-sync.md, "Job alerts"). Deterministic: one
 * URL recognizer per job board (LinkedIn, Indeed, StepStone, Kariyer.net, XING, Glassdoor) plus a
 * generic "title — company — location + link" reading for other senders. Text and HTML bodies
 * (HTML links are kept as `<url>` after the link text). Pure.
 */

export const ALERT_BOARDS = ["linkedin", "indeed", "stepstone", "kariyer", "xing", "glassdoor"] as const;
export type AlertBoard = (typeof ALERT_BOARDS)[number];

/** Job source id of postings read from alert emails (`KNOWN_JOB_SOURCES`). */
export const ALERT_JOB_SOURCE = "alert_email";
/** Postings taken from one message at most. */
export const MAX_ALERT_POSTINGS = 50;

export interface AlertPosting {
  title: string;
  company: string;
  location: string | null;
  /** Canonical posting URL: tracking parameters and redirect wrappers removed. */
  url: string;
  postedAt: Date | null;
  salary: SalaryRange | null;
  /** Board the link points to; null for the generic reading. */
  board: AlertBoard | null;
}

export interface JobAlertInput {
  fromAddress: string;
  subject: string;
  /** Plain-text body (the text part, or the HTML converted). */
  text: string;
  /** HTML part when the message has one: its links are read too. */
  html: string | null;
  receivedAt: Date;
}

interface UrlParts {
  host: string;
  pathname: string;
  query: Readonly<Record<string, string>>;
}

interface BoardSpec {
  board: AlertBoard;
  sender: RegExp;
  /** Canonical posting URL, or null when the link is not a posting of this board. */
  canonical: (parts: UrlParts) => string | null;
  /** Card line order: Glassdoor shows the employer above the title. */
  companyFirst: boolean;
}

const BOARDS: readonly BoardSpec[] = [
  {
    board: "linkedin",
    sender: /(?:^|\.)linkedin\.com$/u,
    canonical: ({ host, pathname }) => {
      const id = /^\/(?:comm\/)?jobs\/view\/(?:[^/]*?-)?(\d{6,})\/?$/u.exec(pathname)?.[1];
      return /(?:^|\.)linkedin\.com$/u.test(host) && id !== undefined
        ? `https://www.linkedin.com/jobs/view/${id}`
        : null;
    },
    companyFirst: false,
  },
  {
    board: "indeed",
    sender: /(?:^|\.)indeed(?:email)?\.[a-z.]+$/u,
    canonical: ({ host, query }) => {
      const jk = query["jk"] ?? query["vjk"];
      const site = host.replace(/^(?:click|cts|engage)\./u, "www.");
      return /(?:^|\.)indeed\.[a-z.]+$/u.test(host) && jk !== undefined && /^[0-9a-f]{10,24}$/u.test(jk)
        ? `https://${site}/viewjob?jk=${jk}`
        : null;
    },
    companyFirst: false,
  },
  {
    board: "stepstone",
    sender: /(?:^|\.)stepstone\.[a-z]{2,3}$/u,
    canonical: ({ host, pathname }) =>
      /(?:^|\.)stepstone\.[a-z]{2,3}$/u.test(host) &&
      /^\/stellenangebote--[\w%-]+--\d+-inline\.html$/u.test(pathname)
        ? `https://${host.startsWith("www.") ? host : `www.${host}`}${pathname}`
        : null,
    companyFirst: false,
  },
  {
    board: "kariyer",
    sender: /(?:^|\.)kariyer\.net$/u,
    canonical: ({ host, pathname }) =>
      /(?:^|\.)kariyer\.net$/u.test(host) && /^\/is-ilani\/[\w%-]+-\d+\/?$/u.test(pathname)
        ? `https://www.kariyer.net${pathname.replace(/\/$/u, "")}`
        : null,
    companyFirst: false,
  },
  {
    board: "xing",
    sender: /(?:^|\.)xing\.com$/u,
    canonical: ({ host, pathname }) =>
      /(?:^|\.)xing\.com$/u.test(host) && /^\/jobs\/[\w%-]+-\d+\/?$/u.test(pathname)
        ? `https://www.xing.com${pathname.replace(/\/$/u, "")}`
        : null,
    companyFirst: false,
  },
  {
    board: "glassdoor",
    sender: /(?:^|\.)glassdoor\.[a-z.]+$/u,
    canonical: ({ host, pathname, query }) => {
      if (!/(?:^|\.)glassdoor\.[a-z.]+$/u.test(host)) return null;
      const id =
        /^\/job-listing\//u.test(pathname) || /^\/partner\/joblisting\.htm$/iu.test(pathname)
          ? (query["jl"] ?? query["jobListingId"])
          : undefined;
      return id !== undefined && /^\d{6,}$/u.test(id) ? `https://${host}/job-listing/j?jl=${id}` : null;
    },
    companyFirst: true,
  },
];

/** Query parameters that only track the click (removed from canonical URLs). */
const TRACKING_PARAM =
  /^(?:utm_\w+|trk\w*|trackingid|refid|ref|src|source|from|gclid|fbclid|msclkid|mc_[ce]id|lipi|midtoken|midsig|eid|otptoken|cid|campaign|_hs\w+|mkt_tok|alid|jrtk|sjdu|advn|vjs|cmp|rgtk|rcid|origin|ssid|sc_cid|cm_\w+|wt\.\w+|wt_mc|intcid|em|ao|guid|pos|ctt|clk|ea|tk|xing_share|share_\w+|stepstone_\w+)$/iu;

/** Links that are never postings (account, legal, images, meetings, scheduling, assessments). */
const NOT_A_POSTING =
  /unsubscribe|abmelden|abonelik|optout|opt-out|preferences|settings|einstellungen|ayarlar|privacy|datenschutz|gizlilik|\/help|\/hilfe|\/legal|impressum|\/terms|\/login|\/signin|\/account|\.(?:png|jpe?g|gif|svg|webp|css|js)(?:$|\?)|zoom\.us\/|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|calendly\.com|\/schedul|codility\.com|coderbyte\.com|hackerrank\.com|testgorilla\.com|github\.com/iu;

/** A posting link with tracking parameters removed (other parameters keep their order). */
function canonicalPostingUrl(url: string, board: BoardSpec | null): string | null {
  const parts = httpUrlParts(url);
  if (parts === null) return null;
  if (board !== null) return board.canonical(parts);
  for (const spec of BOARDS) {
    const canonical = spec.canonical(parts);
    if (canonical !== null) return canonical;
  }
  if (NOT_A_POSTING.test(url) || parts.pathname === "/" || parts.pathname === "") return null;
  const [base = "", rawQuery] = url.replace(/#.*$/u, "").split("?", 2);
  const kept = (rawQuery ?? "")
    .split("&")
    .filter((pair) => pair !== "" && !TRACKING_PARAM.test(decodeURIComponentSafe(pair.split("=")[0] ?? "")));
  return `${base.replace(/^http:/iu, "https:")}${kept.length > 0 ? `?${kept.join("&")}` : ""}`;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * HTML → text that keeps links: `<a href="U">T</a>` becomes `T <U>`, then `htmlToText`. Card-wide
 * anchors put the link after the card; title anchors put it on the title line.
 */
export function alertTextFromHtml(html: string): string {
  const linked = html.replace(
    /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/giu,
    (_match, _quote: string, href: string, inner: string) => {
      const url = decodeEntities(href).trim();
      return /^https?:\/\//iu.test(url) ? `${inner} &lt;${url.replace(/\s/gu, "%20")}&gt;` : inner;
    },
  );
  // The wrapper keeps `htmlToText` from decoding the `&lt;url&gt;` markers before stripping tags.
  return htmlToText(`<div>${linked}</div>`);
}

// ───────────────────────────── line classification ─────────────────────────────

/** Call-to-action and badge lines (folded, whole line). */
const NOISE_LINE =
  /^(?:apply(?: now)?|easy apply|easily apply|quick apply|view (?:job|details|posting)|see (?:job|details)|promoted|sponsored|gesponsert|sponsorlu|actively (?:recruiting|hiring)|be an early applicant|urgently hiring|hiring now|hiring multiple candidates|responsive employer|new|neu|yeni|top ?job|jetzt bewerben|schnellbewerbung|einfach bewerben|direkt bewerben|zum job|job ansehen|stelle ansehen|jetzt ansehen|mehr erfahren|ilani (?:gor|incele)\w*|hemen basvur|kolay basvuru|basvur|one cikan ilan|detaylar|details?|learn more|more jobs?|\d+ applicants?|\d+ bewerb\w*|\d+ basvuru\w*|[\d.,]+ ?★?|★+|•|-+|\|)$/u;

/** Header, footer and boilerplate lines (folded, anywhere in the line). */
const BOILERPLATE =
  /unsubscribe|abmelden|abonelik|you (?:are|were) receiving|you received|you're receiving|sie erhalten|diese e-?mail|bu e-?posta|privacy|datenschutz|gizlilik|copyright|©|all rights reserved|job alert|jobs? (?:similar|matching|like this|for you)|new jobs?|neue jobs|neue stellen|stellenangebote fur|yeni ilan|is ilan(?:i|lari) (?:sana|size)|see all|view all|alle (?:jobs|stellen)|tum ilanlar|manage alerts|your profile matches|profilinize uygun|your preferences|deine suche|ihre suche|aramaniza|based on your|^(?:hi|hello|hallo|merhaba|liebe|lieber|sehr geehrte)\b|^\d+ (?:new|neue|yeni)\b/u;

const MONTH_DATE = /\b(\d{1,2})[./](\d{1,2})[./](20\d\d)\b/u;

/** Posting age phrases → postedAt (EN/DE/TR; relative to receipt). */
export function postedAtOf(line: string, receivedAt: Date): Date | null {
  const folded = foldText(line).replace(
    /^(?:posted|veroffentlicht|yayinlandi|ilan tarihi|yayin tarihi|erschienen)(?: am| on)?[:\s]*/u,
    "",
  );
  const at = receivedAt.getTime();
  if (
    /^(?:just posted|today|posted today|heute|bugun|gerade (?:veroffentlicht|eingestellt)|just now)$/u.test(
      folded,
    )
  )
    return new Date(at);
  if (/^(?:yesterday|gestern|dun)$/u.test(folded)) return new Date(at - 86_400_000);
  const relative =
    /^(?:vor\s+)?(\d{1,3})\+?\s*(hours?|hrs?|h|stunden?|saat|days?|d|tag(?:en?)?|gun|weeks?|wochen?|hafta|months?|monat(?:en?)?|ay)(?:\s+(?:ago|once))?$/u.exec(
      folded,
    );
  if (relative !== null) {
    const unit = relative[2] ?? "";
    const hours = /^(?:hour|hr|h$|stunde|saat)/u.test(unit)
      ? 1
      : /^(?:day|d$|tag|gun)/u.test(unit)
        ? 24
        : /^(?:week|woche|hafta)/u.test(unit)
          ? 168
          : 720;
    return new Date(at - Number(relative[1]) * hours * 3_600_000);
  }
  const date = MONTH_DATE.exec(folded);
  if (date !== null && folded.length <= 12) {
    const value = new Date(Date.UTC(Number(date[3]), Number(date[2]) - 1, Number(date[1])));
    return Number.isNaN(value.getTime()) ? null : value;
  }
  return null;
}

const CURRENCIES: readonly (readonly [RegExp, string])[] = [
  [/€|\beur\b|\beuro\b/u, "EUR"],
  [/£|\bgbp\b/u, "GBP"],
  [/\$|\busd\b/u, "USD"],
  [/₺|\btl\b|\btry\b/u, "TRY"],
  [/\bchf\b/u, "CHF"],
];

function amount(raw: string, suffix: string | undefined): number | null {
  let digits = raw.replace(/\s/gu, "");
  if (/^\d{1,3}(?:[.,]\d{3})+$/u.test(digits)) digits = digits.replace(/[.,]/gu, "");
  else digits = digits.replace(",", ".");
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  return suffix === undefined ? value : value * 1_000;
}

/** A salary line ("€60,000 - €70,000 a year", "45.000 – 55.000 € pro Jahr", "35.000 TL / ay"). */
export function salaryOf(line: string): SalaryRange | null {
  const folded = line.toLowerCase();
  if (folded.length > 90) return null;
  const currency = CURRENCIES.find(([pattern]) => pattern.test(folded))?.[1];
  if (currency === undefined) return null;
  const values = [
    ...folded.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(k\b|bin\b|tsd\.?)?/gu),
  ].flatMap((match) => {
    const value = amount(match[1] ?? "", match[2]);
    return value === null ? [] : [value];
  });
  const [low, high] = values;
  if (low === undefined || values.length > 2) return null;
  const top = high ?? low;
  const period = /year|\byr\b|annual|jahr|jahrlich|jährlich|p\.\s?a\.|yıllık|yillik|\byıl\b/u.test(folded)
    ? "year"
    : /month|monat|\bay\b|aylık|aylik/u.test(folded)
      ? "month"
      : /hour|\bhr\b|stunde|saatlik|\bsaat\b/u.test(folded)
        ? "hour"
        : /\bday\b|\btag\b|günlük|gunluk/u.test(folded)
          ? "day"
          : top >= 20_000
            ? "year"
            : top >= 1_000
              ? "month"
              : "hour";
  return {
    min: Math.min(low, top),
    max: high === undefined ? null : Math.max(low, top),
    currency,
    period,
    estimated: /\best\.|estimate|geschätzt|geschatzt|tahmini/u.test(folded),
  };
}

// ───────────────────────────── segmentation ─────────────────────────────

type Entry =
  | { kind: "blank" }
  | { kind: "text"; text: string }
  | { kind: "job"; url: string; board: AlertBoard | null; residual: string };

const URL_IN_TEXT = /<?(https?:\/\/[^\s<>"'\])]+)>?/giu;

/** Text left on a link line once links and link labels are removed. */
function residualOf(line: string): string {
  return line
    .replace(URL_IN_TEXT, " ")
    .replace(/[<>]/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/[\s:–—-]+$/u, "")
    .replace(/^[\s:•–—-]+/u, "")
    .trim();
}

function entriesOf(text: string, board: BoardSpec | null): Entry[] {
  const entries: Entry[] = [];
  for (const raw of text.replace(/\r\n?/gu, "\n").split("\n")) {
    const line = raw.replace(/\u00a0/gu, " ").trim();
    if (line === "" || line.startsWith(">")) {
      entries.push({ kind: "blank" });
      continue;
    }
    let job: Entry | null = null;
    for (const match of line.matchAll(URL_IN_TEXT)) {
      const url = (match[1] ?? "").replace(/[.,;:!?]+$/u, "");
      const canonical = canonicalPostingUrl(url, board);
      if (canonical === null) continue;
      const parts = httpUrlParts(canonical);
      const owner =
        parts === null ? null : (BOARDS.find((spec) => spec.canonical(parts) !== null)?.board ?? null);
      job = { kind: "job", url: canonical, board: owner, residual: cleanResidual(residualOf(line)) };
      break;
    }
    if (job !== null) entries.push(job);
    else {
      const residual = residualOf(line);
      if (residual !== "") entries.push({ kind: "text", text: residual });
    }
  }
  return entries;
}

/** Link labels ("View job", "Zum Job") are not titles. */
function cleanResidual(residual: string): string {
  const folded = foldText(residual)
    .replace(/[:.!›»→]+$/u, "")
    .trim();
  const linkLabel =
    /^(?:view|see|open|apply|link|details|zum|zur|stelle|job|ilan|ilani|basvur|bewerben|ansehen|anzeigen|incele|gor)\b.{0,25}$/u;
  return folded === "" || NOISE_LINE.test(folded) || linkLabel.test(folded) ? "" : residual;
}

type LineKind = "field" | "salary" | "posted" | "noise";

function isNoise(line: string): boolean {
  const folded = foldText(line);
  return folded === "" || NOISE_LINE.test(folded) || folded.length > 140 || BOILERPLATE.test(folded);
}

function lineKind(line: string, receivedAt: Date): LineKind {
  if (isNoise(line)) return "noise";
  if (postedAtOf(line, receivedAt) !== null) return "posted";
  if (salaryOf(line) !== null && /\d/u.test(line)) return "salary";
  return "field";
}

interface Group {
  url: string;
  board: AlertBoard | null;
  /** Lines in order; `null` marks a blank line. */
  lines: (string | null)[];
}

type JobEntry = Extract<Entry, { kind: "job" }>;

/**
 * Cards of an alert, one per posting link. Links either close each card (text alerts, card-wide
 * HTML anchors) or open it (title links, logo + title links). With `companyFirst` and links on
 * the title, the employer line just above the title belongs to the card.
 */
function groupsOf(entries: readonly Entry[], companyFirst: boolean): { groups: Group[]; linkLast: boolean } {
  const first = entries.find((entry): entry is JobEntry => entry.kind === "job");
  if (first === undefined) return { groups: [], linkLast: false };
  const firstIndex = entries.indexOf(first);
  const previous = entries
    .slice(0, firstIndex)
    .findLast((entry) => entry.kind === "job" || (entry.kind === "text" && !isNoise(entry.text)));
  const next = entries.slice(firstIndex + 1).find((entry) => entry.kind !== "blank");
  const logoThenTitle = next?.kind === "job" && next.url === first.url && next.residual !== "";
  const linkLast = first.residual === "" && previous?.kind === "text" && !logoThenTitle;
  const groups: Group[] = [];
  let pending: (string | null)[] = [];
  let current = null as Group | null;
  for (const entry of entries) {
    if (entry.kind === "job") {
      if (linkLast) {
        if (groups.at(-1)?.url === entry.url && pending.every((line) => line === null)) continue;
        if (groups.some((group) => group.url === entry.url)) {
          pending = [];
          continue;
        }
        groups.push({
          url: entry.url,
          board: entry.board,
          lines: entry.residual === "" ? pending : [...pending, entry.residual],
        });
        pending = [];
      } else {
        if (current?.url === entry.url || groups.some((group) => group.url === entry.url)) {
          // A logo link before the title link: the title line names the card.
          if (
            current?.url === entry.url &&
            entry.residual !== "" &&
            !current.lines.some((line) => line !== null)
          )
            current.lines.push(entry.residual);
          continue;
        }
        const lead: string[] = [];
        if (companyFirst && entry.residual !== "") {
          const before = current?.lines ?? pending;
          const index = before.findLastIndex((line) => line !== null);
          const line = before[index];
          if (line !== undefined && line !== null && !isNoise(line)) {
            lead.push(line);
            before.splice(index, 1);
          }
        }
        current = {
          url: entry.url,
          board: entry.board,
          lines: entry.residual === "" ? lead : [...lead, entry.residual],
        };
        groups.push(current);
      }
    } else if (linkLast || current === null) {
      pending.push(entry.kind === "blank" ? null : entry.text);
    } else {
      current.lines.push(entry.kind === "blank" ? null : entry.text);
    }
  }
  if (linkLast && groups[0] !== undefined) {
    // The first card starts after the alert's header paragraph.
    const lines = groups[0].lines;
    const lastBlank = lines.lastIndexOf(null);
    const after = lines.slice(lastBlank + 1);
    if (lastBlank >= 0 && after.some((line) => line !== null)) groups[0].lines = after;
  }
  return { groups, linkLast };
}

function mostCommon(values: readonly number[]): number | null {
  const counts: Record<number, number> = {};
  let best: number | null = null;
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
    if (best === null || (counts[value] ?? 0) > (counts[best] ?? 0)) best = value;
  }
  return best;
}

const SEPARATOR = /\s+[·|•–—]\s+|\s+-\s+/u;

function postingOf(
  group: Group,
  spec: BoardSpec | null,
  receivedAt: Date,
  expected: number | null,
): AlertPosting | null {
  let fields: string[] = [];
  let salary: SalaryRange | null = null;
  let postedAt: Date | null = null;
  const classify = (line: string): void => {
    const kind = lineKind(line, receivedAt);
    if (kind === "posted") postedAt ??= postedAtOf(line, receivedAt);
    else if (kind === "salary") salary ??= salaryOf(line);
    else if (kind === "field") fields.push(line);
  };
  const lines = group.lines.filter((line): line is string => line !== null);
  const fieldLines = lines.filter((line) => lineKind(line, receivedAt) === "field");
  // One line holding the whole card: "Title – Company – Location – €60,000 a year – Just posted".
  if (fieldLines.length === 1) {
    const [line = ""] = fieldLines;
    const parts = line
      .split(SEPARATOR)
      .map((part) => part.trim())
      .filter((part) => part !== "");
    const at = /^(.{2,120}?)\s+(?:at|bei|@)\s+(.{1,120}?)(?:\s+\((.{2,80})\)|\s+(?:in)\s+(.{2,80}))?$/u.exec(
      line,
    );
    // Links outside the boards need the full "title — company — location" (or "title at company").
    if (group.board === null && parts.length < 3 && at === null) return null;
    for (const other of lines) if (other !== line) classify(other);
    if (parts.length >= 2) {
      for (const part of parts) classify(part);
    } else if (at !== null) {
      fields = [at[1] ?? "", at[2] ?? "", ...((at[3] ?? at[4]) ? [at[3] ?? at[4] ?? ""] : [])];
    } else {
      fields = [line];
    }
  } else if (group.board === null) {
    return null;
  } else {
    for (const line of lines) classify(line);
    if (expected !== null && fields.length > expected && expected >= 2) fields = fields.slice(0, expected);
  }
  if (spec?.companyFirst === true && fields.length >= 2 && lines.length > 1) {
    const [company = "", title = ""] = fields;
    fields = [title, company, ...fields.slice(2)];
  }
  if (fields.length === 2) {
    // "Company · Location" under the title.
    const [title = "", second = ""] = fields;
    const [company = "", ...rest] = second.split(SEPARATOR);
    fields = rest.length > 0 ? [title, company, rest.join(", ")] : [title, second];
  }
  const title = (fields[0] ?? "")
    .replace(/^(?:\d{1,2}[.)]\s+|[•*–—-]\s*)/u, "")
    .replace(/^(?:new|neu|yeni)\s*[:!-]\s*/iu, "")
    .trim();
  // Glassdoor-style ratings after the employer ("Harbor Analytics 4.2 ★").
  const company = (fields[1] ?? "")
    .replace(/\s*[-–·|]?\s*\d[.,]\d\s*★?\s*$/u, "")
    .replace(/\s*★+\s*$/u, "")
    .trim();
  const location = fields[2]?.trim() || null;
  if (title.length < 2 || title.length > 200 || company.length < 1 || company.length > 200) return null;
  // Sentences, questions and times are mail text, not card fields ("A.Ş." may end a company).
  const sentence = /[?!]|\d{1,2}[:.]\d{2}\b|[:,;]$/u;
  if (sentence.test(title) || /\.$/u.test(title) || sentence.test(company) || /https?:\/\//u.test(title))
    return null;
  if (BOILERPLATE.test(foldText(title))) return null;
  return {
    title,
    company,
    location: location === null ? null : location.slice(0, 300),
    url: group.url,
    postedAt,
    salary,
    board: group.board,
  };
}

function boardOfSender(address: string): BoardSpec | null {
  const domain = address.slice(address.lastIndexOf("@") + 1).toLowerCase();
  return BOARDS.find((spec) => spec.sender.test(domain)) ?? null;
}

function parseText(text: string, spec: BoardSpec | null, receivedAt: Date): AlertPosting[] {
  const { groups, linkLast } = groupsOf(entriesOf(text, spec), spec?.companyFirst ?? false);
  const fieldCounts = groups.map(
    (group) => group.lines.filter((line) => line !== null && lineKind(line, receivedAt) === "field").length,
  );
  const postings: AlertPosting[] = [];
  groups.forEach((group, index) => {
    // The first card (link last) or the last card (link first) can carry header/footer lines:
    // cards of one alert share a layout, so use the field count of the others.
    const others = fieldCounts.filter((_count, other) => other !== index);
    const expected = groups.length > 2 ? mostCommon(others) : null;
    const trimmed =
      expected !== null && linkLast && index === 0 && (fieldCounts[0] ?? 0) > expected
        ? { ...group, lines: lastFields(group.lines, expected, receivedAt) }
        : group;
    const posting = postingOf(trimmed, spec, receivedAt, expected);
    if (posting !== null) postings.push(posting);
  });
  return postings;
}

/** The lines of a card from its `keep`-th last field line on (drops the alert's header). */
function lastFields(lines: readonly (string | null)[], keep: number, receivedAt: Date): (string | null)[] {
  const result: (string | null)[] = [];
  let fields = 0;
  for (const line of [...lines].reverse()) {
    if (line !== null && lineKind(line, receivedAt) === "field") {
      if (fields >= keep) continue;
      fields += 1;
    }
    result.push(line);
  }
  return result.reverse();
}

/**
 * Postings of a job-alert email (≤ `MAX_ALERT_POSTINGS`, one per canonical URL). The sender picks
 * the board's link recognizer; other senders get the generic reading (any posting-like link with
 * a title and company next to it). With both a text and an HTML body, the one yielding more wins.
 */
export function parseJobAlert(input: JobAlertInput): AlertPosting[] {
  const spec = boardOfSender(input.fromAddress);
  const fromText = parseText(input.text, spec, input.receivedAt);
  const fromHtml =
    input.html === null ? [] : parseText(alertTextFromHtml(input.html), spec, input.receivedAt);
  const best = fromHtml.length > fromText.length ? fromHtml : fromText;
  const byUrl = new Map<string, AlertPosting>();
  for (const posting of best) if (!byUrl.has(posting.url)) byUrl.set(posting.url, posting);
  return [...byUrl.values()].slice(0, MAX_ALERT_POSTINGS);
}

/** The `jobs` draft of an alert posting: one `alert_email` source, aggregator listing, no description. */
export function alertPostingToJob(posting: AlertPosting, at: Date): Omit<Job, "id"> {
  const source: JobSourceLink = {
    source: ALERT_JOB_SOURCE,
    sourceId: null,
    url: posting.url,
    applyUrl: null,
    applyEmail: null,
    isDirectFromEmployer: false,
    title: posting.title,
    locationText: posting.location,
    salary: posting.salary,
    postedAt: posting.postedAt,
    firstSeenAt: at,
    lastSeenAt: at,
  };
  const locations = posting.location === null ? [] : [parseLocation(posting.location)];
  const remoteType = detectRemoteType(`${posting.location ?? ""} ${posting.title}`);
  return {
    sources: [source],
    sourceKeys: [jobSourceKey(source)],
    ...preferredApplyRoute([source]),
    company: posting.company,
    companyDomain: null,
    title: posting.title,
    locations,
    remoteType,
    remoteEligibility: null,
    employmentType: null,
    seniority: detectSeniority(posting.title),
    salary: posting.salary,
    visaSponsorship: null,
    relocationSupport: null,
    language: "und",
    description: "",
    skills: extractSkills(posting.title),
    postedAt: posting.postedAt,
    expiresAt: jobExpiry([source], null),
    fingerprint: jobFingerprint({
      company: posting.company,
      companyDomain: null,
      title: posting.title,
      locations,
      remoteType,
    }),
    createdAt: at,
    updatedAt: at,
  };
}
