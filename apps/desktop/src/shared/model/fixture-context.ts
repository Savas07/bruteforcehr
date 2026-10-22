/**
 * The model context for fixture data: the fixture clock, the persona's time zone and, unless the
 * caller passes the app's `IntlShape`, English (en-GB). Used by view-model tests and the design
 * build only. Never import from production code (it pulls in @bfhr/fixtures).
 */
import { FIXTURE_NOW, type FixtureDataset } from "@bfhr/fixtures";
import type { IntlShape } from "react-intl";
import { createAppIntl } from "../../i18n/intl";
import type { ModelContext } from "./types";

const englishIntl = createAppIntl({ language: "en", locale: "en-GB" });

export function fixtureContext(
  data: FixtureDataset,
  pendingWrites: Iterable<string> = [],
  intl: IntlShape = englishIntl,
): ModelContext {
  return {
    now: FIXTURE_NOW,
    locale: intl.locale,
    intl,
    timeZone: data.profile.timezone,
    pendingWrites: new Set(pendingWrites),
  };
}
