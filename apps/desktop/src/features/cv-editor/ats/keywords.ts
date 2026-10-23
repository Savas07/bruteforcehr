/**
 * Candidate keywords from a pasted job description: tech-like tokens ("C#", "Node.js", "CI/CD"),
 * capitalised terms and repeated words or word pairs, minus stopwords and job-ad filler in English,
 * Turkish and German (a posting's language needn't match the CV's, so all three lists apply).
 * Deterministic and offline, so coverage updates while the user types.
 */
import type { CvLanguage } from "@bfhr/cv-render";
import { foldText } from "./normalize";

export interface JobKeyword {
  /** As written in the job description (first occurrence). */
  readonly keyword: string;
  /** Times it appears in the job description. */
  readonly count: number;
}

const STOPWORDS_EN = `a about above after again against all also an and any are as at be because been before being
below between both but by can could did do does doing down during each either etc few for from further had has have
having he her here hers him his how i if in into is it its itself just may me might more most must my no nor not now
of off on once only or other our ours out over own per same shall she should so some such than that the their them
then there these they this those through to too under until up upon very via was we were what when where which while
who whom why will with within without would yet you your yours
ability able across apply applicant applicants benefits candidate candidates career company competitive day days
degree description desired develop developing environment equal excellent experience experienced familiarity
flexible full good great help highly ideal ideally including job join knowledge least level like looking make new
nice offer offers office opportunity opportunities option plus position preferred previous proven related required
requirement requirements responsibilities responsible role salary skill skills solid strong team teams time understanding
using well work working world year years`;

const STOPWORDS_TR = `acaba ama ancak artık aslında az bana bazı belki ben benim beri bile bir biraz birçok biri birkaç
biz bize bizi bizim bu buna bunda bundan bunlar bunları bunların bunu bunun burada çok çünkü da daha de defa diye
diğer gibi göre hem hep hepsi her hiç için ile ise kadar katkı ki kim mi mu mü nasıl ne neden nerede niye o olan
olarak oldu olduğu olmak olmalı olup olur on ona ondan onlar onu onun öyle sadece siz şey şu tüm ve veya ya yani
adayın adaylar aday alanında aranan arıyoruz avantaj avantajlı başvuru beklenen bilgi bilgisi birlikte çalışacak
çalışma deneyim deneyimi deneyimli ekibimize ekip en etmek firma görev güçlü iletişim imkanı ilgili iş işe
konusunda olanak pozisyon sağlamak sahip şirket tercih tercihen tecrübe tecrübeli yetkinlik yıl yıllık`;

const STOPWORDS_DE = `aber alle allem allen aller alles als also am an andere anderen auch auf aus bei beim bin bis
bist da damit dann das dass dein deine dem den der des dich die dies diese diesem diesen dieser dir doch dort du
durch ein eine einem einen einer eines er es etwa euch euer für gegen hat hatte hier ich ihr ihre im in ist ja jede
jedem jeden jeder kann kein keine mich mir mit muss nach nicht noch nur ob oder ohne sehr sein seine sich sie sind
so sollte soll über um und uns unser unsere unter vom von vor war was weil wenn wer werden wie wir wird wo zu zum
zur zwischen
abgeschlossenes aufgaben bereich bewerbung bieten bietest bringst du erfahrung erfahrungen erste flexible gute
gutes idealerweise jahre jahren kenntnisse kollegen mitarbeiter möglichkeit profil sehr sicherer stelle team
tätigkeit unternehmen vorteil wünschenswert`;

/** Folded, so lookups ignore case and diacritics like the matching does. */
const STOPWORDS: ReadonlySet<string> = new Set(
  [STOPWORDS_EN, STOPWORDS_TR, STOPWORDS_DE].flatMap((list) => foldText(list).split(/\s+/)),
);

/**
 * A word: starts with a letter, digit or "." (".NET"), may contain the joiners of tech names
 * (Node.js, CI/CD, C++, C#, R&D, front-end) and ends with a letter, digit, "+" or "#".
 */
