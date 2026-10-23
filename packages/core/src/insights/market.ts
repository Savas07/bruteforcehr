/**
 * The Insights "Market" of an application (decisions.md D30): the country its `location` names, or
 * `remote`. Locations are free text ("Istanbul (hybrid)", "München", "Remote (Europe)"), so this is
 * a keyword match over the target markets (kickoff §0) and their main cities. A named place wins
 * over "remote" ("Dublin or remote (EU)" → IE). Unknown places return null.
 */

/** ISO 3166-1 alpha-2 country code, or `remote`. */
export type Market = string;

export const REMOTE_MARKET = "remote";

/** Keywords per market, already folded (lowercase, no diacritics). Multi-word keywords match as phrases. */
export const MARKET_KEYWORDS: Readonly<Record<Market, readonly string[]>> = {
  TR: [
    "turkey",
    "turkiye",
    "istanbul",
    "ankara",
    "izmir",
    "bursa",
    "antalya",
    "kocaeli",
    "kadikoy",
    "maslak",
  ],
  DE: [
    "germany",
    "deutschland",
    "berlin",
    "munchen",
    "munich",
    "hamburg",
    "frankfurt",
    "koln",
    "cologne",
    "stuttgart",
    "dusseldorf",
    "leipzig",
    "karlsruhe",
  ],
  NL: [
    "netherlands",
    "nederland",
    "amsterdam",
    "rotterdam",
    "utrecht",
    "eindhoven",
    "the hague",
    "den haag",
    "delft",
  ],
  GB: [
    "united kingdom",
    "uk",
    "england",
    "scotland",
    "wales",
    "london",
    "manchester",
    "leeds",
    "edinburgh",
    "bristol",
    "cambridge",
    "oxford",
    "birmingham",
    "glasgow",
  ],
  US: [
    "united states",
    "usa",
    "us",
    "new york",
    "nyc",
    "san francisco",
    "seattle",
    "boston",
    "austin",
    "chicago",
    "los angeles",
  ],
  IE: ["ireland", "dublin", "cork"],
  ES: ["spain", "espana", "barcelona", "madrid", "valencia"],
  FR: ["france", "paris", "lyon"],
  PT: ["portugal", "lisbon", "lisboa", "porto"],
  PL: ["poland", "warsaw", "krakow"],
  AT: ["austria", "vienna", "wien"],
  CH: ["switzerland", "zurich", "geneva", "basel"],
  SE: ["sweden", "stockholm"],
  DK: ["denmark", "copenhagen"],
  BE: ["belgium", "brussels", "antwerp"],
};

/** Checked in this order, so the result is the same on every platform. */
export const MARKET_ORDER: readonly Market[] = Object.keys(MARKET_KEYWORDS);

export const REMOTE_KEYWORDS: readonly string[] = [
  "remote",
  "uzaktan",
  "fernarbeit",
  "home office",
  "anywhere",
  "worldwide",
];

/**
 * Lowercase ASCII-ish words separated by single spaces and padded with one space on each side:
 * diacritics are removed (NFD, combining marks dropped: "İstanbul" → "istanbul", "München" →
 * "munchen"), every run of characters other than a–z / 0–9 becomes one space.
 */
export function foldLocation(text: string): string {
  const folded = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ` ${folded} `;
}

/** The market of an application's `location`; null when no known place or remote keyword appears. */
export function marketOf(location: string | null): Market | null {
  if (location === null) return null;
  const folded = foldLocation(location);
  for (const market of MARKET_ORDER) {
    if (MARKET_KEYWORDS[market]?.some((keyword) => folded.includes(` ${keyword} `))) return market;
  }
  return REMOTE_KEYWORDS.some((keyword) => folded.includes(` ${keyword} `)) ? REMOTE_MARKET : null;
}
