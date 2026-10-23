/**
 * Grounding checker (BRIEF §2.4: AI never invents content). Every number, date and entity in a
 * model's output must appear in the source text the model was given; otherwise the caller rejects
 * the output or replaces the value with a placeholder (`[X]`, `[X%]`, `[date]`).
 *
 * Deterministic and language-aware (EN/TR/DE): text is folded (case, diacritics, Turkish i),
 * numbers compare by value across `1,500` / `1.500` / `1.5k` notations, dates compare at the
 * precision the output claims (a month the source never states is a fabrication), and entities are
 * tokens that look like names: acronyms, CamelCase, tech tokens (`Node.js`, `C++`, `S3`), emails,
 * URLs and, where the language allows, capitalized words in mid-sentence.
 */
import {
  COMMON_ABBREVIATIONS,
  COMMON_CAPITALIZED,
  EQUIVALENT_TERMS,
  MONTHS,
  NUMBER_SCALES,
  NUMBER_WORDS,
} from "./terms";

/** Lower-case, no diacritics, Turkish İ/I/ı → i, ß → ss, unified quotes and dashes, single spaces. */
export function fold(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[İIı]/g, "i")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[\s\u00a0\u202f]+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------------------------------------
 * Dates
 * ---------------------------------------------------------------------------------------------- */

/** A date at the precision written: `2020`, `2020-03` or `2020-03-15`. */
export type DateKey = string;

interface Span {
  start: number;
  end: number;
}

interface DateMention extends Span {
  /** Readings of the mention (`03/04/2020` is ambiguous between EU and US order). */
  keys: DateKey[];
}

const MIN_YEAR = 1950;
const MAX_YEAR = 2099;
const pad = (n: number): string => String(n).padStart(2, "0");

