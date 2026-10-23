/**
 * Static Tauri updater manifest (https://v2.tauri.app/plugin/updater/#static-json-file):
 * `version`, `notes`, `pub_date` (RFC 3339) and `platforms.<os>-<arch>.{url, signature}`, where
 * `signature` is the `.sig` file content. Tauri validates the whole file before it checks the
 * version, so every platform entry must be complete.
 */

export const REPO = "Savas07/bruteforcehr";

/** Release asset names; the website's download page matches the installer suffixes. */
export function assetNames(version: string) {
  return {
    macUpdater: `BruteForceHR_${version}_universal.app.tar.gz`,
    macDmg: `BruteForceHR_${version}_universal.dmg`,
    windowsInstaller: `BruteForceHR_${version}_x64-setup.exe`,
  } as const;
}

/** Download URL pinned to the tag (never `latest`, so an old manifest keeps pointing at its files). */
export function assetUrl(version: string, asset: string): string {
  return `https://github.com/${REPO}/releases/download/v${version}/${asset}`;
}

export interface LatestJson {
  readonly version: string;
  readonly notes: string;
  readonly pub_date: string;
  readonly platforms: Readonly<Record<string, { readonly url: string; readonly signature: string }>>;
}

export function buildLatestJson(input: {
  version: string;
  notes: string;
  pubDate: Date;
  macSignature: string;
  windowsSignature: string;
}): LatestJson {
  const names = assetNames(input.version);
  // One universal bundle serves both Mac architectures.
  const mac = { url: assetUrl(input.version, names.macUpdater), signature: input.macSignature.trim() };
  return {
    version: input.version,
    notes: input.notes,
    pub_date: input.pubDate.toISOString(),
    platforms: {
      "darwin-aarch64": mac,
      "darwin-x86_64": mac,
      "windows-x86_64": {
        url: assetUrl(input.version, names.windowsInstaller),
        signature: input.windowsSignature.trim(),
      },
    },
  };
}
