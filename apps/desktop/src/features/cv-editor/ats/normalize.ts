/**
 * Text normalisation for comparing CV facts and job keywords with what a parser read from the PDF:
 * case-, diacritic-, ligature-, quote- and whitespace-insensitive, with line-end hyphenation undone.
 */

/** Letters that don't decompose under NFD but read as their base letter. */
const BASE_LETTERS: Readonly<Record<string, string>> = {
  ı: "i",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
};

/**
 * Folds text to a comparison form: NFKC (ligatures ﬁ → fi, full-width forms), smart quotes and
 * dashes to ASCII, invisible characters dropped, lower case without diacritics, single spaces.
 * Line breaks survive (as `\n`) so headings can still be matched as lines.
 */
export function foldText(text: string): string {
  return (
    text
      .normalize("NFKC")
      .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
      .replace(/[\u2018\u2019\u201A\u201B\u2032\u0060\u00B4]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g, '"')
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\r\n?/g, "\n")
      // A word split at a line end ("Develop-\nment"); a capital after the break is a real compound.
      .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[ıßæœøłđðþ]/g, (letter) => BASE_LETTERS[letter] ?? letter)
      .replace(/[^\S\n]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .trim()
  );
}

/** No spaces, line breaks or hyphens: survives letter-spacing and odd line wrapping. */
const compact = (folded: string): string => folded.replace(/[\s-]+/g, "");

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Shorter needles only match as whole words; compact substring matching would over-match. */
const COMPACT_MIN_LENGTH = 6;

export interface MatchOptions {
  /** Letters allowed after the needle (inflection: "API" → "APIs", "yazılım" → "yazılımı"). */
  readonly suffixLetters?: number;
}

/** A folded view of extracted PDF text for repeated fact and keyword lookups. */
export class TextIndex {
  readonly folded: string;
  readonly #flat: string;
  readonly #compact: string;
  readonly #lines: ReadonlySet<string>;
  readonly #digitRuns: readonly string[];

  constructor(text: string) {
    this.folded = foldText(text);
    this.#flat = this.folded.replace(/\n/g, " ");
    this.#compact = compact(this.folded);
    this.#lines = new Set(this.folded.split("\n").map(compact));
    this.#digitRuns = (text.match(/\+?\d[\d\s().\-/]{4,}\d/g) ?? []).map((run) => run.replace(/\D/g, ""));
  }

  /** Whole-word match (boundaries are anything but a letter or digit), or a long compact match. */
  has(needle: string, { suffixLetters = 0 }: MatchOptions = {}): boolean {
    const folded = foldText(needle).replace(/\n/g, " ");
    if (folded === "") return true;
    const tail = suffixLetters > 0 ? `\\p{L}{0,${suffixLetters}}` : "";
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(folded)}${tail}(?![\\p{L}\\p{N}])`, "u");
    if (pattern.test(this.#flat)) return true;
    const key = compact(folded);
    return key.length >= COMPACT_MIN_LENGTH && this.#compact.includes(key);
  }

  /** A line that is the heading (letter-spacing and a trailing colon tolerated). */
  hasLine(heading: string): boolean {
    const key = compact(foldText(heading));
    return this.#lines.has(key) || this.#lines.has(`${key}:`);
  }

  /** A phone number, compared digit by digit ("+49 30 1234-5678" = "+49 (30) 12345678"). */
  hasPhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, "");
    return digits.length > 0 && this.#digitRuns.some((run) => run === digits || run.endsWith(digits));
  }

  /** Email addresses wrap or get spaced oddly; compare without whitespace. */
  hasEmail(email: string): boolean {
    const key = compact(foldText(email));
    return key.length > 0 && this.#compact.includes(key);
  }

  /** Whether the folded text (lines joined by spaces) is empty: nothing readable in the PDF. */
  get empty(): boolean {
    return this.#flat === "";
  }
}
