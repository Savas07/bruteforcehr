/**
 * The type-to-confirm rule of "Delete everything" (same on iOS): the typed text matches the
 * localized word (DELETE / SİL / LÖSCHEN) ignoring case and surrounding spaces. Both sides are
 * lower-cased twice, with the root rules and with the app locale's, and either pair may match;
 * folding then maps the dotless "ı" to "i" and drops the combining dot above (U+0307), so in
 * Turkish "SIL", "sil" and "SİL" all confirm. Other letters stay distinct: "LOSCHEN" isn't "LÖSCHEN".
 */

/** Turkish i variants after lower-casing: "ı" → "i", and "İ".toLowerCase() = "i̇" → "i". */
function foldDots(lowered: string): string {
  return lowered.replaceAll("ı", "i").replaceAll("\u0307", "");
}

/** True when `input` confirms `word` for an app formatting in `locale` (a BCP 47 tag). */
export function matchesConfirmWord(input: string, word: string, locale: string): boolean {
  const typed = input.normalize("NFC").trim();
  if (typed === "") return false;
  const target = word.normalize("NFC").trim();
  return (
    foldDots(typed.toLowerCase()) === foldDots(target.toLowerCase()) ||
    foldDots(typed.toLocaleLowerCase(locale)) === foldDots(target.toLocaleLowerCase(locale))
  );
}
