import { AppConfigSchema, PlatformSchema, type AppConfig, type Platform } from "@bfhr/core";
import { z } from "zod";
import { REPO, assetNames, assetUrl } from "./latest-json";
import { compareVersions } from "./version";

/**
 * `appConfig/{platform}` documents written by the release `publish` job (ADR 0004 §2, schema in
 * @bfhr/core). `minSupportedVersion` comes from the committed `min-supported-versions.json`, so
 * raising it is an explicit, reviewed commit and never a side effect of releasing.
 */

export const MinSupportedVersionsSchema = z
  .record(PlatformSchema, z.string())
  .refine(
    (value) => PlatformSchema.options.every((platform) => platform in value),
    "Every platform needs a minimum supported version",
  );
export type MinSupportedVersions = Record<Platform, string>;

export function buildAppConfig(input: {
  platform: Platform;
  version: string;
  minSupportedVersion: string;
  /** Flags already in Firestore; a release never changes them. */
  featureFlags: Readonly<Record<string, boolean>> | undefined;
  now: Date;
}): AppConfig {
  if (compareVersions(input.minSupportedVersion, input.version) > 0) {
    throw new Error(
      `${input.platform}: minSupportedVersion ${input.minSupportedVersion} is above the released version ${input.version}`,
    );
  }
  const names = assetNames(input.version);
  const downloadUrl: Record<Platform, string | null> = {
    macos: assetUrl(input.version, names.macDmg),
    windows: assetUrl(input.version, names.windowsInstaller),
    // TestFlight is invite-only; the app updates from TestFlight, not from a URL.
    ios: null,
  };
  return AppConfigSchema.parse({
    id: input.platform,
    latestVersion: input.version,
    minSupportedVersion: input.minSupportedVersion,
    downloadUrl: downloadUrl[input.platform],
    releaseNotesUrl: `https://github.com/${REPO}/releases/tag/v${input.version}`,
    featureFlags: { ...input.featureFlags },
    updatedAt: input.now,
  });
}
