import type { DesignSearch } from "./matrix";

/** Design-only route params on top of `DesignSearch`. */
export interface DesignParams extends DesignSearch {
  /** `?theme=light|dark` forces the appearance (a plain browser can't switch the OS setting). */
  readonly theme: "light" | "dark" | null;
  /**
   * `?locale=en-GB` pins the UI language and formatting locale (BCP 47), overriding the OS locale,
   * so macOS, Windows and harness captures render the same text. Null when absent or invalid.
   */
  readonly locale: string | null;
  /** `?tz=Europe/Istanbul` pins the time zone view-models format in (IANA). Null when absent or invalid. */
  readonly tz: string | null;
  /** Remaining string params, passed to the screen as `params` (e.g. `folder=updates`). */
  readonly rest: Readonly<Record<string, string>>;
}

const RESERVED: Readonly<Record<string, true>> = {
  fixture: true,
  state: true,
  theme: true,
  platform: true,
  locale: true,
  tz: true,
};

function validLocale(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  try {
    return Intl.getCanonicalLocales(value)[0] ?? null;
  } catch {
    return null;
  }
}

function validTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** Reads `?fixture=…&state=…&theme=…&locale=…&tz=…`; unknown keys go to `rest`. */
export function readDesignParams(search: Readonly<Record<string, unknown>>): DesignParams {
  const { fixture, state, theme, locale, tz } = search;
  const rest: Record<string, string> = {};
  for (const [key, value] of Object.entries(search))
    if (!RESERVED[key] && (typeof value === "string" || typeof value === "number")) rest[key] = String(value);
  return {
    fixture: fixture === "empty" || fixture === "scaled" ? fixture : "populated",
    state: state === "loading" || state === "error" || state === "offline" ? state : "ready",
    theme: theme === "light" || theme === "dark" ? theme : null,
    locale: validLocale(locale),
    tz: validTimeZone(tz),
    rest,
  };
}
