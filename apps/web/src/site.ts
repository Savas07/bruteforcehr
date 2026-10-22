/** Site-wide constants shared by the layout, the Astro config and the capture script. */

export const SITE_URL = "https://bruteforcehr.web.app";
export const SITE_NAME = "BruteForceHR";

export const LOCALES = ["en", "tr", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/**
 * Browser UI colour per scheme (`<meta name="theme-color">`) and the page canvas behind it.
 * Neutral system values until `@bfhr/ui-tokens` lands; then both come from the token package.
 */
export const THEME_COLOR = {
  light: "#ffffff",
  dark: "#111113",
} as const;
