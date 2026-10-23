/**
 * Release versions (docs/adr/0004-release-updates-signing.md §1): one shared `X.Y.Z` for every app,
 * tag `vX.Y.Z` (stable) or `vX.Y.Z-beta.N` (beta channel).
 */

export type Channel = "stable" | "beta";

export interface ReleaseVersion {
  /** Full app version, e.g. `0.2.0` or `0.2.0-beta.1`. */
  readonly version: string;
  /** Git tag, `v` + version. */
  readonly tag: string;
  readonly channel: Channel;
  /** `X.Y.Z` without the pre-release part (iOS `MARKETING_VERSION` must be numeric). */
  readonly marketingVersion: string;
}

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/;

/** Parses a release version (`X.Y.Z` or `X.Y.Z-beta.N`); anything else is not a release. */
export function parseVersion(version: string): ReleaseVersion {
  const match = VERSION.exec(version);
  if (!match) {
    throw new Error(`"${version}" is not a release version (expected X.Y.Z or X.Y.Z-beta.N)`);
  }
  return {
    version,
    tag: `v${version}`,
    channel: match[4] === undefined ? "stable" : "beta",
    marketingVersion: `${match[1]}.${match[2]}.${match[3]}`,
  };
}

/** Parses a release tag (`vX.Y.Z` or `vX.Y.Z-beta.N`). */
export function parseTag(tag: string): ReleaseVersion {
  if (!tag.startsWith("v")) {
    throw new Error(`"${tag}" is not a release tag (expected vX.Y.Z or vX.Y.Z-beta.N)`);
  }
  return parseVersion(tag.slice(1));
}

/**
 * Semver precedence for release versions: numeric parts first, then a pre-release sorts before
 * its release (`0.2.0-beta.3` < `0.2.0`).
 */
export function compareVersions(a: string, b: string): number {
  const pa = VERSION.exec(a);
  const pb = VERSION.exec(b);
  if (!pa || !pb) {
    throw new Error(`Cannot compare "${a}" and "${b}": not release versions`);
  }
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return Math.sign(diff);
  }
  if (pa[4] === undefined && pb[4] === undefined) return 0;
  if (pa[4] === undefined) return 1;
  if (pb[4] === undefined) return -1;
  return Math.sign(Number(pa[4]) - Number(pb[4]));
}
