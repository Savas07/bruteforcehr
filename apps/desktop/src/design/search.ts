import type { DesignSearch } from "./matrix";

/** Design-only route params on top of `DesignSearch` (`theme` forces light / dark in a browser). */
export interface DesignParams extends DesignSearch {
  readonly theme: "light" | "dark" | null;
  /** Remaining string params, passed to the screen as `params` (e.g. `folder=updates`). */
  readonly rest: Readonly<Record<string, string>>;
}

const RESERVED: Readonly<Record<string, true>> = {
  fixture: true,
  state: true,
  theme: true,
  platform: true,
  locale: true,
};

/** Reads `?fixture=populated|empty&state=ready|loading|error|offline&theme=light|dark`. */
export function readDesignParams(search: Readonly<Record<string, unknown>>): DesignParams {
  const { fixture, state, theme } = search;
  const rest: Record<string, string> = {};
  for (const [key, value] of Object.entries(search))
    if (!RESERVED[key] && (typeof value === "string" || typeof value === "number")) rest[key] = String(value);
  return {
    fixture: fixture === "empty" ? "empty" : "populated",
    state: state === "loading" || state === "error" || state === "offline" ? state : "ready",
    theme: theme === "light" || theme === "dark" ? theme : null,
    rest,
  };
}
