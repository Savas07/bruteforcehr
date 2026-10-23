/**
 * Word lists for the grounding checker, in folded form (see `fold`): lower-case, no diacritics,
 * Turkish dotless/dotted i → `i`, `ß` → `ss`.
 */

/** Month names and abbreviations (EN, DE, TR) → month number. */
// prettier-ignore
export const MONTHS: Readonly<Record<string, number>> = {
  // English
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6,
  jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
  // German
  januar: 1, janner: 1, februar: 2, marz: 3, maerz: 3, mrz: 3, mai: 5, juni: 6, juli: 7,
  oktober: 10, okt: 10, dezember: 12, dez: 12,
  // Turkish (`mar` and `may` coincide with English and mean the same month)
  ocak: 1, oca: 1, subat: 2, sub: 2, mart: 3, nisan: 4, nis: 4, mayis: 5, haziran: 6, haz: 6,
  temmuz: 7, tem: 7, agustos: 8, agu: 8, eylul: 9, eyl: 9, ekim: 10, eki: 10, kasim: 11, kas: 11,
  aralik: 12, ara: 12,
};

/** Suffixes after a number: `€80k`, `1.2M`, `3,4 Mio.`, `2 milyon`, `3x` (no scale). */
// prettier-ignore
export const NUMBER_SCALES: Readonly<Record<string, number>> = {
  k: 1e3, bin: 1e3, tsd: 1e3, thousand: 1e3, tausend: 1e3,
  m: 1e6, mn: 1e6, mio: 1e6, million: 1e6, millionen: 1e6, milyon: 1e6,
  b: 1e9, bn: 1e9, mrd: 1e9, billion: 1e9, milliarde: 1e9, milliarden: 1e9, milyar: 1e9,
  x: 1,
};

/**
 * Number words that state a quantity (a fabricated "three engineers" is as bad as "3 engineers").
 * Words that double as other words are left out: en "one", de "ein(e)", tr "bir" (articles),
 * tr "on" (ten / English "on"), tr "yuz" (hundred / face), tr "dort" (four / German "there"),
 * tr "alti" (six / below), de "acht" (eight / attention).
 */
// prettier-ignore
export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, hundred: 100, hundreds: 100,
  thousands: 1000, dozen: 12, dozens: 12, twice: 2, double: 2, doubled: 2, tripled: 3, triple: 3,
  zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, neun: 9, zehn: 10, elf: 11, zwolf: 12,
  zwanzig: 20, hundert: 100, verdoppelt: 2, verdreifacht: 3,
  iki: 2, uc: 3, bes: 5, yedi: 7, sekiz: 8, dokuz: 9, yirmi: 20, elli: 50, ikiye: 2, katina: 2,
};

/**
 * Terms that may legitimately differ between source and output (translation, abbreviation): a
 * token in one of these groups is grounded when any member of its group occurs in the source.
 */
export const EQUIVALENT_TERMS: readonly (readonly string[])[] = [
  // Languages
  ["english", "englisch", "ingilizce"],
  ["german", "deutsch", "almanca"],
  ["turkish", "turkisch", "turkce"],
  ["french", "franzosisch", "fransizca"],
  ["spanish", "spanisch", "ispanyolca"],
  ["italian", "italienisch", "italyanca"],
  ["dutch", "niederlandisch", "hollandaca", "felemenkce"],
  ["russian", "russisch", "rusca"],
  ["arabic", "arabisch", "arapca"],
  ["portuguese", "portugiesisch", "portekizce"],
  ["polish", "polnisch", "lehce"],
  ["chinese", "chinesisch", "cince"],
  ["japanese", "japanisch", "japonca"],
  // Countries and regions
  ["germany", "deutschland", "almanya"],
  ["turkey", "turkiye", "turkei"],
  ["netherlands", "niederlande", "hollanda"],
  ["austria", "osterreich", "avusturya"],
  ["switzerland", "schweiz", "isvicre"],
  ["france", "frankreich", "fransa"],
  ["spain", "spanien", "ispanya"],
  ["italy", "italien", "italya"],
  ["poland", "polen", "polonya"],
  ["england", "ingiltere", "uk", "britain", "grossbritannien"],
  ["usa", "abd", "amerika", "america", "vereinigte"],
  ["europe", "europa", "avrupa", "eu"],
  ["european", "europaisch", "europaische", "europaischen", "avrupa"],
  // Cities with different exonyms
  ["munich", "munchen", "munih"],
  ["cologne", "koln"],
  ["vienna", "wien", "viyana"],
  ["nuremberg", "nurnberg"],
  ["hague", "haag", "lahey"],
  ["brussels", "brussel", "bruksel"],
  ["athens", "athen", "atina"],
  ["moscow", "moskau", "moskova"],
  // Degrees and institutions
  ["bachelor", "bachelors", "b.sc.", "bsc", "b.a.", "b.eng.", "beng", "lisans", "undergraduate"],
  ["master", "masters", "m.sc.", "msc", "m.a.", "m.eng.", "meng", "yuksek"],
  ["phd", "ph.d.", "doktora", "doctorate", "dr."],
  ["university", "universitat", "universitesi", "universite", "uni", "hochschule"],
  ["faculty", "fakultat", "fakultesi"],
  ["institute", "institut", "enstitusu"],
  ["department", "abteilung", "bolumu", "bolum"],
  ["technical", "technische", "teknik"],
];

/** Abbreviations with internal dots that are ordinary words, not entities. */
// prettier-ignore
export const COMMON_ABBREVIATIONS: Readonly<Record<string, true>> = {
  "e.g.": true, "i.e.": true, "etc.": true, "vs.": true, "ca.": true, "approx.": true, "z.b.": true,
  "u.a.": true, "d.h.": true, "bzw.": true, "ggf.": true, "inkl.": true, "usw.": true, "o.a.": true,
  "orn.": true, "vb.": true, "yb.": true, "bkz.": true,
};

/** Capitalized words that are not entities (pronoun, weekdays, "Present"-style date words). */
// prettier-ignore
export const COMMON_CAPITALIZED: Readonly<Record<string, true>> = {
  i: true, present: true, current: true, today: true, now: true, heute: true, aktuell: true,
  halen: true, gunumuz: true, devam: true, monday: true, tuesday: true, wednesday: true,
  thursday: true, friday: true, saturday: true, sunday: true,
};