function dateKey(year: number, month?: number, day?: number): DateKey | undefined {
  if (year < MIN_YEAR || year > MAX_YEAR) return undefined;
  if (month === undefined) return String(year);
  if (month < 1 || month > 12) return undefined;
  if (day === undefined) return `${year}-${pad(month)}`;
  if (day < 1 || day > 31) return undefined;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const MONTH_ALTERNATION = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|");

/** Patterns over folded text, most specific first; matched spans are consumed. */
const DATE_PATTERNS: readonly { regex: RegExp; read: (m: RegExpExecArray) => (DateKey | undefined)[] }[] = [
  {
    // 2020-03-15, 2020-03, 2020/03
    regex: /(?<!\d)(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?(?!\d)/g,
    read: (m) => [dateKey(Number(m[1]), Number(m[2]), m[3] === undefined ? undefined : Number(m[3]))],
  },
  {
    // 15.03.2020, 15/03/2020, 03/15/2020 (both orders when ambiguous)
    regex: /(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/g,
    read: (m) => {
      const [a, b, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return [dateKey(year, b, a), dateKey(year, a, b)];
    },
  },
  {
    // 03/2020, 3.2020, 03-2020
    regex: /(?<!\d)(\d{1,2})[./-](\d{4})(?!\d)/g,
    read: (m) => [dateKey(Number(m[2]), Number(m[1]))],
  },
  {
    // 15 March 2020, 15. März 2020, March 15, 2020, Mar. 2020, Ocak 2020, March '20 is not supported.
    regex: new RegExp(
      `(?<![\\p{L}\\d])(?:(\\d{1,2})\\.?\\s*)?(${MONTH_ALTERNATION})\\.?(?![\\p{L}])\\s*(?:(\\d{1,2}),?\\s+)?(\\d{4})(?!\\d)`,
      "gu",
    ),
    read: (m) => {
      const month = MONTHS[m[2] ?? ""];
      const day = m[1] ?? m[3];
      return [dateKey(Number(m[4]), month, day === undefined ? undefined : Number(day))];
    },
  },
  {
    // A bare year: 2019
    regex: /(?<![\d.,])(19[5-9]\d|20\d\d)(?![\d]|[.,]\d)/g,
    read: (m) => [dateKey(Number(m[1]))],
  },
];

function findDates(folded: string): DateMention[] {
  const mentions: DateMention[] = [];
  const taken: Span[] = [];
  const overlaps = (start: number, end: number): boolean =>
    taken.some((span) => start < span.end && end > span.start);
  for (const { regex, read } of DATE_PATTERNS) {
    regex.lastIndex = 0;
    for (let m = regex.exec(folded); m !== null; m = regex.exec(folded)) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const keys = read(m).filter((key): key is DateKey => key !== undefined);
      if (keys.length === 0) continue;
      mentions.push({ start, end, keys });
      taken.push({ start, end });
    }
  }
  return mentions.sort((a, b) => a.start - b.start);
}

/** All precisions a date key implies: `2020-03-15` → itself, `2020-03`, `2020`. */
function withCoarser(key: DateKey): DateKey[] {
  const parts = key.split("-");
  return parts.map((_, i) => parts.slice(0, i + 1).join("-"));
}

/* ------------------------------------------------------------------------------------------------
 * Numbers
 * ---------------------------------------------------------------------------------------------- */

interface NumberMention extends Span {
  /** Canonical values (`1.500` → 1500 and 1.5; `2k` → 2 and 2000). */
  values: string[];
  percent: boolean;
}

const SCALE_ALTERNATION = Object.keys(NUMBER_SCALES)
  .sort((a, b) => b.length - a.length)
  .join("|");
// Groups: 1 leading percent (Turkish `%18`), 2 digits, 3 scale suffix, 4 trailing percent. Only the
// German abbreviations (`Mio.`, `Mrd.`, `Tsd.`) take their period along.
const NUMBER_REGEX = new RegExp(
  `(?<![\\p{L}\\d])(%\\s?)?(\\d+(?:[.,]\\d+|\\s\\d{3}(?!\\d))*)(?:\\s?(${SCALE_ALTERNATION})(?:(?<=mio|mrd|tsd)\\.)?(?![\\p{L}]))?(\\s?%)?(?![\\p{L}\\d])`,
  "gu",
);

const canonical = (value: number): string => String(Number(value.toPrecision(12)));

/** Readings of a digit run with separators, e.g. `1.500` (1500 or 1.5) or `2 019` (2019). */
function numberReadings(raw: string): number[] {
  const groups = raw.split(/[.,\s]/);
  if (groups.length === 1) return [Number(raw)];
  const readings: number[] = [];
  const [head = "", ...rest] = groups;
  if (head.length <= 3 && rest.every((group) => group.length === 3)) readings.push(Number(groups.join("")));
  if (groups.length === 2 && !/\s/.test(raw)) readings.push(Number(`${head}.${rest[0]}`));
  // Separate numbers that merely sit next to each other ("2 4"), or a version string ("1.2.3").
  if (readings.length === 0) readings.push(...groups.map(Number));
  return readings;
}

function findNumbers(folded: string, skip: readonly Span[]): NumberMention[] {
  const mentions: NumberMention[] = [];
  NUMBER_REGEX.lastIndex = 0;
  for (let m = NUMBER_REGEX.exec(folded); m !== null; m = NUMBER_REGEX.exec(folded)) {
    const start = m.index;
    const end = start + m[0].length;
    if (skip.some((span) => start < span.end && end > span.start)) continue;
    const scale = m[3] === undefined ? 1 : (NUMBER_SCALES[m[3]] ?? 1);
    const values = new Set<string>();
    for (const reading of numberReadings(m[2] ?? "")) {
      values.add(canonical(reading));
      if (scale !== 1) values.add(canonical(reading * scale));
    }
    mentions.push({ start, end, values: [...values], percent: m[1] !== undefined || m[4] !== undefined });
  }
  for (const word of folded.matchAll(/\p{L}+/gu)) {
    const value = NUMBER_WORDS[word[0]];
    if (value === undefined) continue;
    const start = word.index;
    mentions.push({ start, end: start + word[0].length, values: [canonical(value)], percent: false });
  }
  return mentions.sort((a, b) => a.start - b.start);
}

/* ------------------------------------------------------------------------------------------------
 * Entities
 * ---------------------------------------------------------------------------------------------- */

interface Token extends Span {
  /** Token as written, without surrounding punctuation or a Turkish case suffix (`Siemens'te`). */
  text: string;
  sentenceStart: boolean;
}

const EMAIL_REGEX = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu;
const URL_REGEX =
  /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+|\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|org|net|io|dev|app|de|tr|eu|uk|co|me|ai)(?:\/[^\s<>"')\]]*)?/giu;

/** Splits on whitespace; strips wrapping punctuation and Turkish suffixes after an apostrophe. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(/\S+/gu)) {
    let word = m[0];
    let start = m.index;
    const lead = /^[([{"'“„«‚‘*•▪●–—-]+/u.exec(word)?.[0].length ?? 0;
    word = word.slice(lead);
    start += lead;
    word = word.replace(/[)\]}"'”»’,;:!?]+$/u, "");
    // A trailing period ends the sentence unless the token is an abbreviation (`z.B.`, `B.Sc.`).
    if (word.endsWith(".") && !/\p{L}\.\p{L}+\.$/u.test(word) && !(fold(word) in COMMON_ABBREVIATIONS)) {
      word = word.slice(0, -1);
    }
    word = word.replace(/^(.+?)['’]\p{Ll}{1,6}$/u, "$1");
    if (word.length === 0) continue;
    const before = text.slice(0, start).trimEnd();
    const sentenceStart =
      before.length === 0 || /[.!?:;•▪●\n\r*–—-]$/u.test(before) || /\n\s*$/.test(text.slice(0, start));
    tokens.push({ text: word, start, end: start + word.length, sentenceStart });
  }
  return tokens;
}

export type EntityPolicy =
  /** Acronyms, CamelCase, alphanumeric and tech tokens, emails, URLs. */
  | "hard"
  /** `hard` plus capitalized words in mid-sentence (English and Turkish, where nouns are lower-case). */
  | "hard+capitalized";

function isHardEntity(token: string): boolean {
  if (fold(token) in COMMON_ABBREVIATIONS) return false;
  const hasLetter = /\p{L}/u.test(token);
  if (!hasLetter) return false;
  if (/\p{N}/u.test(token)) return true;
  if (/^.+\p{Lu}/u.test(token)) return true;
  return /[\p{L}\p{N}][.+#@_][\p{L}\p{N}]|[\p{L}][+#]+$/u.test(token);
}

function isCapitalizedWord(token: Token): boolean {
  return (
    !token.sentenceStart && /^\p{Lu}\p{Ll}+$/u.test(token.text) && !(fold(token.text) in COMMON_CAPITALIZED)
  );
}

/* ------------------------------------------------------------------------------------------------
 * Source index
 * ---------------------------------------------------------------------------------------------- */

/** Everything the checker needs from the source text, computed once per request. */
export class GroundingSource {
  readonly folded: string;
  /** Folded text with every non-letter/digit run collapsed to one space, padded with spaces. */
  readonly loose: string;
  private readonly dates = new Set<DateKey>();
  private readonly numbers = new Set<string>();
  private readonly words = new Set<string>();
  private readonly emails = new Set<string>();
  private readonly phoneDigits: string[] = [];

  constructor(text: string) {
    this.folded = fold(text);
    this.loose = ` ${this.folded.replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
    const dates = findDates(this.folded);
    for (const mention of dates)
      for (const key of mention.keys) for (const k of withCoarser(key)) this.dates.add(k);
    for (const mention of findNumbers(this.folded, dates))
      for (const value of mention.values) this.numbers.add(value);
    // Years also count as plain numbers ("founded in 2019" vs "2019 founders" are rare; years are dates).
    for (const mention of dates)
      for (const key of mention.keys) this.numbers.add(String(Number(key.slice(0, 4))));
    for (const token of tokenize(this.folded)) {
      this.words.add(token.text);
      for (const part of token.text.split(/[^\p{L}\p{N}]+/u)) if (part.length > 0) this.words.add(part);
    }
    for (const m of this.folded.matchAll(EMAIL_REGEX)) this.emails.add(m[0]);
    for (const m of text.matchAll(/\+?\d[\d\s().\-/]{5,}\d/g)) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length >= 7) this.phoneDigits.push(digits);
    }
  }

  hasDate(key: DateKey): boolean {
    return this.dates.has(key);
  }

  hasNumber(values: readonly string[]): boolean {
    return values.some((value) => this.numbers.has(value));
  }

  hasEmail(email: string): boolean {
    return this.emails.has(fold(email));
  }

  /** Same number when the last 9 digits match (`0532 555 12 34` = `+90 532 555 12 34`). */
  hasPhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) return false;
    const tail = digits.slice(-9);
    return this.phoneDigits.some((source) => source.slice(-9) === tail || source.includes(digits));
  }

  /** The phrase occurs in the source, ignoring case, diacritics, punctuation and spacing. */
  hasPhrase(phrase: string): boolean {
    const loose = fold(phrase)
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    return loose.length > 0 && this.loose.includes(` ${loose} `);
  }

  hasWord(word: string): boolean {
    return this.words.has(fold(word));
  }

  /**
   * An entity token is grounded when it occurs as a word or phrase, in singular/genitive form,
   * through an equivalent term (translation, degree abbreviation), or as a stem (≥ 5 letters) of
   * a source word, which covers Turkish and German inflection.
   */
  hasEntity(token: string): boolean {
    const folded = fold(token);
    if (this.words.has(folded) || this.hasPhrase(token)) return true;
    const singular = folded.replace(/(?:'s|es|s)$/u, "");
    if (singular.length >= 2 && (this.words.has(singular) || this.hasPhrase(singular))) return true;
    for (const group of EQUIVALENT_TERMS) {
      if (group.includes(folded) && group.some((term) => this.hasPhrase(term))) return true;
    }
    const lettersOnly = /^\p{L}+$/u.test(folded);
    if (lettersOnly && folded.length >= 6) {
      const stem = folded.slice(0, Math.max(5, folded.length - 2));
      for (const word of this.words) if (word.startsWith(stem)) return true;
    }
    return false;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Checking output
 * ---------------------------------------------------------------------------------------------- */

export type GroundingIssueKind = "number" | "date" | "entity";

export interface GroundingIssue extends Span {
  kind: GroundingIssueKind;
  /** The offending text as written in the output (for tests and evals; never logged). */
  text: string;
  /** Number written as a percentage (`35%`, `%35`), for the `[X%]` placeholder. */
  percent?: boolean;
}

/** Placeholders the assists may write; their content is never checked. */
const PLACEHOLDER_REGEX = /\[[^[\]\n]{0,40}\]/g;

/**
 * Character map from folded text back to the original: folding can change length (`ß` → `ss`,
 * NFKC ligatures), so spans are found on a per-character fold of the original string.
 */
function foldWithMap(text: string): { folded: string; origin: number[] } {
  let folded = "";
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const piece = /\s/u.test(char) ? " " : fold(char);
    for (let i = 0; i < piece.length; i++) origin.push(index);
    folded += piece;
    index += char.length;
  }
  origin.push(text.length);
  return { folded, origin };
}

export interface CheckOptions {
  entities: EntityPolicy;
}

/** Every number, date and entity in `output` that the source does not contain. */
export function findUngrounded(
  output: string,
  source: GroundingSource,
  options: CheckOptions,
): GroundingIssue[] {
  const issues: GroundingIssue[] = [];
  const placeholders = [...output.matchAll(PLACEHOLDER_REGEX)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  const inPlaceholder = (span: Span): boolean =>
    placeholders.some((p) => span.start < p.end && span.end > p.start);
  const { folded, origin } = foldWithMap(output);
  const toOriginal = (span: Span): Span => ({
    start: origin[span.start] ?? 0,
    end: origin[span.end] ?? output.length,
  });

  // Emails and URLs first: their digits and dots are not numbers or tech tokens.
  const consumed: Span[] = [];
  for (const m of output.matchAll(EMAIL_REGEX)) {
    const span = { start: m.index, end: m.index + m[0].length };
    consumed.push(span);
    if (!source.hasEmail(m[0])) issues.push({ kind: "entity", text: m[0], ...span });
  }
  for (const m of output.matchAll(URL_REGEX)) {
    const span = { start: m.index, end: m.index + m[0].length };
    if (consumed.some((c) => span.start < c.end && span.end > c.start)) continue;
    consumed.push(span);
    const bare = m[0]
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "");
    if (!source.hasPhrase(bare)) issues.push({ kind: "entity", text: m[0], ...span });
  }
  const isConsumed = (span: Span): boolean =>
    inPlaceholder(span) || consumed.some((c) => span.start < c.end && span.end > c.start);

  const dates = findDates(folded);
  for (const mention of dates) {
    const span = toOriginal(mention);
    if (isConsumed(span)) continue;
    // A bare year also matches a plain number ("2000 users" vs "2,000 users").
    const grounded = mention.keys.some(
      (key) => source.hasDate(key) || (key.length === 4 && source.hasNumber([String(Number(key))])),
    );
    if (!grounded) {
      issues.push({ kind: "date", text: output.slice(span.start, span.end), ...span });
    }
  }
  for (const mention of findNumbers(folded, dates)) {
    const span = toOriginal(mention);
    if (isConsumed(span)) continue;
    if (!source.hasNumber(mention.values)) {
      issues.push({
        kind: "number",
        text: output.slice(span.start, span.end),
        percent: mention.percent,
        ...span,
      });
    }
  }

  for (const whole of tokenize(output)) {
    if (inPlaceholder(whole) || consumed.some((c) => whole.start < c.end && whole.end > c.start)) continue;
    // Compounds are checked per part: German `Kubernetes-Cluster`, `KPI-Projekten`, `GPT-4`.
    const parts: Token[] = [];
    let offset = 0;
    for (const part of whole.text.split(/(?<=[\p{L}\p{N}])-(?=[\p{L}\p{N}])/u)) {
      const start = whole.start + offset;
      parts.push({
        text: part,
        start,
        end: start + part.length,
        sentenceStart: whole.sentenceStart && offset === 0,
      });
      offset += part.length + 1;
    }
    for (const token of parts) {
      // Numbers and dates were checked above, with their currency, scale and percent signs.
      if (/^[€$£₺%]?[\d.,/-]+(?:k|m|mn|bn|mio|mrd|x)?%?$/iu.test(token.text)) continue;
      if (fold(token.text) in MONTHS || fold(token.text) in NUMBER_WORDS) continue;
      if (issues.some((issue) => token.start >= issue.start && token.end <= issue.end)) continue;
      const checked =
        isHardEntity(token.text) || (options.entities === "hard+capitalized" && isCapitalizedWord(token));
      // A compound grounded as a whole (`Ar-Ge`) is fine even if a part alone is not a source word.
      if (checked && !source.hasEntity(token.text) && !source.hasEntity(whole.text)) {
        issues.push({ kind: "entity", text: token.text, start: token.start, end: token.end });
      }
    }
  }
  return issues.sort((a, b) => a.start - b.start);
}

export interface PlaceholderRepair {
  /** Output with ungrounded numbers and dates replaced by placeholders. */
  text: string;
  /** Issues fixed with a placeholder. */
  replaced: GroundingIssue[];
  /** Ungrounded entities: the output must be rejected (a placeholder would hide a fabricated name). */
  rejected: GroundingIssue[];
}

/**
 * Replaces ungrounded numbers with `[X]`/`[X%]` and ungrounded dates with `[date]`, normalizes
 * free-form placeholders the model wrote (`[team size]`, `[e.g. 20%]`) to the same set, and
 * reports ungrounded entities, which cannot be repaired.
 */
export function repairWithPlaceholders(
  output: string,
  source: GroundingSource,
  options: CheckOptions,
): PlaceholderRepair {
  const issues = findUngrounded(output, source, options);
  const replaced = issues.filter((issue) => issue.kind !== "entity");
  const rejected = issues.filter((issue) => issue.kind === "entity");
  let text = output;
  for (const issue of [...replaced].sort((a, b) => b.start - a.start)) {
    let { start, end } = issue;
    // Take a currency sign or a trailing percent sign with the number.
    while (start > 0 && /[€$£₺]/u.test(text[start - 1] ?? "")) start--;
    if (text[end] === "%") end++;
    const placeholder = issue.kind === "date" ? "[date]" : issue.percent === true ? "[X%]" : "[X]";
    text = text.slice(0, start) + placeholder + text.slice(end);
  }
  text = text.replace(PLACEHOLDER_REGEX, (match) => {
    if (match === "[X]" || match === "[X%]" || match === "[date]") return match;
    if (match.includes("%")) return "[X%]";
    if (/date|datum|tarih|year|jahr|yil|month|monat|ay\]/iu.test(match)) return "[date]";
    return "[X]";
  });
  return { text, replaced, rejected };
}
