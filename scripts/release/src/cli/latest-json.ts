/**
 * Builds `latest.json` from the release assets in `--dir` after verifying both updater signatures
 * against the public key the app embeds (`plugins.updater.pubkey` in tauri.conf.json), exactly as
 * the updater will.
 *
 *   tsx src/cli/latest-json.ts --version 0.1.0 --dir assets --notes notes.md \
 *     --tauri-config ../../apps/desktop/src-tauri/tauri.conf.json --out assets/latest.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { assetNames, buildLatestJson } from "../latest-json";
import { keyIdHex, parsePublicKey, verifySignature } from "../minisign";
import { parseVersion } from "../version";

const { values } = parseArgs({
  options: {
    version: { type: "string" },
    dir: { type: "string" },
    notes: { type: "string" },
    "tauri-config": { type: "string" },
    out: { type: "string" },
  },
});
const { version: versionArg, dir, notes, "tauri-config": tauriConfig, out } = values;
if (!versionArg || !dir || !notes || !tauriConfig || !out) {
  throw new Error("--version, --dir, --notes, --tauri-config and --out are required");
}
const { version } = parseVersion(versionArg);

const config = JSON.parse(readFileSync(tauriConfig, "utf8")) as {
  plugins?: { updater?: { pubkey?: string } };
};
const pubkey = config.plugins?.updater?.pubkey;
if (!pubkey) throw new Error(`${tauriConfig} has no plugins.updater.pubkey`);
console.log(`Updater public key ${keyIdHex(parsePublicKey(pubkey).keyId)}`);

const names = assetNames(version);
/** Reads `<name>.sig` and verifies it against `<name>`; the updater would reject anything else. */
const verifiedSignature = (name: string): string => {
  const signature = readFileSync(join(dir, `${name}.sig`), "utf8");
  const trusted = verifySignature(pubkey, readFileSync(join(dir, name)), signature);
  console.log(`Verified ${name}.sig (${trusted})`);
  return signature;
};

const manifest = buildLatestJson({
  version,
  notes: readFileSync(notes, "utf8").trim(),
  pubDate: new Date(),
  macSignature: verifiedSignature(names.macUpdater),
  windowsSignature: verifiedSignature(names.windowsInstaller),
});
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${out} for ${version}: ${Object.keys(manifest.platforms).join(", ")}`);
