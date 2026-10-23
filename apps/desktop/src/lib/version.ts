/**
 * Semantic-version precedence (semver.org §11) for the minimum-version gate. Versions are
 * `SemverSchema` strings from @bfhr/core (`1.4.0`, `1.5.0-beta.2`, no build metadata).
 */
import { SemverSchema } from "@bfhr/core";

interface Parsed {
  readonly core: readonly [number, number, number];
  readonly prerelease: readonly string[];
}

function parse(version: string): Parsed | null {
  if (!SemverSchema.safeParse(version).success) return null;
  const [core = "", prerelease] = version.split(/-(.*)/s, 2);
  const [major = 0, minor = 0, patch = 0] = core.split(".").map(Number);
  return { core: [major, minor, patch], prerelease: prerelease ? prerelease.split(".") : [] };
}

const numeric = /^\d+$/;

function compareIdentifiers(a: string, b: string): number {
  const aNumeric = numeric.test(a);
  const bNumeric = numeric.test(b);
  if (aNumeric && bNumeric) return Math.sign(Number(a) - Number(b));
  // Numeric identifiers sort before alphanumeric ones.
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** -1, 0 or 1 by semver precedence; null when either isn't a valid version. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;
  for (const [index, part] of left.core.entries()) {
    const difference = Math.sign(part - (right.core[index] ?? 0));
    if (difference !== 0) return difference as -1 | 1;
  }
  // A pre-release sorts before its release (1.0.0-beta < 1.0.0).
  if (left.prerelease.length === 0 || right.prerelease.length === 0)
    return Math.sign(right.prerelease.length - left.prerelease.length) as -1 | 0 | 1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const l = left.prerelease[index];
    const r = right.prerelease[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const difference = compareIdentifiers(l, r);
    if (difference !== 0) return difference as -1 | 1;
  }
  return 0;
}

/** True only when both versions are valid and `current` is below `minimum`. */
export function isBelowMinimum(current: string, minimum: string): boolean {
  return compareVersions(current, minimum) === -1;
}
