import { foldText } from "../jobs/normalize";

/**
 * Name matching shared by the mail rules, the linker and the eval. Text is folded with the jobs
 * `foldText` (lower case, Turkish ı/İ and `ß` folded, diacritics removed, whitespace collapsed),
 * so one pattern list serves EN/TR/DE (`Başvurunuz` → `basvurunuz`, `Gespräch` → `gesprach`).
 */

/** Legal forms and filler words dropped before comparing company names. */
const COMPANY_NOISE: Readonly<Record<string, true>> = wordTable([
  "gmbh",
  "ag",
  "se",
  "kg",
  "ug",
  "co",
  "inc",
  "llc",
  "ltd",
  "limited",
  "plc",
  "corp",
  "corporation",
  "company",
  "bv",
  "nv",
  "sa",
  "sas",
  "srl",
  "as",
  "sti",
  "san",
  "tic",
  "ve",
  "group",
  "gruppe",
  "holding",
  "the",
  "careers",
  "career",
  "jobs",
  "recruiting",
  "recruitment",
  "talent",
  "hr",
  "team",
  "kariyer",
  "ik",
  "insan",
  "kaynaklari",
  "personal",
  "karriere",
]);

function wordTable(words: readonly string[]): Record<string, true> {
  return Object.fromEntries(words.map((word) => [word, true]));
}

/** Comparable company key: folded words without legal forms (`Kervan Teknoloji A.Ş.` → `kervan teknoloji`). */
export function companyKey(name: string): string {
  return foldText(name)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((word) => word.length > 0 && COMPANY_NOISE[word] !== true)
    .join(" ");
}

/** Same company: equal keys, or one key is a whole-word prefix of the other (`acme` ~ `acme robotics`). */
export function companiesMatch(a: string, b: string): boolean {
  const left = companyKey(a);
  const right = companyKey(b);
  if (left.length < 2 || right.length < 2) return false;
  if (left === right) return true;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return short.length >= 4 && (long.startsWith(`${short} `) || long.endsWith(` ${short}`));
}

/** Gender markers and seniority/format words that don't distinguish two roles. */
const ROLE_NOISE: Readonly<Record<string, true>> = wordTable([
  "m",
  "w",
  "d",
  "f",
  "x",
  "mwd",
  "fmx",
  "mfd",
  "wmd",
  "all",
  "genders",
  "a",
  "an",
  "the",
  "of",
  "for",
  "and",
  "und",
  "ve",
  "in",
  "at",
  "bei",
  "remote",
  "hybrid",
  "full",
  "time",
  "fulltime",
  "vollzeit",
  "teilzeit",
  "position",
  "role",
  "rolle",
  "stelle",
  "pozisyonu",
  "pozisyon",
  "als",
  "olarak",
]);

function roleWords(role: string): Set<string> {
  return new Set(
    foldText(role)
      .replace(/[^\p{L}\p{N}+#]+/gu, " ")
      .split(" ")
      .filter((word) => word.length > 0 && ROLE_NOISE[word] !== true),
  );
}

/**
 * Same role: at least two thirds of the shorter title's words occur in the other one
 * (`Backend Engineer (m/w/d)` ~ `Senior Backend Engineer`). Different specialisations
 * (`Frontend Engineer` vs `Backend Engineer`) do not match.
 */
export function rolesMatch(a: string, b: string): boolean {
  const left = roleWords(a);
  const right = roleWords(b);
  if (left.size === 0 || right.size === 0) return false;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size) >= 2 / 3;
}
