/**
 * The model context for fixture data: the fixture clock, en-GB formatting and the persona's time
 * zone. Used by view-model tests and the design build only. Never import from production code
 * (it pulls in @bfhr/fixtures).
 */
import { FIXTURE_NOW, type FixtureDataset } from "@bfhr/fixtures";
import type { ModelContext } from "./types";

export function fixtureContext(data: FixtureDataset, pendingWrites: Iterable<string> = []): ModelContext {
  return {
    now: FIXTURE_NOW,
    locale: "en-GB",
    timeZone: data.profile.timezone,
    pendingWrites: new Set(pendingWrites),
  };
}
