import { emptyDataset, type FixtureDataset, populatedDataset, scaledDataset } from "@bfhr/fixtures";
import type { DesignSearch } from "./matrix";

let scaled: FixtureDataset | undefined;

/**
 * The dataset a route's `?fixture=` picks. The scaled one (5,000 jobs, 1,000 applications, for
 * scripts/perf-scroll.ts) is built on first use and kept, so its stores survive navigation like
 * the others.
 */
export function designDataset(fixture: DesignSearch["fixture"]): FixtureDataset {
  if (fixture === "empty") return emptyDataset;
  if (fixture === "populated") return populatedDataset;
  scaled ??= scaledDataset();
  return scaled;
}
