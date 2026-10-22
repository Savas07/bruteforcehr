/**
 * The app's `IntlShape` (react-intl / ICU MessageFormat). One per window: React reads it through
 * `RawIntlProvider` (main.tsx), view-model builders through `ModelContext.intl`.
 *
 * Catalogs: `en.json` is generated from the `defaultMessage`s in the code (`pnpm i18n:extract`);
 * `tr.json` and `de.json` are translated by hand. Keys missing from TR / DE fall back to English
 * (`pnpm i18n:check` reports them).
 */
import { createIntl, createIntlCache, type IntlShape } from "react-intl";
import de from "./de.json";
import en from "./en.json";
import type { AppLocale, UiLanguage } from "./locale";
import tr from "./tr.json";

const catalogs: Readonly<Record<UiLanguage, Readonly<Record<string, string>>>> = { en, tr, de };

const cache = createIntlCache();

export function createAppIntl({ language, locale }: AppLocale): IntlShape {
  return createIntl(
    {
      locale,
      defaultLocale: "en",
      messages: { ...catalogs.en, ...catalogs[language] },
      // Missing translations already fall back to English above; anything else is a real error.
      onError: (error) => {
        if (error.code !== "MISSING_TRANSLATION") console.error(error);
      },
    },
    cache,
  );
}
