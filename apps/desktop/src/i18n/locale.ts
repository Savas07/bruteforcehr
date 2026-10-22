/**
 * Which UI language and formatting locale the app uses. The OS locale comes from the shell
 * (`__BFHR_CHROME__.locale`, sys-locale in src-tauri/src/window.rs); English is the fallback.
 * TR copy uses "siz", DE copy uses "du" (decisions.md U1).
 */
export const uiLanguages = ["en", "tr", "de"] as const;
export type UiLanguage = (typeof uiLanguages)[number];

/** Formatting locale when the OS tag's language isn't the UI language (24 h for TR / DE). */
const DEFAULT_LOCALES: Readonly<Record<UiLanguage, string>> = { en: "en-GB", tr: "tr-TR", de: "de-DE" };

export interface AppLocale {
  readonly language: UiLanguage;
  /** BCP 47 tag for `Intl` formatting: the OS tag when it matches the language ("de-AT"). */
  readonly locale: string;
}

/** The first tag (OS locale, then browser languages) whose language the UI supports, else English. */
export function resolveAppLocale(tags: readonly (string | null | undefined)[]): AppLocale {
  for (const tag of tags) {
    if (!tag) continue;
    let canonical: string;
    try {
      [canonical = ""] = Intl.getCanonicalLocales(tag.replace("_", "-"));
    } catch {
      continue;
    }
    const language = canonical.split("-")[0];
    const match = uiLanguages.find((candidate) => candidate === language);
    if (match)
      return { language: match, locale: canonical.includes("-") ? canonical : DEFAULT_LOCALES[match] };
  }
  return { language: "en", locale: DEFAULT_LOCALES.en };
}