const TOKEN = /\.?[\p{L}\p{N}](?:[\p{L}\p{N}+#./&'’-]*[\p{L}\p{N}+#])?/gu;

/** Ends a sentence: the next capitalised word may just be the sentence start. */
const SENTENCE_BREAK = /[!?:\n•·|]|\.(?:\s|$)/u;

/** Anything but spaces between two words (comma, bracket, slash, ampersand) splits a word pair. */
const PAIR_GAP = /^\s+$/u;

/** "e.g", "z.B", "i.e": abbreviations, not tech names. */
const ABBREVIATION = /^(?:\p{L}\.)+\p{L}?$/u;

/** Slash-joined acronyms that name one thing: CI/CD, UI/UX, TCP/IP, B2B/B2C. */
const ACRONYM_PAIR = /^[\p{Lu}\d]{1,5}(?:\/[\p{Lu}\d]{1,5})+$/u;

/** "Docker's", "Python'da": the suffix after an apostrophe isn't part of the term. */
const stripApostropheSuffix = (token: string): string => token.replace(/['’]\p{L}{1,6}$/u, "");

/** C#, Node.js, CI/CD, .NET, ES2023, TypeScript, AWS: always kept. */
export function isTechToken(token: string): boolean {
  if (!/\p{L}/u.test(token) || ABBREVIATION.test(token)) return false;
  return (
    /[\d+#/]|\.\p{L}/u.test(token) || /^\p{Lu}{2,6}$/u.test(token) || /^\p{L}+\p{Lu}\p{L}*$/u.test(token)
  );
}

interface Candidate {
  keyword: string;
  count: number;
  tech: boolean;
  /** Capitalised somewhere other than a sentence start (a name: "Kubernetes", "Jira"). */
  proper: boolean;
  /** First position, for a stable reading order. */
  first: number;
}

interface Word {
  readonly token: string;
  readonly stop: boolean;
  readonly tech: boolean;
  readonly proper: boolean;
  /** Only spaces separate it from the previous word. */
  readonly joined: boolean;
}

/** Most keywords a posting yields; past that it's noise for a 360 px panel. */
const MAX_KEYWORDS = 30;

/**
 * `language` is the CV's: German capitalises every noun, so there capitals don't mark names.
 */
export function extractJobKeywords(jobDescription: string, language: CvLanguage): JobKeyword[] {
  const candidates = new Map<string, Candidate>();
  let position = 0;
  const add = (keyword: string, { tech, proper }: { tech: boolean; proper: boolean }): void => {
    const key = foldText(keyword);
    const existing = candidates.get(key);
    if (existing) {
      existing.count += 1;
      existing.proper ||= proper;
      return;
    }
    candidates.set(key, { keyword, count: 1, tech, proper, first: position++ });
  };

  for (const sentence of jobDescription.normalize("NFKC").split(SENTENCE_BREAK)) {
    const matches = [...sentence.matchAll(TOKEN)];
    const capitalised = matches.filter((match) => /^\p{Lu}/u.test(match[0])).length;
    // A Title Case line is a heading ("What You Will Bring"): its capitals say nothing.
    const titleCase = matches.length >= 3 && capitalised / matches.length >= 0.7;
    const words: Word[] = [];
    let previousEnd = -1;
    for (const match of matches) {
      const start = match.index ?? 0;
      let joined = previousEnd >= 0 && PAIR_GAP.test(sentence.slice(previousEnd, start));
      previousEnd = start + match[0].length;
      const raw = stripApostropheSuffix(match[0]);
      // "CI/CD", "UI/UX", "TCP/IP" are one term; "Kubernetes/Docker" are two.
      const parts = ACRONYM_PAIR.test(raw) ? [raw] : raw.split("/").filter((part) => part !== "");
      for (const token of parts) {
        const folded = foldText(token);
        const tech = isTechToken(token);
        const stop =
          (STOPWORDS.has(folded) && !/[\d+#/.]/u.test(token)) ||
          (!tech && (/^\d+$/u.test(token) || folded.length < 3));
        const proper = language !== "de" && !titleCase && words.length > 0 && /^\p{Lu}/u.test(token);
        words.push({ token, stop, tech, proper, joined });
        joined = false;
      }
    }
    words.forEach((word, index) => {
      if (word.stop) return;
      add(word.token, word);
      const next = words[index + 1];
      if (next && next.joined && !next.stop)
        add(`${word.token} ${next.token}`, { tech: false, proper: word.proper && next.proper });
    });
  }

  const all = [...candidates.values()];
  const pairs = all.filter((candidate) => candidate.keyword.includes(" "));
  // A pair worth keeping: repeated, or a two-word name ("Google Cloud", "React Native").
  const keptPairs = pairs.filter((pair) => pair.count >= 2 || pair.proper);
  const pairWords = new Map<string, number>();
  for (const pair of keptPairs)
    for (const word of foldText(pair.keyword).split(" "))
      pairWords.set(word, Math.max(pairWords.get(word) ?? 0, pair.count));

  const keptWords = all.filter(
    (candidate) =>
      !candidate.keyword.includes(" ") &&
      (candidate.tech || candidate.proper || candidate.count >= 2) &&
      // A word that only ever appears inside a kept pair is covered by the pair.
      (pairWords.get(foldText(candidate.keyword)) ?? 0) < candidate.count,
  );

  const weight = (candidate: Candidate): number =>
    candidate.count +
    (candidate.tech ? 2 : 0) +
    (candidate.proper ? 1 : 0) +
    (candidate.keyword.includes(" ") ? 1 : 0);
  return [...keptPairs, ...keptWords]
    .sort((a, b) => weight(b) - weight(a) || a.first - b.first)
    .slice(0, MAX_KEYWORDS)
    .sort((a, b) => a.first - b.first)
    .map(({ keyword, count }) => ({ keyword, count }));
}
